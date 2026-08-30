type BackendProbeOptions = {
  backendUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

type ConnectedBackend = {
  status: 'connected'
  service: 'lsuperagent-runtime'
  version: string
  provider: string
  httpStatus: number
}

type DisconnectedBackend = {
  status: 'not_connected'
  reason:
    | 'NOT_CONFIGURED'
    | 'INVALID_URL'
    | 'NETWORK_ERROR'
    | 'INVALID_RESPONSE'
    | 'RUNTIME_UNAVAILABLE'
    | 'DATABASE_UNAVAILABLE'
  httpStatus?: number
}

export type CanonicalBackendProbe = ConnectedBackend | DisconnectedBackend

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
}

export async function probeCanonicalBackend(
  options: BackendProbeOptions = {},
): Promise<CanonicalBackendProbe> {
  const rawUrl = options.backendUrl ?? process.env.LSUPERAGENT_BACKEND_URL ?? ''
  if (!rawUrl) return { status: 'not_connected', reason: 'NOT_CONFIGURED' }

  let endpoint: string
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') {
      return { status: 'not_connected', reason: 'INVALID_URL' }
    }
    endpoint = parsed.toString()
  } catch {
    return { status: 'not_connected', reason: 'INVALID_URL' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000)

  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return {
        status: 'not_connected',
        reason: 'INVALID_RESPONSE',
        httpStatus: response.status,
      }
    }

    if (
      !isRecord(payload) ||
      payload.service !== 'lsuperagent-runtime' ||
      typeof payload.version !== 'string'
    ) {
      return {
        status: 'not_connected',
        reason: 'INVALID_RESPONSE',
        httpStatus: response.status,
      }
    }

    if (!response.ok || payload.ok === false) {
      return {
        status: 'not_connected',
        reason: 'RUNTIME_UNAVAILABLE',
        httpStatus: response.status,
      }
    }

    if (payload.database !== 'CONNECTED') {
      return {
        status: 'not_connected',
        reason: 'DATABASE_UNAVAILABLE',
        httpStatus: response.status,
      }
    }

    return {
      status: 'connected',
      service: 'lsuperagent-runtime',
      version: payload.version,
      provider:
        typeof payload.provider === 'string'
          ? payload.provider
          : typeof payload.openai === 'string'
            ? payload.openai
            : 'UNKNOWN',
      httpStatus: response.status,
    }
  } catch {
    return { status: 'not_connected', reason: 'NETWORK_ERROR' }
  } finally {
    clearTimeout(timeout)
  }
}
