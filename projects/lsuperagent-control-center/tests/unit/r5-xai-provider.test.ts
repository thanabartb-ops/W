import { describe, expect, it, vi } from 'vitest'
import { createXaiProvider } from '../../src/lib/providers/xai'

describe('R5 xAI provider adapter', () => {
  it('calls only the xAI Responses API with the configured key and model', async () => {
    const fetchImpl = vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
        JSON.stringify({
          id: 'resp_test_123',
          output_text: 'LSUPERAGENT_XAI_CANARY_OK',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'xai_req_123',
          },
        },
      ),
    )

    const provider = createXaiProvider({
      apiKey: 'xai-test-key-not-a-secret',
      model: 'grok-4.6',
      fetchImpl,
    })

    const result = await provider.respond('Return exactly: LSUPERAGENT_XAI_CANARY_OK')

    expect(result).toEqual({
      provider: 'xai',
      model: 'grok-4.6',
      requestId: 'xai_req_123',
      outputText: 'LSUPERAGENT_XAI_CANARY_OK',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.x.ai/v1/responses')
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer xai-test-key-not-a-secret',
      },
    })
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'grok-4.6',
      input: 'Return exactly: LSUPERAGENT_XAI_CANARY_OK',
      store: false,
      max_output_tokens: 256,
    })
  })

  it('fails closed when the key is absent', () => {
    expect(() => createXaiProvider({ apiKey: '' })).toThrow('XAI_API_KEY_NOT_CONFIGURED')
  })

  it('rejects a non-xAI base URL', () => {
    expect(() =>
      createXaiProvider({
        apiKey: 'xai-test-key-not-a-secret',
        baseUrl: 'https://example.com/v1',
      }),
    ).toThrow('XAI_BASE_URL_NOT_ALLOWED')
  })
})
