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
      authorization: 'Bearer owner-jwt-test-only',
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
  delete process.env.RUNTIME_SHARED_SECRET
  vi.unstubAllGlobals()
})

describe('POST /api/chat canonical backend compatibility', () => {
  it('preserves backend CONNECTED evidence when xAI command execution fails closed', async () => {
    process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET = secret
    process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS = clientId
    process.env.LSUPERAGENT_BACKEND_URL =
      'https://example.supabase.co/functions/v1/lsuperagent-runtime'
    process.env.RUNTIME_SHARED_SECRET = 'runtime-shared-secret-for-test-only'

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'GET') {
          return new Response(
            JSON.stringify({
              ok: true,
              service: 'lsuperagent-runtime',
              version: '2026.08.21.1',
              database: 'CONNECTED',
              provider: 'xai',
              xai: 'CONFIGURED',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }

        expect(init?.method).toBe('POST')
        return new Response(
          JSON.stringify({ status: 'FAILED', provider: 'xai' }),
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
      provider: 'xai',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
