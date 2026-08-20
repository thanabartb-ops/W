# LSUPERAGENT Canonical R3 Gateway Design

**Date:** 2026-08-21  
**Status:** DESIGN_APPROVED_PENDING_SPEC_REVIEW  
**Branch:** `agent/r3-canonical-gateway-v1`  
**Canonical application:** `projects/lsuperagent-control-center`  
**Canonical authority:** existing LSUPERAGENT / Supabase  
**Client:** LSUPERAGENT PRO  
**Release stage:** R3_GATEWAY  

## 1. Goal

Implement the first real canonical Trusted Agent Gateway boundary in `thanabartb-ops/W` for `POST /api/chat`, and allow LSUPERAGENT PRO to connect to it server-to-server without creating a second runtime, Memory Core, audit authority, provider runtime, or database.

This phase proves authenticated network connectivity and request normalization only. It does not enable model/provider execution, canonical memory access, tool execution, audit mutation, production deployment, or DNS changes.

## 2. Existing constraints preserved

- Existing LSUPERAGENT / Supabase remains the only canonical durable authority.
- The browser never receives service-role credentials, provider keys, gateway shared secrets, or deployment tokens.
- PRO remains an alternate client, not a second Core or Gateway authority.
- `/api/health` remains available and unchanged except where tests require explicit status reporting.
- `/api/chat` is the only new canonical gateway route in this phase.
- `/api/memory`, `/api/memory/candidate`, `/api/tools`, `/api/execute`, and `/api/audit` remain disabled.
- No Supabase schema or Edge Function is created for R3.
- No provider SDK or provider API call is introduced.
- No Vercel production deployment, custom domain, DNS, or Cloudflare change is performed.

## 3. Architecture

```text
Browser
  │
  ▼
LSUPERAGENT PRO
  │
  ▼
PRO server-only /api/chat
  │  HMAC-authenticated HTTPS request
  ▼
Canonical LSUPERAGENT Control Center
  │
  ▼
POST /api/chat
  │
  ├─ transport authentication
  ├─ request freshness check
  ├─ strict JSON validation
  ├─ normalized GatewayContext
  └─ provider execution gate = DISABLED
       │
       ▼
Structured fail-closed response

Existing LSUPERAGENT / Supabase
  └─ untouched in R3_GATEWAY
```

## 4. Trust model

R3 uses service-to-service authentication between LSUPERAGENT PRO and the canonical Control Center.

The PRO server authenticates as the service client `lsuperagent-pro`. This proves which application is calling the gateway; it does not prove an end-user identity and must never be treated as authorization for privileged LSUPERAGENT actions.

End-user Supabase session verification is deferred to the later authentication/canonical-data phase. Until verified user identity exists, privileged execution remains fail-closed.

## 5. HMAC request authentication

### 5.1 Server-only configuration

Canonical Control Center:

```text
LSUPERAGENT_GATEWAY_SHARED_SECRET
LSUPERAGENT_GATEWAY_ALLOWED_CLIENT=lsuperagent-pro
```

LSUPERAGENT PRO:

```text
LSUPERAGENT_GATEWAY_URL
LSUPERAGENT_GATEWAY_SHARED_SECRET
```

These variables are server-only. None use the `NEXT_PUBLIC_` prefix and none may be committed to Git.

### 5.2 Required request headers

```text
x-lsuperagent-client: lsuperagent-pro
x-lsuperagent-timestamp: <unix-seconds>
x-lsuperagent-request-id: <uuid>
x-lsuperagent-signature: v1=<hex-hmac-sha256>
content-type: application/json
```

### 5.3 Canonical signing string

The exact signing input is:

```text
v1\n<timestamp>\n<requestId>\n<sha256Hex(rawBody)>
```

The signature is:

```text
HMAC-SHA256(sharedSecret, signingInput)
```

The canonical gateway compares signatures with a timing-safe comparison.

### 5.4 Freshness and replay boundary

Requests are accepted only when the timestamp is within 300 seconds of gateway time.

R3 does not add a durable nonce/replay store because R3 performs no provider execution or canonical mutation. This means an otherwise valid signed request can theoretically be replayed inside the 300-second window. Before any privileged side effect is enabled, a replay-prevention mechanism must be added and verified.

## 6. Request contract

Canonical `POST /api/chat` accepts only:

```ts
export type CanonicalChatRequest = {
  message: string
  workspaceId?: string | null
}
```

Rules:

- body must be valid JSON;
- unknown fields are rejected;
- `message` must be a string;
- `message.trim().length` must be 1..12000;
- `workspaceId`, when present, must be a string or `null`;
- browser-supplied identity, role, provider, model, policy decision, execution ID, or audit result is rejected as authority.

## 7. Normalized gateway context

R3 canonical context is:

```ts
export type GatewayContext = {
  requestId: string
  caller: {
    kind: 'service'
    clientId: 'lsuperagent-pro'
    authMethod: 'hmac-sha256-v1'
  }
  userId: null
  workspaceId: string | null
  action: 'chat'
  input: { message: string }
  receivedAt: string
}
```

`userId` is intentionally `null`. A service-authenticated caller is not promoted into a user identity.

## 8. Canonical response contract

A valid signed request proves gateway connectivity but R3 does not execute a model. Therefore the canonical gateway returns:

```json
{
  "requestId": "<uuid>",
  "gateway": "CONNECTED",
  "execution": "NOT_CONNECTED",
  "code": "UPSTREAM_UNAVAILABLE",
  "message": "Canonical gateway verified the request; provider execution is disabled in R3."
}
```

with HTTP `503`.

The 503 represents unavailable execution upstream, not gateway failure. PRO determines gateway connectivity from the authenticated, structurally valid canonical response.

Authentication failures return fail-closed responses without revealing which secret/header comparison failed.

Public error codes for this phase:

```text
INVALID_REQUEST
FORBIDDEN
UPSTREAM_UNAVAILABLE
INTERNAL_ERROR
```

## 9. Error handling

- malformed JSON -> HTTP 400 / `INVALID_REQUEST`;
- missing or malformed transport-auth headers -> HTTP 403 / `FORBIDDEN`;
- stale timestamp -> HTTP 403 / `FORBIDDEN`;
- invalid signature -> HTTP 403 / `FORBIDDEN`;
- unknown client ID -> HTTP 403 / `FORBIDDEN`;
- valid authenticated request with provider disabled -> HTTP 503 / `UPSTREAM_UNAVAILABLE` and `gateway: CONNECTED`;
- unexpected server error -> HTTP 500 / `INTERNAL_ERROR` with request ID only.

No response returns raw stack traces, secrets, request signatures, authorization material, environment values, or provider payloads.

## 10. PRO client behavior

PRO keeps its browser-facing `/api/chat` route. That server route becomes an adapter to the canonical Control Center.

Behavior:

1. validate the browser request using the existing PRO-R3 contract;
2. generate/preserve `requestId`;
3. serialize the canonical JSON body exactly once;
4. calculate the HMAC headers server-side;
5. send the request to `LSUPERAGENT_GATEWAY_URL`;
6. validate the canonical response structure;
7. map a valid canonical `gateway: CONNECTED` response to PRO gateway state `CONNECTED` while keeping model/backend execution `NOT_CONNECTED`;
8. fail closed on timeout, malformed response, signature/config error, or unreachable gateway.

PRO must never call a provider directly as a fallback.

## 11. Source layout

Canonical Control Center expected source units:

```text
projects/lsuperagent-control-center/src/
├── app/api/chat/route.ts
└── lib/gateway/
    ├── chat-request.ts
    ├── context.ts
    ├── service-auth.ts
    ├── response.ts
    └── types.ts
```

LSUPERAGENT PRO changes remain in its existing gateway boundary and are implemented separately after the canonical side passes tests.

## 12. Testing contract

Canonical tests must prove:

1. deterministic HMAC generation for a fixed test vector;
2. timing-safe signature verification succeeds for the correct secret and fails for an incorrect signature;
3. missing headers, unknown client, and stale timestamp are rejected;
4. valid JSON is normalized with `caller.kind = service`, `clientId = lsuperagent-pro`, and `userId = null`;
5. invalid/unknown body fields are rejected;
6. a valid authenticated request returns HTTP 503 with `gateway: CONNECTED`, `execution: NOT_CONNECTED`, and `UPSTREAM_UNAVAILABLE`;
7. route source contains no provider SDK execution or direct Supabase mutation;
8. existing `/api/health` tests continue to pass;
9. disabled routes remain absent;
10. lint, TypeScript, and production build pass.

PRO tests must prove:

1. signing uses only server-only configuration;
2. a valid canonical response maps gateway state to `CONNECTED` without marking model/backend execution complete;
3. unreachable gateway remains fail-closed;
4. PRO does not fall back to direct provider or Supabase execution;
5. prior PRO-R1/R2/R3 regression tests remain green.

## 13. Verification sequence

Canonical repository:

```text
pnpm install --frozen-lockfile
pnpm vitest run
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

PRO repository uses the same verification sequence plus its existing R1/R2/R3 security gates.

GitHub Actions remains read-only with `contents: read` for verification jobs.

## 14. Secret handling

- real shared-secret values are never written into source, tests, PR comments, or chat output;
- tests use deterministic fake fixtures only;
- actual secret injection occurs only at the later Vercel Preview hard gate;
- canonical and PRO preview environments receive the same shared secret through server-only environment configuration;
- secret rotation requires updating both preview applications and re-running the connectivity test;
- production secrets are out of scope.

## 15. Deployment sequence and hard gates

Implementation sequence:

```text
R3A_CANONICAL_SOURCE
  -> canonical tests / CI
R3B_PRO_ADAPTER_SOURCE
  -> PRO tests / CI
R3C_PREVIEW_CONFIG
  -> explicit approval required
R3D_NETWORK_HANDSHAKE
  -> preview-only connectivity test
R3E_GATEWAY_VERIFIED
  -> provider still disabled
```

The following remain blocked without a later explicit approval:

- Vercel project creation or deployment;
- real gateway URL/secret injection;
- Supabase Auth user identity activation;
- provider/model execution;
- canonical memory/tool/audit operations;
- production deployment;
- custom domain or DNS change.

## 16. Success criteria

R3 Gateway is successful when all of the following are true:

- canonical `/api/chat` exists and verifies HMAC-authenticated PRO requests;
- no provider or canonical-data execution occurs;
- PRO can distinguish `gateway CONNECTED` from `execution NOT_CONNECTED`;
- all canonical and PRO tests/build/security checks pass;
- secrets remain server-only and absent from Git;
- no duplicate runtime, memory, audit, or database authority is created;
- live preview connectivity is not attempted until separately approved.

## 17. Next hard gate

After source and CI are verified, stop at:

```text
PRO-R3_CANONICAL_GATEWAY_PREVIEW_APPROVAL_REQUIRED
```

That gate authorizes preview deployment/configuration and real server-to-server handshake only. It does not authorize provider execution, production, Supabase mutation, or DNS changes.
