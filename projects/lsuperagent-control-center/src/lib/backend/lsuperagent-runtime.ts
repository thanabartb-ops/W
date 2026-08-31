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

type CachedProbeOptions = BackendProbeOptions & {
  ttlMs?: number
  nowMs?: number
}

const PROBE_CACHE_TTL_MS = 15_000

let cachedProbe: { at: number; probe: CanonicalBackendProbe } | null = null
let inFlightProbe: Promise<CanonicalBackendProbe> | null = null

/**
 * The health endpoint is public and unauthenticated, and every probe reaches the
 * runtime, which in turn queries the database. Without this, anyone could turn a
 * cheap request loop into database load. Concurrent callers share one in-flight
 * probe, and the result is reused briefly, so a burst costs a single round trip.
 *
 * Deliberately not used by the chat route: an authenticated execution should see
 * the runtime's current state, not a cached one.
 */
export async function probeCanonicalBackendCached(
  options: CachedProbeOptions = {},
): Promise<CanonicalBackendProbe> {
  const ttlMs = options.ttlMs ?? PROBE_CACHE_TTL_MS
  const nowMs = options.nowMs ?? Date.now()

  if (cachedProbe && nowMs - cachedProbe.at < ttlMs) return cachedProbe.probe
  if (inFlightProbe) return inFlightProbe

  inFlightProbe = probeCanonicalBackend(options)
    .then((probe) => {
      cachedProbe = { at: nowMs, probe }
      return probe
    })
    .finally(() => {
      inFlightProbe = null
    })

  return inFlightProbe
}

export function resetCanonicalBackendProbeCache(): void {
  cachedProbe = null
  inFlightProbe = null
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
