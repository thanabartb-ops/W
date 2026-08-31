import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildR3SigningString,
  verifyR3Authentication,
} from '../../src/lib/gateway/r3-auth'
import { readR3GatewayConfig } from '../../src/lib/gateway/r3-config'

const secret = 'unit-test-r3-secret'
const clientId = 'lsuperagent-pro'
const requestId = 'req-r3-001'
const timestamp = 1_800_000_000
const nonce = 'nonce-r3-001'
const rawBody = JSON.stringify({
  requestId,
  workspaceId: null,
  action: 'chat',
  input: { message: 'hello' },
})

function signatureFor(body: string = rawBody) {
  const bodyHash = createHash('sha256').update(body).digest('hex')
  const signingString = [
    'v1',
    'POST',
    '/api/chat',
    clientId,
    requestId,
    String(timestamp),
    nonce,
    bodyHash,
  ].join('\n')
  return createHmac('sha256', secret).update(signingString).digest('hex')
}

describe('R3 canonical service authentication', () => {
  it('builds the exact approved v1 signing string', () => {
    const bodyHash = createHash('sha256').update(rawBody).digest('hex')

    expect(
      buildR3SigningString({
        method: 'POST',
        path: '/api/chat',
        clientId,
        requestId,
        timestamp,
        nonce,
        rawBody,
      }),
    ).toBe(
      [
        'v1',
        'POST',
        '/api/chat',
        clientId,
        requestId,
        String(timestamp),
        nonce,
        bodyHash,
      ].join('\n'),
    )
  })

  it('accepts a valid client, timestamp and signature', () => {
    expect(
      verifyR3Authentication({
        method: 'POST',
        path: '/api/chat',
        clientId,
        requestId,
        timestamp: String(timestamp),
        nonce,
        signature: signatureFor(),
        rawBody,
        nowSeconds: timestamp,
        config: { secret, allowedClients: [clientId] },
      }),
    ).toEqual({ ok: true, clientId })
  })

  it.each([
    ['wrong secret', { signature: createHmac('sha256', 'wrong').update('x').digest('hex') }],
    ['unknown client', { clientId: 'unknown-client' }],
    ['stale timestamp', { timestamp: String(timestamp - 121), nowSeconds: timestamp }],
  ])('rejects %s', (_label, override) => {
    expect(
      verifyR3Authentication({
        method: 'POST',
        path: '/api/chat',
        clientId,
        requestId,
        timestamp: String(timestamp),
        nonce,
        signature: signatureFor(),
        rawBody,
        nowSeconds: timestamp,
        config: { secret, allowedClients: [clientId] },
        ...override,
      }),
    ).toEqual({ ok: false })
  })

  it('fails closed when required gateway configuration is incomplete', () => {
    expect(
      readR3GatewayConfig({
        LSUPERAGENT_GATEWAY_HMAC_SECRET: '',
        LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS: clientId,
      }),
    ).toBeNull()

    expect(
      readR3GatewayConfig({
        LSUPERAGENT_GATEWAY_HMAC_SECRET: secret,
        LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS: '',
      }),
    ).toBeNull()
  })
})
