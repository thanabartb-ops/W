import { describe, expect, it, vi } from 'vitest'
import { probeCanonicalBackend } from '../../src/lib/backend/lsuperagent-runtime'

describe('R4 canonical backend probe', () => {
  it('treats the backend as connected when the canonical runtime reports database CONNECTED even if the provider is not ready', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          service: 'lsuperagent-runtime',
          version: '2026.08.18.1',
          database: 'CONNECTED',
          openai: 'NOT_CONNECTED',
        }),
        {
          status: 503,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    const result = await probeCanonicalBackend({
      backendUrl:
        'https://example.supabase.co/functions/v1/lsuperagent-runtime',
      fetchImpl,
    })

    expect(result).toEqual({
      status: 'connected',
      service: 'lsuperagent-runtime',
      version: '2026.08.18.1',
      provider: 'NOT_CONNECTED',
      httpStatus: 503,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
  })
})
