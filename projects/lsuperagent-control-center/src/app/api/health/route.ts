import { randomUUID } from 'node:crypto'

export async function GET() {
  return Response.json({
    app: 'ok',
    gateway: 'NOT_CONNECTED',
    backend: 'NOT_CONNECTED',
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
  })
}
