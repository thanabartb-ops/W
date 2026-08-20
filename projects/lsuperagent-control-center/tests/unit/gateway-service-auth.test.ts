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
      clientId: 'other-client',
      allowedClientId: 'lsuperagent-pro',
      signature,
      timestamp: String(fixture.timestamp),
      requestId: fixture.requestId,
      body: fixture.body,
      secret: fixture.secret,
      nowSeconds: fixture.timestamp,
    })).toEqual({ ok: false })

    expect(verifyServiceRequest({
      clientId: 'lsuperagent-pro',
      allowedClientId: 'lsuperagent-pro',
      signature,
      timestamp: String(fixture.timestamp),
      requestId: fixture.requestId,
      body: fixture.body,
      secret: fixture.secret,
      nowSeconds: fixture.timestamp + 301,
    })).toEqual({ ok: false })

    expect(verifyServiceRequest({
      clientId: 'lsuperagent-pro',
      allowedClientId: 'lsuperagent-pro',
      signature: 'v1=' + '0'.repeat(64),
      timestamp: String(fixture.timestamp),
      requestId: fixture.requestId,
      body: fixture.body,
      secret: fixture.secret,
      nowSeconds: fixture.timestamp,
    })).toEqual({ ok: false })
  })
})
