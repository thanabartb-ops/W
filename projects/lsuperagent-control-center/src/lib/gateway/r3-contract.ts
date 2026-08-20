export type CanonicalChatRequest = {
  requestId: string
  workspaceId: string | null
  action: 'chat'
  input: {
    message: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
}

function hasExactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(record).sort()
  const expected = [...keys].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

export function parseCanonicalChatRequest(
  input: unknown,
  expectedRequestId: string,
): CanonicalChatRequest {
  if (!isRecord(input) || !hasExactKeys(input, ['requestId', 'workspaceId', 'action', 'input'])) {
    throw new Error('INVALID_REQUEST')
  }

  if (
    typeof input.requestId !== 'string' ||
    input.requestId !== expectedRequestId ||
    input.action !== 'chat' ||
    !(
      input.workspaceId === null ||
      typeof input.workspaceId === 'string'
    ) ||
    !isRecord(input.input) ||
    !hasExactKeys(input.input, ['message']) ||
    typeof input.input.message !== 'string'
  ) {
    throw new Error('INVALID_REQUEST')
  }

  const trimmedLength = input.input.message.trim().length
  if (trimmedLength < 1 || trimmedLength > 12000) {
    throw new Error('INVALID_REQUEST')
  }

  return {
    requestId: input.requestId,
    workspaceId: input.workspaceId,
    action: 'chat',
    input: { message: input.input.message },
  }
}
