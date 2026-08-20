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
- Existing `.env.example` remains the R1 public two-variable contract; server-only R3 values are injected only at preview configuration time and are not added to that file.

---

### Task 1: HMAC Service Authentication Boundary

**Files:**
- Create: `projects/lsuperagent-control-center/src/lib/gateway/types.ts`
- Create: `projects/lsuperagent-control-center/src/lib/gateway/service-auth.ts`
- Test: `projects/lsuperagent-control-center/tests/unit/gateway-service-auth.test.ts`

**Interfaces:**
- Consumes: raw request headers, raw body string, server-only shared secret, current Unix seconds.
- Produces: `verifyServiceRequest(input)`, `createSignature(input)`, canonical service caller types.

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
    expect(verifyServiceRequest({
      clientId: 'lsuperagent-pro',
      allowedClientId: 'lsuperagent-pro',
      signature,
      timestamp: String(fixture.timestamp),
      requestId: fixture.requestId,
      body: fixture.body,
      secret: fixture.secret,
      nowSeconds: fixture.timestamp + 10,
    })).toEqual({ ok: true, clientId: 'lsuperagent-pro' })
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
      clientId: 'lsuperagent-pro', allowedClientId: 'lsuperagent-pro',
      signature: 'v1=' + '0'.repeat(64), timestamp: String(fixture.timestamp),
      requestId: fixture.requestId, body: fixture.body, secret: fixture.secret,
      nowSeconds: fixture.timestamp,
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
const SIGNATURE_RE = /^v1=[0-9a-f]{64}$/

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
  if (!SIGNATURE_RE.test(input.signature)) return { ok: false }

  const timestamp = Number(input.timestamp)
  if (!Number.isInteger(timestamp) || Math.abs(input.nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) return { ok: false }

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
- Consumes: parsed JSON body and trusted request ID.
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
- Produces: authenticated gateway handshake or sanitized 400/403/500 response.

- [ ] **Step 1: Write the failing route tests**

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSignature } from '../../src/lib/gateway/service-auth'
import { POST } from '../../src/app/api/chat/route'

const secretName = 'LSUPERAGENT_GATEWAY_' + 'SHARED_SECRET'
const clientName = 'LSUPERAGENT_GATEWAY_' + 'ALLOWED_CLIENT'
const secret = 'unit-test-secret-only'

function signedRequest(body: string, options?: { stale?: boolean; signature?: string }) {
  const now = Math.floor(Date.now() / 1000)
  const timestamp = options?.stale ? now - 301 : now
  const requestId = '11111111-1111-4111-8111-111111111111'
  const signature = options?.signature ?? createSignature({ secret, timestamp, requestId, body })

  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-lsuperagent-client': 'lsuperagent-pro',
      'x-lsuperagent-timestamp': String(timestamp),
      'x-lsuperagent-request-id': requestId,
      'x-lsuperagent-signature': signature,
    },
    body,
  })
}

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/chat canonical gateway', () => {
  it('authenticates the service request but keeps execution disabled', async () => {
    vi.stubEnv(secretName, secret)
    vi.stubEnv(clientName, 'lsuperagent-pro')

    const response = await POST(signedRequest(JSON.stringify({ message: 'hello', workspaceId: 'w1' })))
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload).toMatchObject({
      requestId: '11111111-1111-4111-8111-111111111111',
      gateway: 'CONNECTED',
      execution: 'NOT_CONNECTED',
      code: 'UPSTREAM_UNAVAILABLE',
    })
  })

  it('rejects malformed JSON after valid transport authentication', async () => {
    vi.stubEnv(secretName, secret)
    vi.stubEnv(clientName, 'lsuperagent-pro')
    const response = await POST(signedRequest('{not-json'))
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('INVALID_REQUEST')
  })

  it('rejects missing, invalid, and stale transport authentication', async () => {
    vi.stubEnv(secretName, secret)
    vi.stubEnv(clientName, 'lsuperagent-pro')

    const missing = await POST(new Request('http://localhost/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    }))
    expect(missing.status).toBe(403)

    const bad = await POST(signedRequest(JSON.stringify({ message: 'hello' }), { signature: 'v1=' + '0'.repeat(64) }))
    expect(bad.status).toBe(403)

    const stale = await POST(signedRequest(JSON.stringify({ message: 'hello' }), { stale: true }))
    expect(stale.status).toBe(403)
  })

  it('does not leak internal authentication or environment material', async () => {
    vi.stubEnv(secretName, secret)
    vi.stubEnv(clientName, 'lsuperagent-pro')
    const response = await POST(signedRequest(JSON.stringify({ message: 'hello' }), { signature: 'v1=' + '0'.repeat(64) }))
    const text = (await response.text()).toLowerCase()
    for (const marker of ['stack', 'signature', secret.toLowerCase(), secretName.toLowerCase()]) {
      expect(text).not.toContain(marker)
    }
  })
})
```

- [ ] **Step 2: Run the route test and verify RED**

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

- [ ] **Step 4: Implement the complete canonical route**

```ts
// src/app/api/chat/route.ts
import { randomUUID } from 'node:crypto'
import { parseCanonicalChatRequest } from '@/lib/gateway/chat-request'
import { buildGatewayContext } from '@/lib/gateway/context'
import { gatewayError, providerDisabled } from '@/lib/gateway/response'
import { verifyServiceRequest } from '@/lib/gateway/service-auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const serverCorrelationId = randomUUID()

  try {
    const rawBody = await request.text()
    const requestIdHeader = request.headers.get('x-lsuperagent-request-id')
    const correlationId = requestIdHeader && UUID_RE.test(requestIdHeader)
      ? requestIdHeader
      : serverCorrelationId

    const secret = process.env.LSUPERAGENT_GATEWAY_SHARED_SECRET ?? ''
    const allowedClientId = process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENT ?? 'lsuperagent-pro'

    const auth = verifyServiceRequest({
      clientId: request.headers.get('x-lsuperagent-client'),
      allowedClientId,
      signature: request.headers.get('x-lsuperagent-signature'),
      timestamp: request.headers.get('x-lsuperagent-timestamp'),
      requestId: requestIdHeader,
      body: rawBody,
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    })

    if (!auth.ok) return gatewayError(403, correlationId, 'FORBIDDEN')

    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return gatewayError(400, correlationId, 'INVALID_REQUEST')
    }

    let chatRequest
    try {
      chatRequest = parseCanonicalChatRequest(parsed)
    } catch {
      return gatewayError(400, correlationId, 'INVALID_REQUEST')
    }

    buildGatewayContext({ request: chatRequest, requestId: correlationId })
    return providerDisabled(correlationId)
  } catch {
    return gatewayError(500, serverCorrelationId, 'INTERNAL_ERROR')
  }
}
```

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

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const disabledRoutes = [
  'src/app/api/execute/route.ts',
  'src/app/api/memory/route.ts',
  'src/app/api/memory/candidate/route.ts',
  'src/app/api/tools/route.ts',
  'src/app/api/audit/route.ts',
]

describe('R3 canonical gateway authority boundary', () => {
  it('exposes only health and chat server routes for R3', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/api/health/route.ts'))).toBe(true)
    expect(existsSync(resolve(process.cwd(), 'src/app/api/chat/route.ts'))).toBe(true)
    for (const route of disabledRoutes) expect(existsSync(resolve(process.cwd(), route))).toBe(false)
  })

  it('does not introduce provider, direct Supabase, or public gateway authority', () => {
    const sourcePaths = [
      'src/app/api/chat/route.ts',
      'src/lib/gateway/service-auth.ts',
      'src/lib/gateway/chat-request.ts',
      'src/lib/gateway/context.ts',
      'src/lib/gateway/response.ts',
      'src/lib/gateway/types.ts',
    ]
    const source = sourcePaths.map((path) => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n').toLowerCase()
    const forbidden = [
      '@supabase/',
      'openai',
      'anthropic',
      'gemini',
      'next_public_lsuperagent_gateway',
      'service_' + 'role',
    ]
    for (const marker of forbidden) expect(source).not.toContain(marker)
  })
})
```

- [ ] **Step 2: Run full tests**

```bash
pnpm vitest run
```

Expected: all tests PASS.

- [ ] **Step 3: Add the exact read-only R3 workflow**

```yaml
name: LSUPERAGENT R3 Gateway Verify

on:
  pull_request:
    branches:
      - agent/lsuperagent-control-center-v1
    paths:
      - 'projects/lsuperagent-control-center/**'
      - '.github/workflows/lsuperagent-r3-gateway-verify.yml'

permissions:
  contents: read

jobs:
  verify:
    name: R3_GATEWAY verification
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: projects/lsuperagent-control-center

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm
          cache-dependency-path: projects/lsuperagent-control-center/pnpm-lock.yaml

      - name: Install frozen dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify R3 route boundary
        shell: bash
        run: |
          set -euo pipefail
          test -f src/app/api/health/route.ts
          test -f src/app/api/chat/route.ts
          for route in \
            src/app/api/execute/route.ts \
            src/app/api/memory/route.ts \
            src/app/api/memory/candidate/route.ts \
            src/app/api/tools/route.ts \
            src/app/api/audit/route.ts; do
            test ! -e "$route"
          done

      - name: Verify provider-disabled source boundary
        shell: bash
        run: |
          set -euo pipefail
          ! grep -RIE '(@supabase/|openai|anthropic|gemini|NEXT_PUBLIC_LSUPERAGENT_GATEWAY)' \
            src/app/api/chat src/lib/gateway

      - name: Vitest
        run: pnpm vitest run

      - name: Lint
        run: pnpm lint

      - name: TypeScript
        run: pnpm exec tsc --noEmit

      - name: Production build
        run: pnpm build
```

- [ ] **Step 4: Open a Draft PR to the exact source base**

```text
head: agent/r3-canonical-gateway-v1
base: agent/lsuperagent-control-center-v1
```

PR body must state:

```text
Provider execution: disabled
Canonical Supabase mutation: none
Vercel deployment: none
Production/domain/DNS: unchanged
Next stage after current-head CI: R3B_PRO_ADAPTER_SOURCE
```

- [ ] **Step 5: Verify GitHub Actions on the current PR head**

Expected:

```text
Vitest: PASS
Lint: PASS (warnings may be noted but no errors)
TypeScript: PASS
Next.js production build: PASS
R3 route boundary: PASS
R3 provider-disabled boundary: PASS
```

- [ ] **Step 6: Commit workflow and test**

```bash
git add tests/integration/r3-security-boundary.test.ts
git add ../../.github/workflows/lsuperagent-r3-gateway-verify.yml
git commit -m "ci(lsuperagent): verify canonical r3 gateway boundary"
```

---

### Task 5: Canonical Source Review Gate

**Files:**
- No production source changes unless current-head CI exposes a verified defect.
- PR: `agent/r3-canonical-gateway-v1` -> `agent/lsuperagent-control-center-v1`.

**Interfaces:**
- Consumes: current-head source + successful R3 CI.
- Produces: reviewable canonical R3 source artifact; no merge or deployment.

- [ ] **Step 1: Compare the PR head against `agent/lsuperagent-control-center-v1`**

Confirm only the R3 spec/plan, canonical gateway source/tests, and R3 verification workflow changed. No unrelated W//FORGE runtime files may be included.

- [ ] **Step 2: Fetch current-head workflow runs and logs**

Do not claim completion from an older SHA.

- [ ] **Step 3: If all current-head checks pass, record the canonical source stage**

```text
R3A_CANONICAL_SOURCE: VERIFIED
PROVIDER_EXECUTION: DISABLED
CANONICAL_DATA_MUTATION: NONE
DEPLOYMENT: NONE
NEXT: R3B_PRO_ADAPTER_SOURCE
```

- [ ] **Step 4: Do not merge or deploy**

The next source task is the LSUPERAGENT PRO adapter plan/execution. Preview deployment and real secret injection remain blocked until `PRO-R3_CANONICAL_GATEWAY_PREVIEW_APPROVAL_REQUIRED` is explicitly approved.
