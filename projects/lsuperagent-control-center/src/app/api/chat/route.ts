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
    const correlationId =
      requestIdHeader && UUID_RE.test(requestIdHeader)
        ? requestIdHeader
        : serverCorrelationId

    const secret = process.env.LSUPERAGENT_GATEWAY_SHARED_SECRET ?? ''
    const allowedClientId =
      process.env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENT ?? 'lsuperagent-pro'

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

    if (!auth.ok) {
      return gatewayError(403, correlationId, 'FORBIDDEN')
    }

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
