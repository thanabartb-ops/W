import { describe, expect, it } from 'vitest'
import { parseCanonicalChatRequest } from '../../src/lib/gateway/r3-contract'

const requestId = 'req-r3-001'

function validRequest() {
  return {
    requestId,
    workspaceId: null,
    action: 'chat' as const,
    input: { message: 'hello' },
  }
}

describe('R3 canonical chat request contract', () => {
  it('accepts the exact approved request shape', () => {
    expect(parseCanonicalChatRequest(validRequest(), requestId)).toEqual(
      validRequest(),
    )
  })

  it('rejects a body/header request ID mismatch', () => {
    expect(() =>
      parseCanonicalChatRequest(validRequest(), 'different-request-id'),
    ).toThrow()
  })

  it.each([
    ['unknown top-level field', { ...validRequest(), extra: true }],
    ['wrong action', { ...validRequest(), action: 'execute' }],
    ['unknown input field', { ...validRequest(), input: { message: 'hello', role: 'admin' } }],
    ['empty message', { ...validRequest(), input: { message: '   ' } }],
    ['oversized message', { ...validRequest(), input: { message: 'x'.repeat(12001) } }],
    ['invalid workspace', { ...validRequest(), workspaceId: 7 }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseCanonicalChatRequest(input, requestId)).toThrow()
  })
})

describe('R3 provider selection', () => {
  // The message-only shape is what every existing caller signs today. It has to
  // keep parsing unchanged, or adding provider selection breaks the live path.
  it('leaves the message-only request untouched', () => {
    const parsed = parseCanonicalChatRequest(validRequest(), requestId)
    expect(parsed.input).toEqual({ message: 'hello' })
    expect('provider' in parsed.input).toBe(false)
    expect('model' in parsed.input).toBe(false)
  })

  it.each([
    ['provider only', { message: 'hello', provider: 'anthropic' }],
    ['model only', { message: 'hello', model: 'claude-opus-5' }],
    ['both', { message: 'hello', provider: 'xai', model: 'grok-4.6' }],
  ])('accepts %s', (_label, input) => {
    expect(
      parseCanonicalChatRequest({ ...validRequest(), input }, requestId).input,
    ).toEqual(input)
  })

  // Shape only. Which providers exist is the runtime's to decide, so a
  // well-formed but unsupported name passes here and is refused downstream by
  // the component that actually knows. Naming providers in this gateway is what
  // the R3 source boundary test exists to prevent.
  it('accepts a well-formed provider this gateway has never heard of', () => {
    const input = { message: 'hello', provider: 'some-future-runtime' }
    expect(
      parseCanonicalChatRequest({ ...validRequest(), input }, requestId).input,
    ).toEqual(input)
  })

  it.each([
    ['a non-string provider', { message: 'hello', provider: 7 }],
    ['a provider with path characters', { message: 'hello', provider: '../etc' }],
    ['a provider with whitespace', { message: 'hello', provider: 'x ai' }],
    ['an empty provider', { message: 'hello', provider: '' }],
    ['an oversized provider', { message: 'hello', provider: 'p'.repeat(33) }],
    ['an empty model', { message: 'hello', model: '   ' }],
    ['an oversized model', { message: 'hello', model: 'm'.repeat(129) }],
    ['an unknown extra field', { message: 'hello', provider: 'xai', role: 'admin' }],
  ])('rejects %s', (_label, input) => {
    expect(() =>
      parseCanonicalChatRequest({ ...validRequest(), input }, requestId),
    ).toThrow()
  })
})
