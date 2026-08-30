import { describe, expect, it, vi } from 'vitest'
import { probeCanonicalBackend } from '../../src/lib/backend/lsuperagent-runtime'

describe('R4 canonical backend probe', () => {
  it('treats a non-2xx runtime health response as disconnected even when the database is connected', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            ok: true,
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
      status: 'not_connected',
      reason: 'RUNTIME_UNAVAILABLE',
      httpStatus: 503,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
  })

  it('treats an ok false 2xx health response as disconnected', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          service: 'lsuperagent-runtime',
          version: '2026.08.18.1',
          database: 'CONNECTED',
          provider: 'xai',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expect(
      probeCanonicalBackend({
        backendUrl:
          'https://example.supabase.co/functions/v1/lsuperagent-runtime',
        fetchImpl,
      }),
    ).resolves.toEqual({
      status: 'not_connected',
      reason: 'RUNTIME_UNAVAILABLE',
      httpStatus: 200,
    })
  })
})
