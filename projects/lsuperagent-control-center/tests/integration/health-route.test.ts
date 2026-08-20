// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GET } from '../../src/app/api/health/route'

describe('GET /api/health', () => {
  it('reports app health without fabricating gateway/backend connectivity', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      app: 'ok',
      gateway: 'NOT_CONNECTED',
      backend: 'NOT_CONNECTED',
    })
    expect(payload.requestId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false)
  })
})
