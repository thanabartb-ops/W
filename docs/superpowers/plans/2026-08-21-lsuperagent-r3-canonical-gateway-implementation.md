# LSUPERAGENT R3 Canonical Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and verify the source-only R3 Trusted Agent Gateway handshake between LSUPERAGENT PRO and the canonical LSUPERAGENT Control Center while keeping provider execution, canonical data writes, deployment, and production changes disabled.

**Architecture:** The canonical Control Center owns `POST /api/chat` and verifies a server-to-server HMAC v1 envelope. LSUPERAGENT PRO signs the exact canonical request from its Next.js server and maps the canonical authenticated 503 handshake into a truthful public failure state. Both sides remain source-only until a separate Preview network approval.

**Tech Stack:** Next.js 16 App Router, TypeScript, Node `crypto`, Vitest, ESLint, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-21-lsuperagent-r3-canonical-gateway-design.md`

## Global Constraints

- Canonical operational authority remains existing LSUPERAGENT / Supabase.
- No provider/model SDK or API call is added.
- No canonical memory, audit, tools, or Supabase mutation is added.
- No real HMAC secret or gateway URL is committed.
- No Production environment values are configured.
- Control Center `.env.example` remains unchanged.
- PRO public `.env.example` remains unchanged.
- Source verification does not authorize merge.
- Both branches remain unmerged after source verification.
- Next gate is `PRO-R3_PREVIEW_NETWORK_APPROVAL_REQUIRED`.

---

### Task 1: Canonical HMAC authentication and strict request contract

**Files:**
- Create: `projects/lsuperagent-control-center/src/lib/gateway/r3-auth.ts`
- Create: `projects/lsuperagent-control-center/src/lib/gateway/r3-contract.ts`
- Create: `projects/lsuperagent-control-center/src/lib/gateway/r3-config.ts`
- Create: `projects/lsuperagent-control-center/tests/unit/r3-auth.test.ts`
- Create: `projects/lsuperagent-control-center/tests/unit/r3-contract.test.ts`

**Interfaces:**
- `buildR3SigningString(input): string`
- `verifyR3Authentication(input): { ok: true; clientId: 'lsuperagent-pro' } | { ok: false }`
- `parseCanonicalChatRequest(input, expectedRequestId): CanonicalChatRequest`
- `readR3GatewayConfig(env): R3GatewayConfig | null`

- [ ] **Step 1: Write RED unit tests** proving exact v1 signing string, valid signature, wrong secret, unknown client, stale timestamp, strict request fields, message bounds, and request ID equality.
- [ ] **Step 2: Run `pnpm vitest run tests/unit/r3-auth.test.ts tests/unit/r3-contract.test.ts`** from `projects/lsuperagent-control-center` and capture the expected missing-module RED result.
- [ ] **Step 3: Implement the minimum Node `crypto` HMAC verification** using SHA-256 body hash, HMAC-SHA256, constant-time `timingSafeEqual`, ±120 second freshness, and fail-closed config.
- [ ] **Step 4: Implement exact strict request parsing** for `{ requestId, workspaceId, action:'chat', input:{message} }`, rejecting unknown fields and message lengths outside trimmed 1..12000.
- [ ] **Step 5: Re-run the Task 1 tests and require GREEN.**

### Task 2: Canonical `/api/chat` route and source-boundary verification

**Files:**
- Create: `projects/lsuperagent-control-center/src/app/api/chat/route.ts`
- Create: `projects/lsuperagent-control-center/tests/integration/r3-chat-route.test.ts`
- Create: `projects/lsuperagent-control-center/tests/integration/r3-source-boundary.test.ts`
- Create: `.github/workflows/lsuperagent-r3-gateway-verify.yml`

**Interfaces:**
- `POST(request: Request): Promise<Response>`
- Authenticated valid request → HTTP 503 `{requestId,status:'failed',code:'UPSTREAM_UNAVAILABLE',gateway:'CONNECTED',backend:'NOT_CONNECTED'}`
- Authentication failure → HTTP 401 `UNAUTHENTICATED`
- Authenticated invalid request → HTTP 400 `INVALID_REQUEST`
- Missing gateway config → HTTP 503 with `gateway:'BLOCKED'`, `backend:'NOT_CONNECTED'`

- [ ] **Step 1: Write RED route tests** before creating the route.
- [ ] **Step 2: Run the route tests and capture RED.**
- [ ] **Step 3: Implement only authentication, validation, correlation, and fail-closed response shaping.** Do not call Supabase or any model/provider.
- [ ] **Step 4: Add source-boundary tests** proving no provider SDK/call, no Supabase mutation, no Memory/Audit/Tools route activation, no committed real secret-like value, and unchanged public env contract.
- [ ] **Step 5: Add read-only R3 GitHub Actions verification** running frozen install, Vitest, lint, TypeScript, and build from the Control Center directory.
- [ ] **Step 6: Run full Control Center verification:** `pnpm vitest run`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.

### Task 3: LSUPERAGENT PRO live-signing adapter with mocked upstream

**Repository:** `thanabartb-ops/Lagensuper-Pro`

**Branch:** `agent/pro-r3-prelive-gateway-v1`

**Files:**
- Create: `lsuperagent-pro/lib/gateway/r3-signing.ts`
- Modify: `lsuperagent-pro/lib/gateway/server-dispatch.ts`
- Modify: `lsuperagent-pro/app/api/chat/route.ts`
- Remove or retire conflicting logic in: `lsuperagent-pro/lib/gateway/canonical-client.ts`
- Create: `lsuperagent-pro/tests/pro-r3-live-signing.test.ts`
- Create: `lsuperagent-pro/tests/pro-r3-live-dispatch.test.ts`
- Update: `lsuperagent-pro/tests/pro-r3-security-boundary.test.ts`
- Update: `.github/workflows/pro-r3-prelive-verify.yml`

**Interfaces:**
- Canonical body is exactly `JSON.stringify({requestId,workspaceId,action:'chat',input:{message}})`.
- Signing string is exactly `v1\nPOST\n/api/chat\n<clientId>\n<requestId>\n<timestamp>\n<nonce>\n<sha256Hex(rawBody)>`.
- Headers include client, request ID, timestamp, nonce, signature, and JSON content type.
- Server-only env names are `LSUPERAGENT_GATEWAY_URL`, `LSUPERAGENT_GATEWAY_CLIENT_ID`, `LSUPERAGENT_GATEWAY_HMAC_SECRET`.

- [ ] **Step 1: Write RED signing/dispatch tests** for exact signing format, request-ID preservation, canonical 503 mapping, network failure, and absence of browser secret references.
- [ ] **Step 2: Run targeted tests and capture RED.**
- [ ] **Step 3: Implement server-only signing and transport with injected `fetch` for tests.**
- [ ] **Step 4: Update `/api/chat` public mapping** so authenticated canonical 503 remains a failure with `gateway:'CONNECTED'`, `backend:'NOT_CONNECTED'`, never a fake assistant answer.
- [ ] **Step 5: Remove/replace the older incompatible canonical signing protocol** so only the approved v1 contract remains.
- [ ] **Step 6: Run PRO R1/R2/R3 regression:** `pnpm vitest run`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.

### Task 4: Independent source verification and stop gate

**Files/Artifacts:**
- Draft PR in `thanabartb-ops/W`
- Existing Draft PR #3 in `thanabartb-ops/Lagensuper-Pro`
- CI logs/evidence comments on both PRs

- [ ] **Step 1: Confirm current branch heads and PR scope.**
- [ ] **Step 2: Require green CI on both current heads.**
- [ ] **Step 3: Review changed-file lists for scope drift and forbidden provider/Supabase/deployment code.**
- [ ] **Step 4: Record exact evidence in PR comments.**
- [ ] **Step 5: Do not merge either PR.**
- [ ] **Step 6: Stop with:**

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
