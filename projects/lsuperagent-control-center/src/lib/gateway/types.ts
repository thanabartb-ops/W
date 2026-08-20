export type GatewayCaller = {
  kind: 'service'
  clientId: 'lsuperagent-pro'
  authMethod: 'hmac-sha256-v1'
}

export type GatewayContext = {
  requestId: string
  caller: GatewayCaller
  userId: null
  workspaceId: string | null
  action: 'chat'
  input: { message: string }
  receivedAt: string
}

export type CanonicalChatRequest = {
  message: string
  workspaceId?: string | null
}

export type PublicGatewayCode =
  | 'INVALID_REQUEST'
  | 'FORBIDDEN'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR'
