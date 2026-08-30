import { randomUUID } from 'node:crypto'
import { probeCanonicalBackend } from '../../../lib/backend/lsuperagent-runtime'
import { readR3GatewayConfig } from '../../../lib/gateway/r3-config'

export async function GET() {
  const gateway = readR3GatewayConfig() ? 'CONNECTED' : 'NOT_CONNECTED'
  const backendProbe = await probeCanonicalBackend()

  return Response.json({
    app: 'ok',
    gateway,
    backend:
      backendProbe.status === 'connected' ? 'CONNECTED' : 'NOT_CONNECTED',
    ...(backendProbe.status === 'connected'
      ? {
          runtimeVersion: backendProbe.version,
          provider: backendProbe.provider,
        }
      : {}),
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
  })
}
