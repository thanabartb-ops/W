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

A successful R3 round-trip proves only:

- the canonical gateway route is reachable;
- the calling server is authenticated as an approved client;
- the request contract is valid;
- request correlation is preserved end-to-end.

It does **not** prove model execution, canonical memory use, audit writes, tool execution, or production readiness.

## 2. Existing authority and constraints

The existing Control Center design remains authoritative:

- `POST /api/chat` is the R3 gateway route;
- the browser may contain only public Supabase configuration;
- the gateway is server-only;
- existing LSUPERAGENT/Supabase remains the only canonical durable authority;
- provider execution, memory, tools, audit, production deployment, and DNS changes remain later gates.

The existing `/api/health` implementation currently reports `gateway: NOT_CONNECTED` and `backend: NOT_CONNECTED`. R3 must not falsify backend/model readiness.

The current Control Center R1 CI requires `.env.example` to contain exactly the two approved public variables. R3 therefore does not add server-only secret names to `.env.example`; server-only variables are documented in this spec and configured only in trusted deployment/runtime settings at the Preview hard gate.

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

## 4. Why HMAC is used for R3

Three approaches were considered:

1. **Server-to-server HMAC shared secret — selected.** Smallest implementation, no new identity provider, no browser secret exposure, deterministic tests, and appropriate for a single approved client during R3.
2. **Supabase user JWT as service authentication — rejected for R3.** User authentication and service authentication solve different problems. R3 must not treat a browser session as authority for the PRO server itself.
3. **Vercel OIDC / workload identity — deferred.** Stronger long-term service identity but introduces deployment/platform coupling before the basic canonical gateway contract is proven.

HMAC is intentionally transitional. Before privileged operations are enabled, service identity may be upgraded without changing the public `/api/chat` request semantics.

## 5. Server-only environment contract

The following variables are server-only and MUST NOT use the `NEXT_PUBLIC_` prefix.

### Canonical Control Center

```text
LSUPERAGENT_GATEWAY_HMAC_SECRET
LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS
```

`LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS` is a comma-separated allowlist. The first approved value is:

```text
lsuperagent-pro
```

### LSUPERAGENT PRO

```text
LSUPERAGENT_GATEWAY_URL
LSUPERAGENT_GATEWAY_CLIENT_ID
LSUPERAGENT_GATEWAY_HMAC_SECRET
```

The first approved client ID is:

```text
lsuperagent-pro
```

Rules:

- no secret value is committed to Git;
- no server-only variable is exposed to browser code;
- Preview and Production secrets are isolated;
- R3 implementation code may reference the variable names but may not contain real values;
- Production values are not configured in this phase.

## 6. Signed request protocol

The PRO server sends these headers to the canonical gateway:

```text
x-lsuperagent-client
x-lsuperagent-request-id
x-lsuperagent-timestamp
x-lsuperagent-nonce
x-lsuperagent-signature
content-type: application/json
```

### 6.1 Canonical signing string

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

### 6.2 Timestamp freshness

The timestamp is Unix epoch seconds.

The gateway accepts requests only when:

```text
abs(serverTime - requestTime) <= 120 seconds
```

Requests outside the window return the same generic authentication failure as a bad signature.

### 6.3 Replay limitation

R3 does not introduce a durable nonce store because canonical data writes are outside this phase. Therefore R3 prevents stale replay but cannot guarantee one-time nonce consumption within the 120-second window across distributed instances.

This limitation is acceptable only because R3 performs no provider call and no durable/privileged operation.

**Hard requirement before enabling provider, tools, memory mutation, or audit-sensitive privileged execution:** replace this limitation with a durable replay-control mechanism or workload identity that provides equivalent replay protection.

## 7. Canonical request contract

After server authentication succeeds, the gateway parses JSON into:

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

- body must be valid JSON object;
- unknown top-level fields are rejected;
- `requestId` must exactly match `x-lsuperagent-request-id`;
- `action` must equal `chat`;
- `workspaceId` must be a string or `null`;
- `input` must contain exactly one field: `message`;
- `message` must be a string;
- `message.trim().length` must be 1..12000;
- browser-supplied user IDs, roles, policy decisions, provider names, model names, tool decisions, audit results, and execution claims are rejected.

The canonical gateway builds internal context only after service authentication and request validation succeed.

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

`userId` remains `null` in R3. End-user Supabase session verification is not silently invented in this phase.

## 9. Response contract

### 9.1 Authenticated valid R3 request

Because provider execution is disabled, the canonical gateway returns:

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
```

```json
{
  "requestId": "...",
  "status": "failed",
  "code": "UPSTREAM_UNAVAILABLE",
  "gateway": "CONNECTED",
  "backend": "NOT_CONNECTED"
}
```

Meaning:

- `gateway=CONNECTED` means the request reached the canonical gateway and passed service authentication + contract validation;
- `backend=NOT_CONNECTED` means no provider/runtime execution path is enabled;
- HTTP 503 prevents the client from mistaking a gateway handshake for completed chat execution.

### 9.2 Missing/invalid service authentication

Return:

```text
HTTP 401
code: UNAUTHENTICATED
```

Do not distinguish publicly between:

- missing client header;
- unknown client;
- missing signature;
- invalid signature;
- stale timestamp.

### 9.3 Invalid authenticated request

Return:

```text
HTTP 400
code: INVALID_REQUEST
```

### 9.4 Gateway configuration missing

If the canonical server lacks the required R3 HMAC configuration, fail closed:

```text
HTTP 503
code: UPSTREAM_UNAVAILABLE
gateway: BLOCKED
backend: NOT_CONNECTED
```

No request is treated as authenticated when configuration is absent.

## 10. PRO client behavior

The existing PRO `/api/chat` remains the browser-facing route.

Its server adapter changes from unconditional PRELIVE `not_connected` to:

1. normalize the browser request using the existing PRO contract;
2. create/retain the PRO request ID;
3. build the canonical R3 envelope;
4. sign the exact raw body on the server;
5. call `${LSUPERAGENT_GATEWAY_URL}/api/chat`;
6. map the canonical response into the existing PRO public error contract.

The browser never receives or creates the HMAC secret.

When canonical R3 returns authenticated `503 UPSTREAM_UNAVAILABLE` with `gateway=CONNECTED`, PRO must preserve the failure while exposing the truthful connection state:

```text
gateway = CONNECTED
backend = NOT_CONNECTED
chat execution = FAILED / UPSTREAM_UNAVAILABLE
```

PRO must not convert this into a successful assistant response.

## 11. Provider execution remains disabled

Forbidden in both R3 source paths:

- OpenAI SDK/API calls;
- Anthropic SDK/API calls;
- Gemini SDK/API calls;
- provider API key environment variables;
- model routing;
- prompt execution;
- streaming model responses;
- tool invocation;
- canonical memory reads/writes;
- canonical audit writes;
- service-role Supabase operations.

A network request from PRO to the canonical Control Center is the only newly enabled upstream call.

## 12. Logging and secret handling

Server logs may contain:

- request ID;
- route;
- client ID after successful authentication;
- result class;
- duration;
- gateway/backend status class.

Server logs must not contain:

- HMAC secret;
- signature value;
- authorization-equivalent headers;
- raw request body;
- full message text;
- provider keys;
- service-role credentials.

Authentication failures log only safe classification + request ID when available.

## 13. File boundaries

### Canonical Control Center (`thanabartb-ops/W`)

Planned focused units:

```text
projects/lsuperagent-control-center/src/lib/gateway/r3-auth.ts
projects/lsuperagent-control-center/src/lib/gateway/r3-contract.ts
projects/lsuperagent-control-center/src/lib/gateway/r3-config.ts
projects/lsuperagent-control-center/src/app/api/chat/route.ts
projects/lsuperagent-control-center/tests/...R3 tests...
.github/workflows/lsuperagent-r3-gateway-verify.yml
```

`r3-auth.ts` owns signing-string verification only.  
`r3-contract.ts` owns strict request parsing/validation only.  
`r3-config.ts` reads and validates server-only R3 configuration only.  
`route.ts` orchestrates the boundary and response shaping only.

### LSUPERAGENT PRO (`thanabartb-ops/Lagensuper-Pro`)

Planned focused units:

```text
lsuperagent-pro/lib/gateway/r3-signing.ts
lsuperagent-pro/lib/gateway/server-dispatch.ts
lsuperagent-pro/app/api/chat/route.ts
lsuperagent-pro/tests/...R3 live-gateway contract tests...
```

Existing PRELIVE validation/context types are reused rather than duplicated.

## 14. Testing strategy

### 14.1 Canonical unit tests

Must prove:

- exact canonical signing string;
- valid signature accepted;
- wrong secret rejected;
- unknown client rejected;
- stale timestamp rejected;
- request ID/header mismatch rejected;
- malformed/unknown-field requests rejected;
- valid authenticated request returns HTTP 503 with `gateway=CONNECTED` and `backend=NOT_CONNECTED`;
- missing HMAC config fails closed;
- signature comparison does not use ordinary string equality.

### 14.2 PRO unit tests

Must prove:

- signature is created server-side only;
- request ID is preserved across PRO → canonical gateway;
- canonical authenticated 503 maps to `gateway=CONNECTED`, `backend=NOT_CONNECTED`, `UPSTREAM_UNAVAILABLE`;
- gateway network error maps to gateway `DEGRADED` or `NOT_CONNECTED` without fabricating success;
- no HMAC variable is referenced in browser/client components.

### 14.3 Source boundary tests

Must prove:

- no provider SDK/call is introduced;
- no Supabase mutation is introduced;
- no Memory/Audit/Tools route becomes active;
- no real secret/token-like value exists in Git;
- Control Center `.env.example` remains exactly the existing public environment contract;
- PRO public `.env.example` remains unchanged during source-only work.

### 14.4 CI

Both repositories run, at minimum:

```text
pnpm install --frozen-lockfile
pnpm vitest run
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

R3 workflows use read-only repository permissions.

## 15. Source implementation sequence

1. Canonical Control Center HMAC/contract tests RED.
2. Canonical Control Center minimal gateway implementation GREEN.
3. Canonical R3 CI/security boundary GREEN.
4. PRO signing/transport tests RED.
5. PRO minimal live-gateway adapter GREEN with mocked upstream only.
6. PRO R1/R2/R3 regression GREEN.
7. Both PRs remain unmerged until source verification is complete.
8. No real URL or secret is configured during source implementation.

## 16. Preview hard gate

After both source branches are verified, stop before real network configuration.

The next hard gate authorizes all of the following together:

- create/use Vercel Preview projects;
- configure Preview-only `LSUPERAGENT_GATEWAY_URL`;
- configure the same Preview-only HMAC secret on both server projects;
- configure allowed client ID;
- deploy both Preview targets;
- perform a real signed PRO → canonical gateway round-trip.

That gate does **not** authorize production, provider execution, canonical data writes, domain/DNS changes, or production secrets.

Required next gate name:

```text
PRO-R3_PREVIEW_NETWORK_APPROVAL_REQUIRED
```

## 17. Preview acceptance criteria

A real Preview round-trip passes only when all are true:

1. PRO Preview sends a signed request to the canonical Control Center Preview.
2. Canonical gateway verifies the approved `lsuperagent-pro` client.
3. Request ID is identical at both boundaries.
4. Canonical gateway returns `503 UPSTREAM_UNAVAILABLE`.
5. Response reports `gateway=CONNECTED` and `backend=NOT_CONNECTED`.
6. PRO displays/returns a failure state, never a fake assistant answer.
7. Vercel logs show correlation metadata without message bodies or secrets.
8. Provider/model execution remains absent.
9. Supabase canonical tables remain unchanged by the test.
10. Production/domain/DNS remain unchanged.

## 18. Explicit non-goals

R3 Canonical Gateway does not implement:

- end-user Supabase Auth verification;
- provider/model execution;
- memory retrieval;
- memory candidate creation;
- tools;
- canonical audit writes;
- production deployment;
- custom domain attachment;
- Wix/Cloudflare DNS changes;
- permanent replay cache.

Those require later explicit gates.

## 19. Security limitations carried forward

The selected R3 HMAC scheme is safe only for the current non-privileged handshake scope. Before any privileged or durable action is enabled, the architecture must add one of:

- durable nonce/replay storage with atomic consumption; or
- short-lived workload identity with audience binding and replay-resistant verification; or
- another separately reviewed equivalent control.

Provider execution must not be enabled merely because the R3 gateway handshake passes.

## 20. Success state

Source-only completion state:

```text
R3_CANONICAL_GATEWAY_SOURCE: VERIFIED
PRO_R3_CLIENT_SOURCE: VERIFIED
REAL_GATEWAY_URL_CONFIGURED: NO
REAL_HMAC_SECRET_CONFIGURED: NO
PROVIDER_CONNECTED: NO
CANONICAL_DATA_CHANGED: NO
VERCEL_PREVIEW_DEPLOYED: NO
PRODUCTION_CHANGED: NO
NEXT_GATE: PRO-R3_PREVIEW_NETWORK_APPROVAL_REQUIRED
```
