// @vitest-environment node
import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { buildR3SigningString } from '../../src/lib/gateway/r3-auth'
import { POST } from '../../src/app/api/chat/route'

const secret = 'route-test-r3-secret'
const clientId = 'lsuperagent-pro'
const requestId = 'req-route-r3-001'
const timestamp = Math.floor(Date.now() / 1000)
const nonce = 'nonce-route-r3-001'

function canonicalBody(message = 'hello') {
  return JSON.stringify({
    requestId,
    workspaceId: null,
    action: 'chat',
    input: { message },
  })
}

function signedRequest(body = canonicalBody()) {
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

function enableGatewayConfig() {
  process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET = secret
  process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS = clientId
}

afterEach(() => {
  delete process.env.LSUPERAGENT_GATEWAY_HMAC_SECRET
  delete process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS
})

describe('POST /api/chat canonical R3 boundary', () => {
  it('fails closed when gateway configuration is missing', async () => {
    const response = await POST(signedRequest())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      gateway: 'BLOCKED',
      backend: 'NOT_CONNECTED',
    })
  })

  it('returns one public auth failure for missing/invalid service auth', async () => {
    enableGatewayConfig()
    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: canonicalBody(),
      }),
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('rejects an authenticated request whose contract is invalid', async () => {
    enableGatewayConfig()
    const invalidBody = JSON.stringify({
      requestId,
      workspaceId: null,
      action: 'chat',
      input: { message: 'hello', role: 'admin' },
    })
    const response = await POST(signedRequest(invalidBody))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      requestId,
      status: 'failed',
      code: 'INVALID_REQUEST',
    })
  })

  it('proves only the authenticated gateway handshake', async () => {
    enableGatewayConfig()
    const response = await POST(signedRequest())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      requestId,
      status: 'failed',
      code: 'UPSTREAM_UNAVAILABLE',
      gateway: 'CONNECTED',
      backend: 'NOT_CONNECTED',
    })
  })
})
