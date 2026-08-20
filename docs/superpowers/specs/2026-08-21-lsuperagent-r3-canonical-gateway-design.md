# LSUPERAGENT R3 Canonical Gateway Design

**Date:** 2026-08-21  
**Status:** DESIGN_APPROVED_PENDING_SPEC_REVIEW  
**Scope:** R3_GATEWAY_ONLY  
**Canonical source:** `thanabartb-ops/W` → `projects/lsuperagent-control-center`  
**Canonical operational authority:** existing LSUPERAGENT / Supabase  
**Client:** `thanabartb-ops/Lagensuper-Pro` (`lsuperagent-pro`)

## 1. Goal

Create the real server-to-server Trusted Agent Gateway boundary for LSUPERAGENT R3 without creating a second runtime, second Memory Core, second audit authority, or direct provider path.

This phase proves that LSUPERAGENT PRO can reach and authenticate to the canonical LSUPERAGENT Control Center gateway over a real network boundary while provider/model execution remains disabled.

A successful R3 round-trip proves only that the canonical gateway route is reachable, the calling server is an approved client, the request contract is valid, and request correlation is preserved end-to-end. It does not prove model execution, canonical memory use, audit writes, tool execution, or production readiness.

## 2. Existing authority and constraints

The existing Control Center design remains authoritative:

- `POST /api/chat` is the R3 gateway route;
- the browser may contain only public Supabase configuration;
- the gateway is server-only;
- existing LSUPERAGENT/Supabase remains the only canonical durable authority;
- provider execution, memory, tools, audit, production deployment, and DNS changes remain later gates.

The existing `/api/health` implementation currently reports `gateway: NOT_CONNECTED` and `backend: NOT_CONNECTED`. R3 must not falsify backend/model readiness.

The current Control Center R1 CI requires `.env.example` to contain exactly the two approved public variables. R3 therefore does not add server-only secret names to `.env.example`; server-only variables are documented here and configured only in trusted deployment/runtime settings at the Preview hard gate.

## 3. Architecture

```text
LSUPERAGENT PRO browser
        │
        ▼
LSUPERAGENT PRO Next.js server
        │
        │ HMAC-signed server-to-server request
        ▼
Canonical LSUPERAGENT Control Center
POST /api/chat
        │
        ├─ raw-body hash
        ├─ HMAC client authentication
        ├─ timestamp freshness check
        ├─ strict request validation
        ├─ requestId correlation
        └─ provider execution gate = DISABLED
        │
        ▼
HTTP 503 UPSTREAM_UNAVAILABLE
with gateway=CONNECTED, backend=NOT_CONNECTED

No provider call
No Supabase mutation
No memory read/write
No audit write
No tool execution
```

## 4. Service authentication choice

Three approaches were considered:

1. **Server-to-server HMAC shared secret — selected.** Smallest implementation, no new identity provider, no browser secret exposure, deterministic tests, and appropriate for one approved non-privileged client during R3.
2. **Supabase user JWT as service authentication — rejected for R3.** User identity and service identity are separate concerns. R3 must not treat a browser session as authority for the PRO server itself.
3. **Vercel OIDC / workload identity — deferred.** Stronger long-term service identity but adds deployment/platform coupling before the basic canonical gateway contract is proven.

HMAC is transitional. Before privileged operations are enabled, service identity or replay protection must be upgraded as defined in Section 18.

## 5. Server-only environment contract

The following variables are server-only and MUST NOT use the `NEXT_PUBLIC_` prefix.

### Canonical Control Center

```text
LSUPERAGENT_GATEWAY_HMAC_SECRET
LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS
```

`LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS` is a comma-separated allowlist. The first approved value is `lsuperagent-pro`.

### LSUPERAGENT PRO

```text
LSUPERAGENT_GATEWAY_URL
LSUPERAGENT_GATEWAY_CLIENT_ID
LSUPERAGENT_GATEWAY_HMAC_SECRET
```

The first approved client ID is `lsuperagent-pro`.

Rules:

- no secret value is committed to Git;
- no server-only variable is exposed to browser code;
- Preview and Production secrets are isolated;
- source may reference variable names but never real values;
- Production values are not configured in this phase;
- public `.env.example` contracts remain unchanged during source-only work.

## 6. Signed request protocol

The PRO server sends:

```text
x-lsuperagent-client
x-lsuperagent-request-id
x-lsuperagent-timestamp
x-lsuperagent-nonce
x-lsuperagent-signature
content-type: application/json
```

Version `v1` signs exactly:

```text
v1
POST
/api/chat
<clientId>
<requestId>
<timestamp>
<nonce>
<sha256Hex(rawBody)>
```

Signature:

```text
hex(HMAC-SHA256(sharedSecret, signingString))
```

The gateway compares signatures with a constant-time comparison.

The timestamp is Unix epoch seconds and is accepted only when:

```text
abs(serverTime - requestTime) <= 120 seconds
```

Missing client, unknown client, missing signature, invalid signature, and stale timestamp all produce the same public authentication failure.

### Replay limitation

R3 does not introduce a durable nonce store because canonical data writes are outside this phase. R3 therefore prevents stale replay but cannot guarantee one-time nonce consumption inside the 120-second window across distributed instances.

This limitation is allowed only because R3 performs no provider call and no durable/privileged operation. It becomes a hard blocker before privileged execution.

## 7. Canonical request contract

After service authentication succeeds, JSON is parsed into:

```ts
export type CanonicalChatRequest = {
  requestId: string
  workspaceId: string | null
  action: 'chat'
  input: {
    message: string
  }
}
```

Validation rules:

- body must be a valid JSON object;
- unknown top-level fields are rejected;
- `requestId` must exactly match `x-lsuperagent-request-id`;
- `action` must equal `chat`;
- `workspaceId` must be a string or `null`;
- `input` must contain exactly one field: `message`;
- `message` must be a string;
- `message.trim().length` must be 1..12000;
- browser-supplied user IDs, roles, policy decisions, provider/model names, tool decisions, audit results, and execution claims are rejected.

## 8. Internal gateway context

```ts
export type CanonicalGatewayContext = {
  requestId: string
  clientId: 'lsuperagent-pro'
  userId: null
  workspaceId: string | null
  action: 'chat'
  input: { message: string }
  receivedAt: string
}
```

`userId` remains `null` in R3. End-user Supabase session verification is not invented in this phase.

## 9. Response contract

### Authenticated valid R3 request

Because provider execution is disabled:

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
```

```json
{
  "requestId": "generated-or-forwarded-request-id",
  "status": "failed",
  "code": "UPSTREAM_UNAVAILABLE",
  "gateway": "CONNECTED",
  "backend": "NOT_CONNECTED"
}
```

`gateway=CONNECTED` means the request reached the canonical gateway and passed service authentication plus contract validation. `backend=NOT_CONNECTED` means no provider/runtime execution path is enabled. HTTP 503 prevents the client from mistaking a gateway handshake for completed chat execution.

### Missing or invalid service authentication

```text
HTTP 401
code: UNAUTHENTICATED
```

### Invalid authenticated request

```text
HTTP 400
code: INVALID_REQUEST
```

### Gateway configuration missing

```text
HTTP 503
code: UPSTREAM_UNAVAILABLE
gateway: BLOCKED
backend: NOT_CONNECTED
```

No request is treated as authenticated when required HMAC configuration is absent.

## 10. PRO client behavior

The existing PRO `/api/chat` remains the browser-facing route. Its server adapter changes from unconditional PRELIVE `not_connected` to:

1. normalize the browser request using the existing PRO contract;
2. create or retain the PRO request ID;
3. build the canonical R3 envelope;
4. sign the exact raw body on the server;
5. call `${LSUPERAGENT_GATEWAY_URL}/api/chat`;
6. map the canonical response into the existing PRO public error contract.

The browser never receives or creates the HMAC secret.

When canonical R3 returns authenticated `503 UPSTREAM_UNAVAILABLE` with `gateway=CONNECTED`, PRO preserves the failure while exposing truthful state:

```text
gateway = CONNECTED
backend = NOT_CONNECTED
chat execution = FAILED / UPSTREAM_UNAVAILABLE
```

PRO must never convert this into a successful assistant response.

## 11. Provider execution remains disabled

Forbidden in both R3 source paths:

- OpenAI, Anthropic, or Gemini SDK/API calls;
- provider API key environment variables;
- model routing or prompt execution;
- streaming model responses;
- tool invocation;
- canonical memory reads/writes;
- canonical audit writes;
- service-role Supabase operations.

A network request from PRO to the canonical Control Center is the only newly enabled upstream call.

## 12. Logging and secret handling

Server logs may contain request ID, route, successfully authenticated client ID, result class, duration, and gateway/backend status class.

Server logs must not contain the HMAC secret, signature value, authentication-equivalent headers, raw request body, full message text, provider keys, or service-role credentials.

Authentication failures log only safe classification and request ID when available.

## 13. Exact source boundaries

### Canonical Control Center (`thanabartb-ops/W`)

Create or modify only the R3 gateway surface and its verification files:

```text
projects/lsuperagent-control-center/src/lib/gateway/r3-auth.ts
projects/lsuperagent-control-center/src/lib/gateway/r3-contract.ts
projects/lsuperagent-control-center/src/lib/gateway/r3-config.ts
projects/lsuperagent-control-center/src/app/api/chat/route.ts
projects/lsuperagent-control-center/tests/unit/r3-auth.test.ts
projects/lsuperagent-control-center/tests/unit/r3-contract.test.ts
projects/lsuperagent-control-center/tests/integration/r3-chat-route.test.ts
projects/lsuperagent-control-center/tests/integration/r3-source-boundary.test.ts
.github/workflows/lsuperagent-r3-gateway-verify.yml
```

`r3-auth.ts` owns signing-string verification only. `r3-contract.ts` owns strict request parsing and validation only. `r3-config.ts` reads and validates server-only R3 configuration only. `route.ts` orchestrates the boundary and response shaping only.

### LSUPERAGENT PRO (`thanabartb-ops/Lagensuper-Pro`)

Reuse the PRELIVE validation/context and modify only the live gateway client boundary:

```text
lsuperagent-pro/lib/gateway/r3-signing.ts
lsuperagent-pro/lib/gateway/server-dispatch.ts
lsuperagent-pro/app/api/chat/route.ts
lsuperagent-pro/tests/pro-r3-live-signing.test.ts
lsuperagent-pro/tests/pro-r3-live-dispatch.test.ts
lsuperagent-pro/tests/pro-r3-security-boundary.test.ts
.github/workflows/pro-r3-prelive-verify.yml
```

Existing PRELIVE validation/context types are reused rather than duplicated.

## 14. Testing and CI

### Canonical tests must prove

- exact canonical signing string;
- valid signature accepted;
- wrong secret rejected;
- unknown client rejected;
- stale timestamp rejected;
- request ID/header mismatch rejected;
- malformed or unknown-field requests rejected;
- valid authenticated request returns HTTP 503 with `gateway=CONNECTED` and `backend=NOT_CONNECTED`;
- missing HMAC config fails closed;
- signature comparison uses constant-time comparison.

### PRO tests must prove

- signing is server-side only;
- request ID is preserved PRO → canonical gateway;
- canonical authenticated 503 maps to `gateway=CONNECTED`, `backend=NOT_CONNECTED`, `UPSTREAM_UNAVAILABLE`;
- gateway network failure never fabricates success;
- no HMAC variable is referenced in browser/client components.

### Source boundary tests must prove

- no provider SDK/call is introduced;
- no Supabase mutation is introduced;
- no Memory/Audit/Tools route becomes active;
- no real secret/token-like value exists in Git;
- Control Center `.env.example` remains exactly the existing two-variable public contract;
- PRO public `.env.example` remains unchanged during source-only work.

Both repositories run at minimum:

```text
pnpm install --frozen-lockfile
pnpm vitest run
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

R3 workflows use read-only repository permissions.

## 15. Source implementation sequence and merge gate

1. Canonical Control Center HMAC/contract tests RED.
2. Canonical Control Center minimal gateway implementation GREEN.
3. Canonical R3 CI/security boundary GREEN.
4. PRO signing/transport tests RED.
5. PRO minimal live-gateway adapter GREEN with mocked upstream only.
6. PRO R1/R2/R3 regression GREEN.
7. Both source branches/PRs remain unmerged after verification.
8. Source verification does not authorize merge.
9. Merge requires a separate explicit user approval.
10. No real gateway URL or HMAC secret is configured during source implementation.

## 16. Preview hard gate

After both source sides are verified, stop before real network configuration.

The next hard gate may authorize all of the following together:

- create or use Vercel Preview projects;
- configure Preview-only `LSUPERAGENT_GATEWAY_URL`;
- configure the same Preview-only HMAC secret on both server projects;
- configure the allowed client ID;
- deploy both Preview targets;
- perform a real signed PRO → canonical gateway round-trip.

That gate does not authorize production, provider execution, canonical data writes, domain/DNS changes, or production secrets.

Required next gate:

```text
PRO-R3_PREVIEW_NETWORK_APPROVAL_REQUIRED
```

## 17. Preview acceptance criteria

A real Preview round-trip passes only when all are true:

1. PRO Preview sends a signed request to the canonical Control Center Preview.
2. Canonical gateway verifies `lsuperagent-pro` as the approved client.
3. Request ID is identical at both boundaries.
4. Canonical gateway returns `503 UPSTREAM_UNAVAILABLE`.
5. Response reports `gateway=CONNECTED` and `backend=NOT_CONNECTED`.
6. PRO returns a failure state, never a fake assistant answer.
7. Vercel logs contain correlation metadata without message bodies or secrets.
8. Provider/model execution remains absent.
9. Supabase canonical tables remain unchanged by the test.
10. Production/domain/DNS remain unchanged.

## 18. Security limitation before privileged execution

R3 HMAC is approved only for the current non-privileged handshake. Before provider, tools, memory mutation, audit-sensitive privileged work, or any durable action is enabled, the architecture must add one of:

- durable nonce/replay storage with atomic consumption;
- short-lived workload identity with audience binding and replay-resistant verification;
- another separately reviewed equivalent control.

Provider execution must not be enabled merely because the R3 gateway handshake passes.

## 19. Explicit non-goals

R3 Canonical Gateway does not implement end-user Supabase Auth verification, provider/model execution, memory retrieval, memory candidate creation, tools, canonical audit writes, production deployment, custom domain attachment, Wix/Cloudflare DNS changes, or permanent replay storage.

Those require later explicit gates.

## 20. Source-only success state

```text
R3_CANONICAL_GATEWAY_SOURCE: VERIFIED
PRO_R3_CLIENT_SOURCE: VERIFIED
SOURCE_MERGED: NO
REAL_GATEWAY_URL_CONFIGURED: NO
REAL_HMAC_SECRET_CONFIGURED: NO
PROVIDER_CONNECTED: NO
CANONICAL_DATA_CHANGED: NO
VERCEL_PREVIEW_DEPLOYED: NO
PRODUCTION_CHANGED: NO
NEXT_GATE: PRO-R3_PREVIEW_NETWORK_APPROVAL_REQUIRED
```
