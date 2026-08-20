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
  if (input.clientId !== 'lsuperagent-pro' || input.clientId !== input.allowedClientId) {
    return { ok: false }
  }
  if (!input.signature || !input.timestamp || !input.requestId || !input.secret) {
    return { ok: false }
  }
  if (!SIGNATURE_RE.test(input.signature)) {
    return { ok: false }
  }

  const timestamp = Number(input.timestamp)
  if (
    !Number.isInteger(timestamp) ||
    Math.abs(input.nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS
  ) {
    return { ok: false }
  }

  const expected = createSignature({
    secret: input.secret,
    timestamp,
    requestId: input.requestId,
    body: input.body,
  })

  const suppliedBuffer = Buffer.from(input.signature)
  const expectedBuffer = Buffer.from(expected)
  if (suppliedBuffer.length !== expectedBuffer.length) {
    return { ok: false }
  }
  if (!timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return { ok: false }
  }

  return { ok: true, clientId: 'lsuperagent-pro' }
}
