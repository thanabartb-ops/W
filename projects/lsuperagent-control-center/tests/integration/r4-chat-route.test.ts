// @vitest-environment node
import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildR3SigningString } from '../../src/lib/gateway/r3-auth'
import { POST } from '../../src/app/api/chat/route'

const secret = 'route-test-r4-secret'
const clientId = 'lsuperagent-pro'
const requestId = 'req-route-r4-001'
const timestamp = Math.floor(Date.now() / 1000)
const nonce = 'nonce-route-r4-001'

function canonicalBody() {
  return JSON.stringify({
    requestId,
    workspaceId: null,
    action: 'chat',
    input: { message: 'backend-health-only' },
  })
}

function signedRequest() {
  const body = canonicalBody()
  const signingString = buildR3SigningString({
    method: 'POST',
    path: '/api/chat',
    clientId,
    requestId,
    timestamp,
    nonce,
    rawBody: body,
  })
  const signature = createHmac('sha256', secret)
    .update(signingString)
    .digest('hex')

  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-lsuperagent-client': clientId,
      'x-lsuperagent-request-id': requestId,
      'x-lsuperagent-timestamp': String(timestamp),
      'x-lsuperagent-nonce': nonce,
      'x-lsuperagent-signature': signature,
    },
    body,
  })
}

afterEach(() => {
  delete process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET
  delete process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS
  delete process.env.LSUPERAGENT_BACKEND_URL
  vi.unstubAllGlobals()
})

describe('POST /api/chat R4 backend connection', () => {
  it('reports backend CONNECTED after a read-only canonical runtime health probe while provider execution remains disabled', async () => {
    process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET = secret
    process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS = clientId
    process.env.LSUPERAGENT_BACKEND_URL =
      'https://example.supabase.co/functions/v1/lsuperagent-runtime'

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('GET')
        return new Response(
          JSON.stringify({
            ok: false,
            service: 'lsuperagent-runtime',
            version: '2026.08.18.1',
            database: 'CONNECTED',
            openai: 'CONFIGURED',
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        )
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(signedRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      requestId,
      status: 'failed',
      code: 'UPSTREAM_UNAVAILABLE',
      gateway: 'CONNECTED',
      backend: 'CONNECTED',
      provider: 'DISABLED',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
