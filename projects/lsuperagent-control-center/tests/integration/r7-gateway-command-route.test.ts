// @vitest-environment node
import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildR3SigningString } from '../../src/lib/gateway/r3-auth'
import { POST } from '../../src/app/api/chat/route'

const secret = 'route-test-r7-secret'
const clientId = 'lsuperagent-pro'
const requestId = 'req-route-r7-001'
const timestamp = Math.floor(Date.now() / 1000)
const nonce = 'nonce-route-r7-001'
const ownerToken = 'owner-jwt-for-test-only'

function body() {
  return JSON.stringify({
    requestId,
    workspaceId: null,
    action: 'chat',
    input: { message: 'Return a bounded deterministic command.' },
  })
}

function signedRequest(withOwnerAuth = true) {
  const rawBody = body()
  const signingString = buildR3SigningString({
    method: 'POST',
    path: '/api/chat',
    clientId,
    requestId,
    timestamp,
    nonce,
    rawBody,
  })
  const signature = createHmac('sha256', secret)
    .update(signingString)
    .digest('hex')

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-lsuperagent-client': clientId,
    'x-lsuperagent-request-id': requestId,
    'x-lsuperagent-timestamp': String(timestamp),
    'x-lsuperagent-nonce': nonce,
    'x-lsuperagent-signature': signature,
  }
  if (withOwnerAuth) headers.authorization = `Bearer ${ownerToken}`

  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers,
    body: rawBody,
  })
}

afterEach(() => {
  delete process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET
  delete process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS
  delete process.env.LSUPERAGENT_BACKEND_URL
  vi.unstubAllGlobals()
})

describe('POST /api/chat R7 authenticated command execution', () => {
  it('fails closed when the signed PRO request does not include owner auth', async () => {
    process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET = secret
    process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS = clientId
    process.env.LSUPERAGENT_BACKEND_URL =
      'https://example.supabase.co/functions/v1/lsuperagent-runtime'

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(signedRequest(false))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      requestId,
      status: 'failed',
      code: 'UNAUTHENTICATED',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards owner auth only in the Authorization header and returns verified xAI execution evidence', async () => {
    process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET = secret
    process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS = clientId
    process.env.LSUPERAGENT_BACKEND_URL =
      'https://example.supabase.co/functions/v1/lsuperagent-runtime'

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
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
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe(`Bearer ${ownerToken}`)
      expect(String(init?.body)).not.toContain(ownerToken)
      expect(JSON.parse(String(init?.body))).toEqual({
        user_request: 'Return a bounded deterministic command.',
      })

      return new Response(
        JSON.stringify({
          status: 'EXECUTED',
          runtime_version: '2026.08.21.1',
          provider: 'xai',
          model: 'grok-build-0.1',
          command: { action: 'NOOP', parameters: [] },
          evidence: {
            provider_request_id: 'xai-request-1',
            correlation_id: 'corr-1',
            qa_run_id: 'qa-1',
            duration_ms: 120,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(signedRequest(true))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      requestId,
      status: 'verified',
      gateway: 'CONNECTED',
      backend: 'CONNECTED',
      provider: 'xai',
      data: {
        status: 'EXECUTED',
        runtime_version: '2026.08.21.1',
        provider: 'xai',
        model: 'grok-build-0.1',
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
