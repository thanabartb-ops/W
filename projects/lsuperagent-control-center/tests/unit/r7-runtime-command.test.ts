/**
 * R7 Runtime Command — RED test suite
 *
 * Path (in W repo):
 *   projects/lsuperagent-control-center/tests/unit/r7-runtime-command.test.ts
 *
 * Status: RED — these tests MUST fail until production implementation is complete.
 * Do NOT modify tests to make them pass; fix the production code instead.
 *
 * Covers (per Notion page 14 — P0 Runtime Gateway Update 2026-08-30):
 *   1. Fail-closed security order
 *   2. RUNTIME_SHARED_SECRET enforcement (before body / JWT / provider)
 *   3. Provider-neutral execution contract
 *   4. EXECUTED response validation (no schema regression)
 *   5. Health check dependency accuracy
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Type stubs — replace with actual imports once implementation exists
// ---------------------------------------------------------------------------

interface RuntimeResponse {
  status: "EXECUTED" | "FAILED" | "PENDING";
  provider: string;
  runtime_version: string;
  model: string;
  provider_request_id: string;
  correlation_id: string;
  qa_run_id: string;
}

interface GatewayRequest {
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

interface GatewayResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Module under test
// Adjust import path to match actual W repo structure once it exists.
// Currently a non-existent path → causes RED (import error / module not found).
// ---------------------------------------------------------------------------

// @ts-expect-error — module does not exist yet (RED)
import { handleRuntimeCommand } from "../../src/routes/api/chat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_RUNTIME_SECRET = "test-runtime-shared-secret-32chars!";
const VALID_USER_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEiLCJleHAiOjk5OTk5OTk5OTl9.sig";

function makeRequest(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    headers: {
      "x-lsuperagent-runtime-secret": VALID_RUNTIME_SECRET,
      authorization: `Bearer ${VALID_USER_JWT}`,
      "content-type": "application/json",
      ...overrides.headers,
    },
    body: {
      message: "Hello",
      session_id: "sess_test_001",
      ...overrides.body,
    },
    ...overrides,
  };
}

function makeValidRuntimeResponse(
  overrides: Partial<RuntimeResponse> = {}
): RuntimeResponse {
  return {
    status: "EXECUTED",
    provider: "claude",
    runtime_version: "v1.0.0",
    model: "claude-sonnet-4-6",
    provider_request_id: "req_abc123",
    correlation_id: "corr_xyz789",
    qa_run_id: "qa_run_001",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. RUNTIME_SHARED_SECRET — must be checked BEFORE body / JWT / provider
// ---------------------------------------------------------------------------

describe("1. RUNTIME_SHARED_SECRET enforcement (fail-closed)", () => {
  it("returns 403 when x-lsuperagent-runtime-secret header is missing", async () => {
    const req = makeRequest({ headers: { authorization: `Bearer ${VALID_USER_JWT}` } });
    const res: GatewayResponse = await handleRuntimeCommand(req);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 403 when x-lsuperagent-runtime-secret is wrong", async () => {
    const req = makeRequest({
      headers: {
        "x-lsuperagent-runtime-secret": "wrong-secret",
        authorization: `Bearer ${VALID_USER_JWT}`,
      },
    });
    const res: GatewayResponse = await handleRuntimeCommand(req);

    expect(res.statusCode).toBe(403);
  });

  it("does NOT invoke provider when runtime secret is invalid", async () => {
    const mockProvider = vi.fn();
    const req = makeRequest({
      headers: { "x-lsuperagent-runtime-secret": "bad" },
    });

    await handleRuntimeCommand(req, { providerCallSpy: mockProvider });

    // Provider must never be called when gateway identity check fails
    expect(mockProvider).not.toHaveBeenCalled();
  });

  it("does NOT parse body when runtime secret is invalid", async () => {
    // Body parsing after a 403 would be a security boundary violation
    const mockBodyParser = vi.fn();
    const req = makeRequest({
      headers: { "x-lsuperagent-runtime-secret": "bad" },
    });

    await handleRuntimeCommand(req, { bodyParserSpy: mockBodyParser });

    expect(mockBodyParser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. User JWT — validated AFTER gateway secret, separately
// ---------------------------------------------------------------------------

describe("2. User JWT validation (after gateway secret check)", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const req = makeRequest({
      headers: { "x-lsuperagent-runtime-secret": VALID_RUNTIME_SECRET },
    });
    const res: GatewayResponse = await handleRuntimeCommand(req);

    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when JWT is malformed", async () => {
    const req = makeRequest({
      headers: {
        "x-lsuperagent-runtime-secret": VALID_RUNTIME_SECRET,
        authorization: "Bearer not.a.valid.jwt",
      },
    });
    const res: GatewayResponse = await handleRuntimeCommand(req);

    expect(res.statusCode).toBe(401);
  });

  it("does NOT invoke provider when JWT is invalid", async () => {
    const mockProvider = vi.fn();
    const req = makeRequest({
      headers: {
        "x-lsuperagent-runtime-secret": VALID_RUNTIME_SECRET,
        authorization: "Bearer bad-token",
      },
    });

    await handleRuntimeCommand(req, { providerCallSpy: mockProvider });

    expect(mockProvider).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Body validation
// ---------------------------------------------------------------------------

describe("3. Request body validation", () => {
  it("returns 400 when body is missing", async () => {
    const req = makeRequest({ body: undefined });
    const res: GatewayResponse = await handleRuntimeCommand(req);

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when message field is absent", async () => {
    const req = makeRequest({ body: { session_id: "sess_001" } });
    const res: GatewayResponse = await handleRuntimeCommand(req);

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. Provider-neutral execution contract
// ---------------------------------------------------------------------------

describe("4. Provider-neutral execution contract", () => {
  it("accepts EXECUTED from claude provider", async () => {
    const runtimeRes = makeValidRuntimeResponse({ provider: "claude", model: "claude-sonnet-4-6" });
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "EXECUTED" });
  });

  it("accepts EXECUTED from xai provider", async () => {
    const runtimeRes = makeValidRuntimeResponse({ provider: "xai", model: "grok-2" });
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "EXECUTED" });
  });

  it("top-level Gateway provider mirrors runtime provider (not hardcoded xai)", async () => {
    const runtimeRes = makeValidRuntimeResponse({ provider: "claude" });
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
    });

    // Must NOT hardcode "xai" — must reflect the actual runtime provider
    expect(res.body.provider).toBe("claude");
    expect(res.body.provider).not.toBe("xai");
  });

  it("rejects EXECUTED with empty provider field", async () => {
    const runtimeRes = makeValidRuntimeResponse({ provider: "" });
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
    });

    expect(res.statusCode).toBe(502);
  });

  it("rejects EXECUTED with empty model field", async () => {
    const runtimeRes = makeValidRuntimeResponse({ model: "" });
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
    });

    expect(res.statusCode).toBe(502);
  });

  it("rejects EXECUTED with missing provider_request_id", async () => {
    const runtimeRes = makeValidRuntimeResponse({ provider_request_id: "" });
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
    });

    expect(res.statusCode).toBe(502);
  });

  it("rejects EXECUTED with missing correlation_id", async () => {
    const runtimeRes = makeValidRuntimeResponse({ correlation_id: "" });
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
    });

    expect(res.statusCode).toBe(502);
  });

  it("rejects EXECUTED with missing qa_run_id", async () => {
    const runtimeRes = makeValidRuntimeResponse({ qa_run_id: "" });
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
    });

    expect(res.statusCode).toBe(502);
  });

  it("rejects EXECUTED with missing runtime_version", async () => {
    const runtimeRes = makeValidRuntimeResponse({ runtime_version: "" });
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
    });

    expect(res.statusCode).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// 5. Metric persistence — must succeed before returning EXECUTED
// ---------------------------------------------------------------------------

describe("5. Metric persistence failure handling", () => {
  it("returns 500 when metric insert fails", async () => {
    const runtimeRes = makeValidRuntimeResponse();
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: runtimeRes,
      mockMetricInsertFailure: true,
    });

    // Must NOT return EXECUTED when metric persistence fails
    expect(res.statusCode).toBe(500);
    expect(res.body.status).not.toBe("EXECUTED");
  });
});

// ---------------------------------------------------------------------------
// 6. Rate limiting
// ---------------------------------------------------------------------------

describe("6. Rate limiting", () => {
  it("returns 429 when rate limit is exceeded for user", async () => {
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRateLimitExceeded: true,
    });

    expect(res.statusCode).toBe(429);
  });

  it("does NOT invoke provider when rate limit exceeded", async () => {
    const mockProvider = vi.fn();
    const req = makeRequest();

    await handleRuntimeCommand(req, {
      mockRateLimitExceeded: true,
      providerCallSpy: mockProvider,
    });

    expect(mockProvider).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. Provider / config not ready
// ---------------------------------------------------------------------------

describe("7. Provider not configured", () => {
  it("returns 503 when provider config is missing", async () => {
    const req = makeRequest();

    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockProviderMissing: true,
    });

    expect(res.statusCode).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// 8. Health check accuracy (P0 CodeRabbit finding)
// ---------------------------------------------------------------------------

describe("8. Health check dependency accuracy", () => {
  it("health endpoint returns not-ready when metric_events table is unavailable", async () => {
    // @ts-expect-error — module does not exist yet (RED)
    const { handleHealthCheck } = await import("../../src/routes/api/health");

    const res: GatewayResponse = await handleHealthCheck({
      mockMetricEventsUnavailable: true,
    });

    // database:CONNECTED alone must NOT return healthy when execution dependency is broken
    expect(res.statusCode).not.toBe(200);
    expect(res.body.ready).toBe(false);
  });

  it("health endpoint reflects actual provider config readiness", async () => {
    // @ts-expect-error — module does not exist yet (RED)
    const { handleHealthCheck } = await import("../../src/routes/api/health");

    const res: GatewayResponse = await handleHealthCheck({
      mockProviderMissing: true,
    });

    expect(res.body.provider_ready).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. RUNTIME_SHARED_SECRET must NOT appear in NEXT_PUBLIC_* or response
// ---------------------------------------------------------------------------

describe("9. Secret discipline", () => {
  it("RUNTIME_SHARED_SECRET is never echoed in any response body", async () => {
    const req = makeRequest();
    const res: GatewayResponse = await handleRuntimeCommand(req, {
      mockRuntimeResponse: makeValidRuntimeResponse(),
    });

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain(VALID_RUNTIME_SECRET);
  });

  it("RUNTIME_SHARED_SECRET is not set as a NEXT_PUBLIC_ env var", () => {
    // This test verifies env discipline at the process level
    const publicKeys = Object.keys(process.env).filter((k) =>
      k.startsWith("NEXT_PUBLIC_")
    );
    const leaking = publicKeys.find(
      (k) => process.env[k] === VALID_RUNTIME_SECRET
    );
    expect(leaking).toBeUndefined();
  });
});
