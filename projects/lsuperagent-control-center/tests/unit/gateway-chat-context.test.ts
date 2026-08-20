// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseCanonicalChatRequest } from '../../src/lib/gateway/chat-request'
import { buildGatewayContext } from '../../src/lib/gateway/context'

describe('canonical chat request', () => {
  it('normalizes valid input and preserves null user identity', () => {
    const request = parseCanonicalChatRequest({ message: '  hello  ', workspaceId: 'w1' })
    expect(request).toEqual({ message: 'hello', workspaceId: 'w1' })

    const context = buildGatewayContext({
      request,
      requestId: '11111111-1111-4111-8111-111111111111',
      receivedAt: '2026-08-21T00:00:00.000Z',
    })

    expect(context).toMatchObject({
      requestId: '11111111-1111-4111-8111-111111111111',
      caller: {
        kind: 'service',
        clientId: 'lsuperagent-pro',
        authMethod: 'hmac-sha256-v1',
      },
      userId: null,
      workspaceId: 'w1',
      action: 'chat',
      input: { message: 'hello' },
    })
  })

  it.each([
    null,
    [],
    {},
    { message: '' },
    { message: 'x'.repeat(12001) },
    { message: 'hello', provider: 'browser-selected' },
    { message: 'hello', userId: 'browser-user' },
    { message: 'hello', workspaceId: 123 },
  ])('rejects invalid authority-bearing or malformed input %#', (input) => {
    expect(() => parseCanonicalChatRequest(input)).toThrow('invalid_chat_request')
  })
})
