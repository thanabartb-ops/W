/**
 * Provider and model are validated for shape only. Which providers actually
 * exist is the runtime's to decide, and naming them here would put provider
 * knowledge back into a gateway that was deliberately made provider-neutral.
 * An unsupported name is rejected downstream, by the component that knows.
 */
const PROVIDER_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export type CanonicalChatRequest = {
  requestId: string
  workspaceId: string | null
  action: 'chat'
  input: {
    message: string
    provider?: string
    model?: string
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

/**
 * `input` accepts the original message-only shape and the shape that also
 * selects a provider/model. Both remain exact-key checked: callers still cannot
 * smuggle unknown fields through, and an existing caller that sends only
 * `message` keeps working unchanged.
 */
function hasAllowedInputKeys(record: Record<string, unknown>): boolean {
  return (
    hasExactKeys(record, ['message']) ||
    hasExactKeys(record, ['message', 'provider']) ||
    hasExactKeys(record, ['message', 'model']) ||
    hasExactKeys(record, ['message', 'provider', 'model'])
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
    !hasAllowedInputKeys(input.input) ||
    typeof input.input.message !== 'string'
  ) {
    throw new Error('INVALID_REQUEST')
  }

  const trimmedLength = input.input.message.trim().length
  if (trimmedLength < 1 || trimmedLength > 12000) {
    throw new Error('INVALID_REQUEST')
  }

  const { provider, model } = input.input

  if (
    provider !== undefined &&
    (typeof provider !== 'string' || !PROVIDER_NAME.test(provider))
  ) {
    throw new Error('INVALID_REQUEST')
  }

  if (
    model !== undefined &&
    (typeof model !== 'string' || !MODEL_NAME.test(model))
  ) {
    throw new Error('INVALID_REQUEST')
  }

  return {
    requestId: input.requestId,
    workspaceId: input.workspaceId,
    action: 'chat',
    input: {
      message: input.input.message,
      ...(provider !== undefined ? { provider } : {}),
      ...(model !== undefined ? { model } : {}),
    },
  }
}
