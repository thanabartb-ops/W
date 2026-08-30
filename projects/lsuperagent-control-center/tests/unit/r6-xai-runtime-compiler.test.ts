import { describe, expect, it, vi } from 'vitest'
import { createXaiRuntimeCompiler } from '../../src/lib/runtime/xai-runtime-compiler'

const commandSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    route: { type: 'string', enum: ['GENERAL', 'LFORGE_PRODUCTION', 'MEMORY', 'QC', 'SYSTEM'] },
    state: { type: 'string', enum: ['DRAFT', 'AWAITING_DECISION', 'READY', 'BLOCKED'] },
    goal: { type: 'string' },
    requires_approval: { type: 'boolean' },
    approval_key: { type: ['string', 'null'] },
    command: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string' },
        parameters: { type: 'array', items: { type: 'string' } },
      },
      required: ['action', 'parameters'],
    },
    guardrails: { type: 'array', items: { type: 'string' } },
    evidence_required: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'route',
    'state',
    'goal',
    'requires_approval',
    'approval_key',
    'command',
    'guardrails',
    'evidence_required',
  ],
} as const

describe('R6 xAI canonical runtime compiler', () => {
  it('compiles the existing LSUPERAGENT command schema through xAI Responses API', async () => {
    const command = {
      route: 'GENERAL',
      state: 'READY',
      goal: 'verify xAI runtime switch',
      requires_approval: false,
      approval_key: null,
      command: { action: 'noop', parameters: [] },
      guardrails: ['no writes'],
      evidence_required: ['provider request id'],
    }

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 'resp_r6', output_text: JSON.stringify(command) }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'xai_r6_request_123',
        },
      }),
    )

    const compiler = createXaiRuntimeCompiler({
      apiKey: 'xai-test-key-not-a-secret',
      fetchImpl,
    })

    const result = await compiler.compile('Return a deterministic no-op command', commandSchema)

    expect(result).toEqual({
      provider: 'xai',
      model: 'grok-4.6',
      providerRequestId: 'xai_r6_request_123',
      command,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.x.ai/v1/responses')

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      authorization: 'Bearer xai-test-key-not-a-secret',
    })

    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: 'grok-4.6',
      store: false,
      max_output_tokens: 1200,
      text: {
        format: {
          type: 'json_schema',
          name: 'lsuperagent_command',
          strict: true,
          schema: commandSchema,
        },
      },
    })
    expect(body.input[0].role).toBe('system')
    expect(body.input[1]).toEqual({ role: 'user', content: 'Return a deterministic no-op command' })
  })

  it('fails closed when XAI_API_KEY is absent', () => {
    expect(() => createXaiRuntimeCompiler({ apiKey: '' })).toThrow('XAI_API_KEY_NOT_CONFIGURED')
  })

  it('does not silently fall back to OpenAI when xAI returns an error', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'rate_limit', type: 'provider_error' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const compiler = createXaiRuntimeCompiler({
      apiKey: 'xai-test-key-not-a-secret',
      fetchImpl,
    })

    await expect(compiler.compile('test', commandSchema)).rejects.toThrow(
      'XAI_PROVIDER_ERROR:429:rate_limit:provider_error',
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
