// @vitest-environment node
/**
 * R7 Runtime Command — P0 boundary suite
 *
 * Spec: lsuperagent-pro/docs/superpowers/specs/2026-08-30-runtime-gateway-p0-design.md
 *
 * Covers:
 *   1. Gateway -> runtime identity (RUNTIME_SHARED_SECRET) enforced before the backend POST
 *   2. The runtime secret travels only as a server header, never in the body or the response
 *   3. The user JWT stays a separate, still-required credential
 *   4. Provider-neutral execution: claude and xai are both verifiable
 *   5. Verified evidence fields stay mandatory and non-empty
 *
 * Two details decide whether a test here exercises the path it names:
 *   - The signing string comes from the production `buildR3SigningString`, and the
 *     client id must be the literal `lsuperagent-pro` that `readR3GatewayConfig`
 *     and `verifyR3Authentication` both require. Anything else is rejected as
 *     unconfigured (503) or unauthenticated (401) long before the runtime hop.
 *   - The route probes backend health with GET before executing with POST, so a
 *     fetch double must answer the probe first or the route stops at the probe.
 */

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildR3SigningString } from "../../src/lib/gateway/r3-auth";
import { POST } from "../../src/app/api/chat/route";

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

const GATEWAY_SECRET = "runtime-command-test-secret";
const CLIENT_ID = "lsuperagent-pro";
const REQUEST_ID = "req-runtime-command-001";
const NONCE = "nonce-runtime-command-001";
const USER_JWT = "user-jwt-for-test-only";
const RUNTIME_SECRET = "runtime-shared-secret-for-test-only";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET = GATEWAY_SECRET;
  process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS = CLIENT_ID;
  process.env.LSUPERAGENT_BACKEND_URL =
    "https://example.supabase.co/functions/v1/lsuperagent-runtime";
  process.env.RUNTIME_SHARED_SECRET = RUNTIME_SECRET;
});

afterEach(() => {
  delete process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET;
  delete process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS;
  delete process.env.LSUPERAGENT_BACKEND_URL;
  delete process.env.RUNTIME_SHARED_SECRET;
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function canonicalBody() {
  return JSON.stringify({
    requestId: REQUEST_ID,
    workspaceId: null,
    action: "chat",
    input: { message: "Return a bounded deterministic command." },
  });
}

function signedRequest(withUserAuth = true) {
  const rawBody = canonicalBody();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", GATEWAY_SECRET)
    .update(
      buildR3SigningString({
        method: "POST",
        path: "/api/chat",
        clientId: CLIENT_ID,
        requestId: REQUEST_ID,
        timestamp,
        nonce: NONCE,
        rawBody,
      })
    )
    .digest("hex");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-lsuperagent-client": CLIENT_ID,
    "x-lsuperagent-request-id": REQUEST_ID,
    "x-lsuperagent-timestamp": String(timestamp),
    "x-lsuperagent-nonce": NONCE,
    "x-lsuperagent-signature": signature,
  };
  if (withUserAuth) headers.authorization = `Bearer ${USER_JWT}`;

  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function healthResponse() {
  return Response.json({
    ok: true,
    service: "lsuperagent-runtime",
    version: "2026.08.30.1",
    database: "CONNECTED",
    provider: "claude",
  });
}

function executionPayload(
  overrides: Partial<RuntimeExecutionPayload> = {}
): RuntimeExecutionPayload {
  return {
    status: "EXECUTED",
    provider: "claude",
    runtime_version: "2026.08.30.1",
    model: "claude-sonnet-4-6",
    ...overrides,
    evidence: {
      provider_request_id: "anthropic-request-1",
      correlation_id: "corr-1",
      qa_run_id: "qa-1",
      ...overrides.evidence,
    },
  };
}

/** Answers the health probe on GET and the execution payload on POST. */
function stubRuntime(payload: unknown) {
  mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return healthResponse();
    return Response.json(payload as Record<string, unknown>);
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

/** Same, but the execution response carries a body that is not JSON at all. */
function stubRuntimeWithUnparseableBody(body: string) {
  mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return healthResponse();
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

function postCalls() {
  return mockFetch.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "POST"
  );
}

describe("P0: Gateway to runtime identity", () => {
  it("fails closed before the backend POST when no runtime secret is configured", async () => {
    delete process.env.RUNTIME_SHARED_SECRET;
    stubRuntime(executionPayload());

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(postCalls()).toHaveLength(0);
  });

  it("sends the runtime secret as a server header alongside the user token", async () => {
    stubRuntime(executionPayload());

    await POST(signedRequest());

    const [call] = postCalls();
    expect(call).toBeDefined();

    const headers = new Headers((call[1] as RequestInit).headers);
    expect(headers.get("x-lsuperagent-runtime-secret")).toBe(RUNTIME_SECRET);
    expect(headers.get("authorization")).toBe(`Bearer ${USER_JWT}`);
  });

  it("keeps the runtime secret and the user token out of the request body", async () => {
    stubRuntime(executionPayload());

    await POST(signedRequest());

    const body = String((postCalls()[0][1] as RequestInit).body ?? "");
    expect(body).not.toContain(RUNTIME_SECRET);
    expect(body).not.toContain(USER_JWT);
  });

  it("never returns the runtime secret to the caller", async () => {
    stubRuntime(executionPayload());

    const response = await POST(signedRequest());

    expect(await response.text()).not.toContain(RUNTIME_SECRET);
  });

  it("still requires the user token even when the runtime secret is configured", async () => {
    stubRuntime(executionPayload());

    const response = await POST(signedRequest(false));

    expect(response.status).toBe(401);
    expect(postCalls()).toHaveLength(0);
  });
});

describe("P0: Provider-neutral execution", () => {
  it("verifies a claude execution and mirrors the provider", async () => {
    stubRuntime(executionPayload({ provider: "claude" }));

    const response = await POST(signedRequest());
    expect(response.status).toBe(200);

    expect(await response.json()).toMatchObject({
      status: "verified",
      provider: "claude",
      data: { provider: "claude" },
    });
  });

  it("verifies an xai execution and mirrors the provider", async () => {
    stubRuntime(executionPayload({ provider: "xai", model: "grok-4.6" }));

    const response = await POST(signedRequest());
    expect(response.status).toBe(200);

    expect(await response.json()).toMatchObject({
      status: "verified",
      provider: "xai",
      data: { provider: "xai" },
    });
  });
});

describe("P0: Verified evidence validation", () => {
  const cases: Array<[string, Partial<RuntimeExecutionPayload>]> = [
    [
      "empty provider_request_id",
      { evidence: { provider_request_id: "", correlation_id: "c1", qa_run_id: "q1" } },
    ],
    [
      "empty correlation_id",
      { evidence: { provider_request_id: "p1", correlation_id: "", qa_run_id: "q1" } },
    ],
    [
      "empty qa_run_id",
      { evidence: { provider_request_id: "p1", correlation_id: "c1", qa_run_id: "" } },
    ],
    ["empty model", { model: "" }],
    ["empty runtime_version", { runtime_version: "" }],
    ["empty provider", { provider: "" }],
    ["a non-EXECUTED status", { status: "FAILED" }],
  ];

  // A malformed EXECUTED payload is a distinct failure from an unreachable
  // upstream: the runtime answered, just not with something verifiable.
  it.each(cases)("refuses to verify an execution with %s", async (_label, overrides) => {
    stubRuntime(executionPayload(overrides));

    const response = await POST(signedRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      status: "failed",
      code: "INVALID_UPSTREAM_RESPONSE",
    });
  });

  // A body the runtime could not encode at all belongs in the same class: it
  // answered, the answer is unusable. Reporting this one as UPSTREAM_UNAVAILABLE
  // told callers the runtime was unreachable when it had in fact replied.
  it("reports a 200 whose body is not JSON as an invalid response, not an outage", async () => {
    stubRuntimeWithUnparseableBody("<html>gateway timeout</html>");

    const response = await POST(signedRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      status: "failed",
      code: "INVALID_UPSTREAM_RESPONSE",
    });
  });
});

describe("Secret discipline", () => {
  it("does not expose the runtime secret through any NEXT_PUBLIC_ value", () => {
    const leaking = Object.keys(process.env)
      .filter((key) => key.startsWith("NEXT_PUBLIC_"))
      .find((key) => process.env[key] === RUNTIME_SECRET);

    expect(leaking).toBeUndefined();
  });
});
