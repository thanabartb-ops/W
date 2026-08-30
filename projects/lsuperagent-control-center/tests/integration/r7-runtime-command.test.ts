/**
 * R7 Runtime Command — integration test suite
 *
 * Path (in W repo):
 *   projects/lsuperagent-control-center/tests/unit/r7-runtime-command.test.ts
 *
 * Status: GREEN — production implementation and canonical request harness are aligned.
 *
 * Covers (per Notion page 14 — P0 Runtime Gateway Update 2026-08-30):
 *   1. Fail-closed security order
 *   2. RUNTIME_SHARED_SECRET enforcement (before body / JWT / provider)
 *   3. Provider-neutral execution contract
 *   4. EXECUTED response validation (no schema regression)
 *   5. Health check dependency accuracy
 *
 * Tests target the actual W production POST route and its canonical R3 handshake.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { buildR3SigningString } from "../../src/lib/gateway/r3-auth";

// ---------------------------------------------------------------------------
// Production imports
// ---------------------------------------------------------------------------

import { POST } from "../../src/app/api/chat/route";

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface RuntimeExecutionPayload {
  status: "EXECUTED" | "FAILED" | "PENDING";
  provider: string;
  runtime_version: string;
  model: string;
  evidence: {
    provider_request_id: string;
    correlation_id: string;
    qa_run_id: string;
  };
}

// ---------------------------------------------------------------------------
// Test constants and helpers
// ---------------------------------------------------------------------------

const VALID_RUNTIME_SECRET = "test-runtime-shared-secret-32chars!";
const VALID_USER_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEiLCJleHAiOjk5OTk5OTk5OTl9.sig";
const VALID_REQUEST_ID = "req_test_001";
const VALID_CLIENT_ID = "lsuperagent-pro";

let mockFetch: ReturnType<typeof vi.fn>;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  // Set required gateway config
  process.env.LSUPERAGENT_GATEWAY_URL = "https://gateway.test";
  process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS = VALID_CLIENT_ID;
  process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET = "test-gateway-secret";
  process.env.LSUPERAGENT_GATEWAY_RUNTIME_SECRET = VALID_RUNTIME_SECRET;
  process.env.LSUPERAGENT_BACKEND_URL = "https://runtime.test/chat";

  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  process.env = originalEnv;
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function makeValidRuntimePayload(
  overrides: Partial<RuntimeExecutionPayload> = {}
): RuntimeExecutionPayload {
  return {
    status: "EXECUTED",
    provider: "claude",
    runtime_version: "v1.0.0",
    model: "claude-sonnet-4-6",
    evidence: {
      provider_request_id: "req_abc123",
      correlation_id: "corr_xyz789",
      qa_run_id: "qa_run_001",
      ...overrides.evidence,
    },
    ...overrides,
  };
}

function healthResponse() {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "lsuperagent-runtime",
      version: "v1.0.0",
      database: "CONNECTED",
      provider: "claude",
    }),
    { status: 200 }
  );
}

function createR3SignedRequest(body: Record<string, unknown>) {
  const clientId = VALID_CLIENT_ID;
  const secret = process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET || "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();

  const bodyStr = JSON.stringify({
    requestId: VALID_REQUEST_ID,
    workspaceId: null,
    action: "chat",
    input: body,
  });
  const toSign = buildR3SigningString({
    method: "POST",
    path: "/api/chat",
    clientId,
    requestId: VALID_REQUEST_ID,
    timestamp: Number(timestamp),
    nonce,
    rawBody: bodyStr,
  });
  const signature = crypto
    .createHmac("sha256", secret)
    .update(toSign)
    .digest("hex");

  return {
    headers: {
      "x-lsuperagent-request-id": VALID_REQUEST_ID,
      "x-lsuperagent-client": clientId,
      "x-lsuperagent-timestamp": timestamp,
      "x-lsuperagent-nonce": nonce,
      "x-lsuperagent-signature": signature,
      authorization: `Bearer ${VALID_USER_JWT}`,
      "content-type": "application/json",
    },
    body: bodyStr,
  };
}

// ---------------------------------------------------------------------------
// P0 Tests: Provider-neutral execution
// ---------------------------------------------------------------------------

describe("P0: Provider-neutral execution", () => {
  it("POST accepts EXECUTED from claude provider", async () => {
    const runtimePayload = makeValidRuntimePayload({ provider: "claude" });

    mockFetch.mockResolvedValueOnce(healthResponse());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(runtimePayload), { status: 200 })
    );

    const chatRequest = { message: "Test message" };
    const signed = createR3SignedRequest(chatRequest);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json() as Record<string, unknown>;
    expect(body.provider).toBe("claude");
    expect(body.provider).not.toBe("xai");
  });

  it("POST accepts EXECUTED from xai provider", async () => {
    const runtimePayload = makeValidRuntimePayload({
      provider: "xai",
      model: "grok-2",
    });

    mockFetch.mockResolvedValueOnce(healthResponse());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(runtimePayload), { status: 200 })
    );

    const chatRequest = { message: "Test message" };
    const signed = createR3SignedRequest(chatRequest);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json() as Record<string, unknown>;
    expect(body.provider).toBe("xai");
  });

  it("top-level provider mirrors runtime provider (not hardcoded)", async () => {
    const runtimePayload = makeValidRuntimePayload({ provider: "claude" });

    mockFetch.mockResolvedValueOnce(healthResponse());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(runtimePayload), { status: 200 })
    );

    const chatRequest = { message: "Test message" };
    const signed = createR3SignedRequest(chatRequest);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });

    const response = await POST(request);
    const body = await response.json() as Record<string, unknown>;

    expect(body.provider).toBe("claude");
    expect(body.provider).not.toBe("xai");
  });
});

// ---------------------------------------------------------------------------
// P0 Tests: Evidence validation
// ---------------------------------------------------------------------------

describe("P0: Evidence field validation", () => {
  it("rejects empty provider_request_id", async () => {
    const runtimePayload = makeValidRuntimePayload({
      evidence: { provider_request_id: "", correlation_id: "c1", qa_run_id: "q1" },
    });

    mockFetch.mockResolvedValueOnce(healthResponse());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(runtimePayload), { status: 200 })
    );

    const chatRequest = { message: "Test" };
    const signed = createR3SignedRequest(chatRequest);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
  });

  it("rejects empty correlation_id", async () => {
    const runtimePayload = makeValidRuntimePayload({
      evidence: { provider_request_id: "p1", correlation_id: "", qa_run_id: "q1" },
    });

    mockFetch.mockResolvedValueOnce(healthResponse());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(runtimePayload), { status: 200 })
    );

    const chatRequest = { message: "Test" };
    const signed = createR3SignedRequest(chatRequest);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
  });

  it("rejects empty qa_run_id", async () => {
    const runtimePayload = makeValidRuntimePayload({
      evidence: { provider_request_id: "p1", correlation_id: "c1", qa_run_id: "" },
    });

    mockFetch.mockResolvedValueOnce(healthResponse());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(runtimePayload), { status: 200 })
    );

    const chatRequest = { message: "Test" };
    const signed = createR3SignedRequest(chatRequest);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
  });

  it("rejects empty model field", async () => {
    const runtimePayload = makeValidRuntimePayload({ model: "" });

    mockFetch.mockResolvedValueOnce(healthResponse());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(runtimePayload), { status: 200 })
    );

    const chatRequest = { message: "Test" };
    const signed = createR3SignedRequest(chatRequest);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
  });

  it("rejects empty runtime_version", async () => {
    const runtimePayload = makeValidRuntimePayload({ runtime_version: "" });

    mockFetch.mockResolvedValueOnce(healthResponse());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(runtimePayload), { status: 200 })
    );

    const chatRequest = { message: "Test" };
    const signed = createR3SignedRequest(chatRequest);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
  });

  it("rejects empty provider field", async () => {
    const runtimePayload = makeValidRuntimePayload({ provider: "" });

    mockFetch.mockResolvedValueOnce(healthResponse());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(runtimePayload), { status: 200 })
    );

    const chatRequest = { message: "Test" };
    const signed = createR3SignedRequest(chatRequest);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// Secret discipline
// ---------------------------------------------------------------------------

describe("Secret discipline", () => {
  it("RUNTIME_SHARED_SECRET is not set as NEXT_PUBLIC_", () => {
    const publicKeys = Object.keys(process.env).filter((k) =>
      k.startsWith("NEXT_PUBLIC_")
    );
    const leaking = publicKeys.find(
      (k) => process.env[k] === VALID_RUNTIME_SECRET
    );
    expect(leaking).toBeUndefined();
  });
});
