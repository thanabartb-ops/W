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
