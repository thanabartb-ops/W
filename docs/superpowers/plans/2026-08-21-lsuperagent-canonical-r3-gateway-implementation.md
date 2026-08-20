# LSUPERAGENT Canonical R3 Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first real canonical `POST /api/chat` Trusted Agent Gateway boundary to the LSUPERAGENT Control Center while keeping provider execution, canonical data mutation, and production deployment disabled.

**Architecture:** `projects/lsuperagent-control-center` remains the canonical web gateway. The route verifies a server-to-server HMAC request from `lsuperagent-pro`, validates and normalizes the chat body into a service-authenticated `GatewayContext`, and returns a structured `503 UPSTREAM_UNAVAILABLE` response that proves gateway connectivity without running a model or touching Supabase data. HMAC secrets exist only in server environment variables and are never committed.

**Tech Stack:** Next.js 16.3.1 App Router, TypeScript 5, Node.js crypto, Vitest 4.1.11, pnpm 10.34.5, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-21-lsuperagent-canonical-r3-gateway-design.md`

## Global Constraints

- Existing LSUPERAGENT / Supabase remains the only canonical durable authority.
- `POST /api/chat` is the only new canonical gateway route in R3.
- `/api/memory`, `/api/memory/candidate`, `/api/tools`, `/api/execute`, and `/api/audit` remain absent.
- No provider SDK/API call, Supabase mutation, Edge Function, Vercel production deployment, custom domain, DNS, or Cloudflare change.
- `LSUPERAGENT_GATEWAY_SHARED_SECRET` and `LSUPERAGENT_GATEWAY_ALLOWED_CLIENT` are server-only environment variables; never expose them with `NEXT_PUBLIC_`.
- Valid service authentication does not create end-user identity: `userId` remains `null`.
- Request freshness window is 300 seconds.
- Actual preview secret injection is deferred to `PRO-R3_CANONICAL_GATEWAY_PREVIEW_APPROVAL_REQUIRED`.
- Node.js engine floor remains `>=20.9.0`.

---

### Task 1: HMAC Service Authentication Boundary

**Files:**
- Create: `projects/lsuperagent-control-center/src/lib/gateway/types.ts`
- Create: `projects/lsuperagent-control-center/src/lib/gateway/service-auth.ts`
- Test: `projects/lsuperagent-control-center/tests/unit/gateway-service-auth.test.ts`

**Interfaces:**
- Consumes: raw request headers, raw body string, server-only shared secret, current Unix seconds.
- Produces: `verifyServiceRequest(input): ServiceAuthResult`, `createSignature(input): string`, canonical service caller type.

- [ ] **Step 1: Write the failing service-auth tests**

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createSignature, verifyServiceRequest } from '../../src/lib/gateway/service-auth'

const fixture = {
  secret: 'unit-test-secret-only',
  timestamp: 1787263200,
  requestId: '11111111-1111-4111-8111-111111111111',
  body: JSON.stringify({ message: 'hello' }),
}

describe('gateway service authentication', () => {
  it('creates a deterministic v1 signature', () => {
    expect(createSignature(fixture)).toMatch(/^v1=[0-9a-f]{64}$/)
    expect(createSignature(fixture)).toBe(createSignature(fixture))
  })

  it('accepts the allowed client with a fresh valid signature', () => {
    const signature = createSignature(fixture)
    expect(
      verifyServiceRequest({
        clientId: 'lsuperagent-pro',
        allowedClientId: 'lsuperagent-pro',
        signature,
        timestamp: String(fixture.timestamp),
        requestId: fixture.requestId,
        body: fixture.body,
        secret: fixture.secret,
        nowSeconds: fixture.timestamp + 10,
      }),
    ).toEqual({ ok: true, clientId: 'lsuperagent-pro' })
  })

  it('fails closed for stale, wrong-client, or wrong-signature requests', () => {
    const signature = createSignature(fixture)
    expect(verifyServiceRequest({
      clientId: 'other-client', allowedClientId: 'lsuperagent-pro', signature,
      timestamp: String(fixture.timestamp), requestId: fixture.requestId,
      body: fixture.body, secret: fixture.secret, nowSeconds: fixture.timestamp,
    })).toEqual({ ok: false })

    expect(verifyServiceRequest({
      clientId: 'lsuperagent-pro', allowedClientId: 'lsuperagent-pro', signature,
      timestamp: String(fixture.timestamp), requestId: fixture.requestId,
      body: fixture.body, secret: fixture.secret, nowSeconds: fixture.timestamp + 301,
    })).toEqual({ ok: false })

    expect(verifyServiceRequest({
      clientId: 'lsuperagent-pro', allowedClientId: 'lsuperagent-pro', signature: 'v1=' + '0'.repeat(64),
      timestamp: String(fixture.timestamp), requestId: fixture.requestId,
      body: fixture.body, secret: fixture.secret, nowSeconds: fixture.timestamp,
    })).toEqual({ ok: false })
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `projects/lsuperagent-control-center`:

```bash
pnpm vitest run tests/unit/gateway-service-auth.test.ts
```

Expected: FAIL because `src/lib/gateway/service-auth.ts` does not exist.

- [ ] **Step 3: Implement gateway types and HMAC verification**

```ts
// src/lib/gateway/types.ts
export type GatewayCaller = {
  kind: 'service'
  clientId: 'lsuperagent-pro'
  authMethod: 'hmac-sha256-v1'
}

export type GatewayContext = {
  requestId: string
  caller: GatewayCaller
  userId: null
  workspaceId: string | null
  action: 'chat'
  input: { message: string }
  receivedAt: string
}

export type CanonicalChatRequest = {
  message: string
  workspaceId?: string | null
}

export type PublicGatewayCode =
  | 'INVALID_REQUEST'
  | 'FORBIDDEN'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR'
```

```ts
// src/lib/gateway/service-auth.ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const MAX_CLOCK_SKEW_SECONDS = 300
const SIGNATURE_RE = /^v1=([0-9a-f]{64})$/

export function createSignature(input: {
  secret: string
  timestamp: number
  requestId: string
  body: string
}): string {
  const bodyHash = createHash('sha256').update(input.body).digest('hex')
  const signingInput = `v1\n${input.timestamp}\n${input.requestId}\n${bodyHash}`
  return `v1=${createHmac('sha256', input.secret).update(signingInput).digest('hex')}`
}

export function verifyServiceRequest(input: {
  clientId: string | null
  allowedClientId: string
  signature: string | null
  timestamp: string | null
  requestId: string | null
  body: string
  secret: string
  nowSeconds: number
}): { ok: true; clientId: 'lsuperagent-pro' } | { ok: false } {
  if (input.clientId !== 'lsuperagent-pro' || input.clientId !== input.allowedClientId) return { ok: false }
  if (!input.signature || !input.timestamp || !input.requestId || !input.secret) return { ok: false }

  const timestamp = Number(input.timestamp)
  if (!Number.isInteger(timestamp) || Math.abs(input.nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) return { ok: false }

  const match = SIGNATURE_RE.exec(input.signature)
  if (!match) return { ok: false }

  const expected = createSignature({
    secret: input.secret,
    timestamp,
    requestId: input.requestId,
    body: input.body,
  })

  const suppliedBuffer = Buffer.from(input.signature)
  const expectedBuffer = Buffer.from(expected)
  if (suppliedBuffer.length !== expectedBuffer.length) return { ok: false }
  if (!timingSafeEqual(suppliedBuffer, expectedBuffer)) return { ok: false }

  return { ok: true, clientId: 'lsuperagent-pro' }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
pnpm vitest run tests/unit/gateway-service-auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gateway/types.ts src/lib/gateway/service-auth.ts tests/unit/gateway-service-auth.test.ts
git commit -m "feat(lsuperagent): add canonical gateway service auth"
```

---

### Task 2: Strict Chat Validation and Gateway Context

**Files:**
- Create: `projects/lsuperagent-control-center/src/lib/gateway/chat-request.ts`
- Create: `projects/lsuperagent-control-center/src/lib/gateway/context.ts`
- Test: `projects/lsuperagent-control-center/tests/unit/gateway-chat-context.test.ts`

**Interfaces:**
- Consumes: parsed JSON body, verified service caller, request ID.
- Produces: `parseCanonicalChatRequest(input): CanonicalChatRequest`, `buildGatewayContext(input): GatewayContext`.

- [ ] **Step 1: Write failing validation/context tests**

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseCanonicalChatRequest } from '../../src/lib/gateway/chat-request'
import { buildGatewayContext } from '../../src/lib/gateway/context'

describe('canonical chat request', () => {
  it('normalizes valid input and preserves null user identity', () => {
    const request = parseCanonicalChatRequest({ message: '  hello  ', workspaceId: 'w1' })
    expect(request).toEqual({ message: 'hello', workspaceId: 'w1' })

    const context = buildGatewayContext({
      request,
      requestId: '11111111-1111-4111-8111-111111111111',
      receivedAt: '2026-08-21T00:00:00.000Z',
    })

    expect(context).toMatchObject({
      requestId: '11111111-1111-4111-8111-111111111111',
      caller: { kind: 'service', clientId: 'lsuperagent-pro', authMethod: 'hmac-sha256-v1' },
      userId: null,
      workspaceId: 'w1',
      action: 'chat',
      input: { message: 'hello' },
    })
  })

  it.each([
    null,
    [],
    {},
    { message: '' },
    { message: 'x'.repeat(12001) },
    { message: 'hello', provider: 'browser-selected' },
    { message: 'hello', userId: 'browser-user' },
    { message: 'hello', workspaceId: 123 },
  ])('rejects invalid authority-bearing or malformed input %#', (input) => {
    expect(() => parseCanonicalChatRequest(input)).toThrow('invalid_chat_request')
  })
})
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
pnpm vitest run tests/unit/gateway-chat-context.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement strict parser and context builder**

```ts
// src/lib/gateway/chat-request.ts
import type { CanonicalChatRequest } from './types'

const allowedKeys = new Set(['message', 'workspaceId'])

export function parseCanonicalChatRequest(input: unknown): CanonicalChatRequest {
  if (input === null || Array.isArray(input) || typeof input !== 'object') throw new Error('invalid_chat_request')
  const record = input as Record<string, unknown>
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) throw new Error('invalid_chat_request')
  if (typeof record.message !== 'string') throw new Error('invalid_chat_request')

  const message = record.message.trim()
  if (message.length < 1 || message.length > 12000) throw new Error('invalid_chat_request')

  const workspaceId = record.workspaceId
  if (workspaceId !== undefined && workspaceId !== null && typeof workspaceId !== 'string') {
    throw new Error('invalid_chat_request')
  }

  return { message, workspaceId: workspaceId === undefined ? undefined : workspaceId }
}
```

```ts
// src/lib/gateway/context.ts
import type { CanonicalChatRequest, GatewayContext } from './types'

export function buildGatewayContext(input: {
  request: CanonicalChatRequest
  requestId: string
  receivedAt?: string
}): GatewayContext {
  return {
    requestId: input.requestId,
    caller: { kind: 'service', clientId: 'lsuperagent-pro', authMethod: 'hmac-sha256-v1' },
    userId: null,
    workspaceId: input.request.workspaceId ?? null,
    action: 'chat',
    input: { message: input.request.message },
    receivedAt: input.receivedAt ?? new Date().toISOString(),
  }
}
```

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
pnpm vitest run tests/unit/gateway-chat-context.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gateway/chat-request.ts src/lib/gateway/context.ts tests/unit/gateway-chat-context.test.ts
git commit -m "feat(lsuperagent): normalize canonical chat context"
```

---

### Task 3: Canonical `POST /api/chat` Fail-Closed Route

**Files:**
- Create: `projects/lsuperagent-control-center/src/lib/gateway/response.ts`
- Create: `projects/lsuperagent-control-center/src/app/api/chat/route.ts`
- Test: `projects/lsuperagent-control-center/tests/integration/chat-route.test.ts`

**Interfaces:**
- Consumes: HMAC headers, raw request body, `LSUPERAGENT_GATEWAY_SHARED_SECRET`, `LSUPERAGENT_GATEWAY_ALLOWED_CLIENT`.
- Produces: authenticated canonical gateway response or sanitized 400/403/500 error response.

- [ ] **Step 1: Write failing route tests**

The tests set server environment variables to deterministic fixture values, sign the exact raw JSON body with `createSignature`, then assert:

```ts
expect(validResponse.status).toBe(503)
expect(await validResponse.json()).toMatchObject({
  gateway: 'CONNECTED',
  execution: 'NOT_CONNECTED',
  code: 'UPSTREAM_UNAVAILABLE',
})
```

Also assert malformed JSON -> `400 INVALID_REQUEST`, missing/invalid/stale auth -> `403 FORBIDDEN`, and response text excludes stack/env/signature material.

- [ ] **Step 2: Run route test and verify RED**

```bash
pnpm vitest run tests/integration/chat-route.test.ts
```

Expected: FAIL because `src/app/api/chat/route.ts` does not exist.

- [ ] **Step 3: Implement sanitized response helpers**

```ts
// src/lib/gateway/response.ts
import { NextResponse } from 'next/server'
import type { PublicGatewayCode } from './types'

export function gatewayError(status: number, requestId: string, code: PublicGatewayCode) {
  return NextResponse.json({ requestId, code }, { status })
}

export function providerDisabled(requestId: string) {
  return NextResponse.json({
    requestId,
    gateway: 'CONNECTED',
    execution: 'NOT_CONNECTED',
    code: 'UPSTREAM_UNAVAILABLE',
    message: 'Canonical gateway verified the request; provider execution is disabled in R3.',
  }, { status: 503 })
}
```

- [ ] **Step 4: Implement the canonical route**

Route algorithm:

```ts
const serverCorrelationId = randomUUID()
const rawBody = await request.text()
const requestIdHeader = request.headers.get('x-lsuperagent-request-id')
const correlationId = requestIdHeader && UUID_RE.test(requestIdHeader) ? requestIdHeader : serverCorrelationId

// Read server-only configuration.
const secret = process.env.LSUPERAGENT_GATEWAY_SHARED_SECRET ?? ''
const allowedClientId = process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENT ?? 'lsuperagent-pro'

// Verify HMAC before trusting body/request ID.
const auth = verifyServiceRequest({ ...headers, body: rawBody, secret, allowedClientId, nowSeconds: Math.floor(Date.now() / 1000) })
if (!auth.ok) return gatewayError(403, correlationId, 'FORBIDDEN')

// Parse exact raw body once authentication is established.
let parsed: unknown
try { parsed = JSON.parse(rawBody) } catch { return gatewayError(400, correlationId, 'INVALID_REQUEST') }

let chatRequest
try { chatRequest = parseCanonicalChatRequest(parsed) } catch { return gatewayError(400, correlationId, 'INVALID_REQUEST') }

buildGatewayContext({ request: chatRequest, requestId: correlationId })
return providerDisabled(correlationId)
```

Unexpected exceptions return `500 INTERNAL_ERROR` using only the correlation ID. Do not log secret/signature values.

- [ ] **Step 5: Run route + health regression tests**

```bash
pnpm vitest run tests/integration/chat-route.test.ts tests/integration/health-route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gateway/response.ts src/app/api/chat/route.ts tests/integration/chat-route.test.ts
git commit -m "feat(lsuperagent): add canonical r3 chat gateway"
```

---

### Task 4: R3 Security Boundary and CI Verification

**Files:**
- Create: `projects/lsuperagent-control-center/tests/integration/r3-security-boundary.test.ts`
- Create: `.github/workflows/lsuperagent-r3-gateway-verify.yml`

**Interfaces:**
- Consumes: source tree produced by Tasks 1-3.
- Produces: read-only CI evidence that R3 is limited to `/api/health` + `/api/chat`, contains no provider/Supabase execution, and fully builds.

- [ ] **Step 1: Write the security-boundary test**

Assert with `existsSync` that `src/app/api/health/route.ts` and `src/app/api/chat/route.ts` exist while these paths do not:

```text
src/app/api/execute/route.ts
src/app/api/memory/route.ts
src/app/api/memory/candidate/route.ts
src/app/api/tools/route.ts
src/app/api/audit/route.ts
```

Read `src/app/api/chat/route.ts` and `src/lib/gateway/*.ts`; assert the joined source does not contain provider client imports, direct Supabase imports, hard-coded token-like values, or `NEXT_PUBLIC_LSUPERAGENT_GATEWAY` configuration.

- [ ] **Step 2: Run full tests**

```bash
pnpm vitest run
```

Expected: all tests PASS.

- [ ] **Step 3: Add read-only R3 workflow**

Workflow requirements:

```yaml
permissions:
  contents: read
```

Trigger on PRs to the branch used by the existing LSUPERAGENT Control Center work and paths under `projects/lsuperagent-control-center/**` plus the workflow itself. Steps:

```text
checkout
pnpm setup v10
Node 22
pnpm install --frozen-lockfile
pnpm vitest run
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Add shell checks that `/api/health` and `/api/chat` exist, disabled R4 routes do not exist, and gateway source contains no provider API call/direct Supabase mutation pattern.

- [ ] **Step 4: Run local-equivalent verification in GitHub Actions through the PR**

Expected current-head checks:

```text
Vitest: PASS
Lint: PASS (warnings may be noted but no errors)
TypeScript: PASS
Next.js production build: PASS
R3 route boundary: PASS
R3 offline/provider-disabled boundary: PASS
```

- [ ] **Step 5: Commit workflow and test**

```bash
git add tests/integration/r3-security-boundary.test.ts ../../.github/workflows/lsuperagent-r3-gateway-verify.yml
git commit -m "ci(lsuperagent): verify canonical r3 gateway boundary"
```

---

### Task 5: Canonical Source Review Gate

**Files:**
- No production source changes unless CI exposes a verified defect.
- PR: branch `agent/r3-canonical-gateway-v1` against the existing Control Center source branch/base selected after confirming repository history.

**Interfaces:**
- Consumes: current-head source + successful R3 CI.
- Produces: reviewable canonical R3 source artifact; no deployment.

- [ ] **Step 1: Verify current branch/head and compare against its intended base**

Confirm no unrelated W//FORGE/runtime files changed.

- [ ] **Step 2: Open a Draft PR**

PR body must state explicitly:

```text
Provider execution: disabled
Canonical Supabase mutation: none
Vercel deployment: none
Production/domain/DNS: unchanged
Next gate: canonical source verified, then implement PRO adapter source
```

- [ ] **Step 3: Fetch current-head workflow runs and logs**

Do not claim completion from an older SHA.

- [ ] **Step 4: If all current-head checks pass, mark canonical source stage**

```text
R3A_CANONICAL_SOURCE: VERIFIED
NEXT: R3B_PRO_ADAPTER_SOURCE
```

Do not merge or deploy at this task.
