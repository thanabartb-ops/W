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
  const signature = options?.signature ?? createSignature({
    secret,
    timestamp,
    requestId,
    body,
  })

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

    const response = await POST(
      signedRequest(JSON.stringify({ message: 'hello', workspaceId: 'w1' })),
    )
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
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    }))
    expect(missing.status).toBe(403)

    const bad = await POST(
      signedRequest(JSON.stringify({ message: 'hello' }), {
        signature: 'v1=' + '0'.repeat(64),
      }),
    )
    expect(bad.status).toBe(403)

    const stale = await POST(
      signedRequest(JSON.stringify({ message: 'hello' }), { stale: true }),
    )
    expect(stale.status).toBe(403)
  })

  it('does not leak internal authentication or environment material', async () => {
    vi.stubEnv(secretName, secret)
    vi.stubEnv(clientName, 'lsuperagent-pro')

    const response = await POST(
      signedRequest(JSON.stringify({ message: 'hello' }), {
        signature: 'v1=' + '0'.repeat(64),
      }),
    )
    const text = (await response.text()).toLowerCase()

    for (const marker of [
      'stack',
      'signature',
      secret.toLowerCase(),
      secretName.toLowerCase(),
    ]) {
      expect(text).not.toContain(marker)
    }
  })
})
