import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  probeCanonicalBackend,
  probeCanonicalBackendCached,
  resetCanonicalBackendProbeCache,
} from '../../src/lib/backend/lsuperagent-runtime'

describe('R4 canonical backend probe', () => {
  it('treats a non-2xx runtime health response as disconnected even when the database is connected', async () => {
    const fetchImpl = vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

describe('canonical backend probe caching', () => {
  const backendUrl =
    'https://example.supabase.co/functions/v1/lsuperagent-runtime'

  function healthyFetch() {
    return vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            service: 'lsuperagent-runtime',
            version: '2026.08.30.1',
            database: 'CONNECTED',
            provider: 'xai',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
  }

  beforeEach(() => {
    resetCanonicalBackendProbeCache()
  })

  // The health route is public, so a request loop must not become a database
  // load generator. These two cover the burst and the sustained cases.
  it('serves concurrent callers from a single in-flight probe', async () => {
    const fetchImpl = healthyFetch()

    await Promise.all([
      probeCanonicalBackendCached({ backendUrl, fetchImpl }),
      probeCanonicalBackendCached({ backendUrl, fetchImpl }),
      probeCanonicalBackendCached({ backendUrl, fetchImpl }),
    ])

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reuses the result within the TTL and probes again once it expires', async () => {
    const fetchImpl = healthyFetch()

    await probeCanonicalBackendCached({ backendUrl, fetchImpl, nowMs: 0 })
    await probeCanonicalBackendCached({ backendUrl, fetchImpl, nowMs: 14_999 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await probeCanonicalBackendCached({ backendUrl, fetchImpl, nowMs: 15_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
