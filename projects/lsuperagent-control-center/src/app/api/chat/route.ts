import { randomUUID } from 'node:crypto'
import { executeCanonicalCommand } from '../../../lib/backend/lsuperagent-command'
import { probeCanonicalBackend } from '../../../lib/backend/lsuperagent-runtime'
import { verifyR3Authentication } from '../../../lib/gateway/r3-auth'
import { readR3GatewayConfig } from '../../../lib/gateway/r3-config'
import { parseCanonicalChatRequest } from '../../../lib/gateway/r3-contract'

function failedResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return Response.json(body, { status })
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const headerRequestId = request.headers.get('x-lsuperagent-request-id') ?? ''
  const publicRequestId = headerRequestId || randomUUID()
  const config = readR3GatewayConfig()

  if (!config) {
    return failedResponse(503, {
      requestId: publicRequestId,
      status: 'failed',
      code: 'UPSTREAM_UNAVAILABLE',
      gateway: 'BLOCKED',
      backend: 'NOT_CONNECTED',
    })
  }

  const auth = verifyR3Authentication({
    method: 'POST',
    path: '/api/chat',
    clientId: request.headers.get('x-lsuperagent-client') ?? '',
    requestId: headerRequestId,
    timestamp: request.headers.get('x-lsuperagent-timestamp') ?? '',
    nonce: request.headers.get('x-lsuperagent-nonce') ?? '',
    signature: request.headers.get('x-lsuperagent-signature') ?? '',
    rawBody,
    config,
  })

  if (!auth.ok) {
    return failedResponse(401, {
      requestId: publicRequestId,
      status: 'failed',
      code: 'UNAUTHENTICATED',
    })
  }

  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ') || authorization.length <= 7) {
    return failedResponse(401, {
      requestId: publicRequestId,
      status: 'failed',
      code: 'UNAUTHENTICATED',
    })
  }
  const userAuthToken = authorization.slice(7)

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(rawBody)
  } catch {
    return failedResponse(400, {
      requestId: headerRequestId,
      status: 'failed',
      code: 'INVALID_REQUEST',
    })
  }

  let chatRequest
  try {
    chatRequest = parseCanonicalChatRequest(parsedBody, headerRequestId)
  } catch {
    return failedResponse(400, {
      requestId: headerRequestId,
      status: 'failed',
      code: 'INVALID_REQUEST',
    })
  }

  const backend = await probeCanonicalBackend()
  if (backend.status !== 'connected') {
    return failedResponse(503, {
      requestId: headerRequestId,
      status: 'failed',
      code: 'UPSTREAM_UNAVAILABLE',
      gateway: 'CONNECTED',
      backend: 'NOT_CONNECTED',
    })
  }

  const execution = await executeCanonicalCommand({
    userAuthToken,
    message: chatRequest.input.message,
  })

  if (execution.status === 'unauthenticated') {
    return failedResponse(401, {
      requestId: headerRequestId,
      status: 'failed',
      code: 'UNAUTHENTICATED',
    })
  }

  if (execution.status === 'forbidden') {
    return failedResponse(403, {
      requestId: headerRequestId,
      status: 'failed',
      code: 'FORBIDDEN',
    })
  }

  if (execution.status === 'blocked') {
    return failedResponse(429, {
      requestId: headerRequestId,
      status: 'blocked',
      code: 'POLICY_BLOCKED',
    })
  }

  if (execution.status !== 'verified') {
    return failedResponse(503, {
      requestId: headerRequestId,
      status: 'failed',
      code: 'UPSTREAM_UNAVAILABLE',
      gateway: 'CONNECTED',
      backend: 'CONNECTED',
      provider: backend.provider,
    })
  }

  return Response.json(
    {
      requestId: headerRequestId,
      status: 'verified',
      gateway: 'CONNECTED',
      backend: 'CONNECTED',
      provider: 'xai',
      data: execution.data,
    },
    { status: 200 },
  )
}
