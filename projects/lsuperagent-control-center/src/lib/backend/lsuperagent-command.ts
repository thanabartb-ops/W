type CommandExecutionOptions = {
  backendUrl?: string
  userAuthToken: string
  runtimeSecret?: string
  message: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type CanonicalCommandExecution =
  | { status: 'verified'; data: Record<string, unknown> }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'blocked' }
  | { status: 'invalid_response' }
  | { status: 'failed' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
}

/**
 * Provider-neutral by contract: any non-empty provider is verifiable so long as
 * the runtime, model, and evidence identifiers are all present. Pinning this to
 * one provider name is what kept Claude from executing through the gateway.
 */
function validExecution(payload: unknown): payload is Record<string, unknown> {
  if (!isRecord(payload)) return false
  if (
    payload.status !== 'EXECUTED' ||
    typeof payload.provider !== 'string' ||
    payload.provider.trim().length === 0 ||
    typeof payload.runtime_version !== 'string' ||
    payload.runtime_version.trim().length === 0 ||
    typeof payload.model !== 'string' ||
    payload.model.trim().length === 0 ||
    !isRecord(payload.evidence)
  ) {
    return false
  }

  const evidence = payload.evidence
  return (
    typeof evidence.provider_request_id === 'string' &&
    evidence.provider_request_id.trim().length > 0 &&
    typeof evidence.correlation_id === 'string' &&
    evidence.correlation_id.trim().length > 0 &&
    typeof evidence.qa_run_id === 'string' &&
    evidence.qa_run_id.trim().length > 0
  )
}

export async function executeCanonicalCommand(
  options: CommandExecutionOptions,
): Promise<CanonicalCommandExecution> {
  if (!options.userAuthToken.trim() || !options.message.trim()) {
    return { status: 'failed' }
  }

  // Gateway identity is proved separately from the user's identity, and both are
  // required. Without it the runtime cannot tell this call from a direct one, so
  // fail closed here rather than let an unidentified request reach the runtime.
  const runtimeSecret =
    options.runtimeSecret ?? process.env.RUNTIME_SHARED_SECRET ?? ''
  if (!runtimeSecret.trim()) return { status: 'failed' }

  const rawUrl = options.backendUrl ?? process.env.LSUPERAGENT_BACKEND_URL ?? ''
  let endpoint: string
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') return { status: 'failed' }
    endpoint = parsed.toString()
  } catch {
    return { status: 'failed' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000)

  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.userAuthToken}`,
        'x-lsuperagent-runtime-secret': runtimeSecret,
      },
      body: JSON.stringify({ user_request: options.message }),
      cache: 'no-store',
      signal: controller.signal,
    })

    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 403) return { status: 'forbidden' }
    if (response.status === 429) return { status: 'blocked' }
    if (!response.ok) return { status: 'failed' }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return { status: 'failed' }
    }

    if (!validExecution(payload)) return { status: 'invalid_response' }
    return { status: 'verified', data: payload }
  } catch {
    return { status: 'failed' }
  } finally {
    clearTimeout(timeout)
  }
}
