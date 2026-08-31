export type R3GatewayConfig = {
  secret: string
  allowedClients: readonly string[]
}

type EnvLike = Record<string, string | undefined>

export function readR3GatewayConfig(
  env: EnvLike = process.env,
): R3GatewayConfig | null {
  const secret = env.LSUPERAGENT_GATEWAY_HMAC_SECRET?.trim() ?? ''
  const allowedClients = (
    env.LSUPERAGENT_GATEWAY_ALLOWED_CLIENTS ?? ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (!secret || !allowedClients.includes('lsuperagent-pro')) {
    return null
  }

  return { secret, allowedClients }
}
