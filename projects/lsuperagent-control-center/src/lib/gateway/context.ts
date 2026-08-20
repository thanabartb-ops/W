import type { CanonicalChatRequest, GatewayContext } from './types'

export function buildGatewayContext(input: {
  request: CanonicalChatRequest
  requestId: string
  receivedAt?: string
}): GatewayContext {
  return {
    requestId: input.requestId,
    caller: {
      kind: 'service',
      clientId: 'lsuperagent-pro',
      authMethod: 'hmac-sha256-v1',
    },
    userId: null,
    workspaceId: input.request.workspaceId ?? null,
    action: 'chat',
    input: { message: input.request.message },
    receivedAt: input.receivedAt ?? new Date().toISOString(),
  }
}
