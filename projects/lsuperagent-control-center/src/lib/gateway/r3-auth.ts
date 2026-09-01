import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { R3GatewayConfig } from './r3-config'

type SigningInput = {
  method: 'POST'
  path: '/api/chat'
  clientId: string
  requestId: string
  timestamp: number
  nonce: string
  rawBody: string
}

type VerifyInput = Omit<SigningInput, 'timestamp'> & {
  timestamp: string
  signature: string
  nowSeconds?: number
  config: R3GatewayConfig
}

export function buildR3SigningString(input: SigningInput): string {
  const bodyHash = createHash('sha256').update(input.rawBody).digest('hex')

  return [
    'v1',
    input.method,
    input.path,
    input.clientId,
    input.requestId,
    String(input.timestamp),
    input.nonce,
    bodyHash,
  ].join('\n')
}

export function verifyR3Authentication(
  input: VerifyInput,
): { ok: true; clientId: 'lsuperagent-pro' } | { ok: false } {
  if (
    input.clientId !== 'lsuperagent-pro' ||
    !input.config.allowedClients.includes(input.clientId) ||
    !input.requestId ||
    !input.nonce ||
    !/^[0-9a-f]{64}$/i.test(input.signature)
  ) {
    return { ok: false }
  }

  const requestTime = Number(input.timestamp)
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000)

  if (
    !Number.isInteger(requestTime) ||
    Math.abs(nowSeconds - requestTime) > 120
  ) {
    return { ok: false }
  }

  const signingString = buildR3SigningString({
    method: input.method,
    path: input.path,
    clientId: input.clientId,
    requestId: input.requestId,
    timestamp: requestTime,
    nonce: input.nonce,
    rawBody: input.rawBody,
  })

  const expected = createHmac('sha256', input.config.secret)
    .update(signingString)
    .digest()
  const actual = Buffer.from(input.signature, 'hex')

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false }
  }

  return { ok: true, clientId: 'lsuperagent-pro' }
}
