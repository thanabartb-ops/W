import { describe, expect, it, vi } from 'vitest'
import { probeCanonicalBackend } from '../../src/lib/backend/lsuperagent-runtime'

describe('R6 canonical backend provider identity', () => {
  it('prefers the canonical provider field over the legacy OpenAI compatibility field', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          service: 'lsuperagent-runtime',
          version: '2026.08.21.1',
          database: 'CONNECTED',
          provider: 'xai',
          xai: 'CONFIGURED',
          openai: 'LEGACY_INACTIVE',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    const result = await probeCanonicalBackend({
      backendUrl: 'https://example.supabase.co/functions/v1/lsuperagent-runtime',
      fetchImpl,
    })

    expect(result).toEqual({
      status: 'connected',
      service: 'lsuperagent-runtime',
      version: '2026.08.21.1',
      provider: 'xai',
      httpStatus: 200,
    })
  })
})
