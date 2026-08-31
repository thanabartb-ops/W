type XaiProviderOptions = {
  apiKey?: string
  model?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

type XaiProviderResult = {
  provider: 'xai'
  model: string
  requestId: string
  outputText: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
}

function readOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text

  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    if (!isRecord(item)) continue
    const content = Array.isArray(item.content) ? item.content : []
    for (const part of content) {
      if (isRecord(part) && typeof part.text === 'string') return part.text
    }
  }

  return ''
}

function normalizeBaseUrl(raw: string): string {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('XAI_BASE_URL_NOT_ALLOWED')
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'api.x.ai' ||
    (parsed.pathname !== '/v1' && parsed.pathname !== '/v1/') ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('XAI_BASE_URL_NOT_ALLOWED')
  }

  return 'https://api.x.ai/v1'
}

export function createXaiProvider(options: XaiProviderOptions = {}) {
  const apiKey = options.apiKey ?? process.env.XAI_API_KEY ?? ''
  if (!apiKey.trim()) throw new Error('XAI_API_KEY_NOT_CONFIGURED')

  const model = options.model ?? process.env.XAI_MODEL ?? 'grok-build-0.1'
  const baseUrl = normalizeBaseUrl(
    options.baseUrl ?? process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1',
  )
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 10_000

  return {
    async respond(input: string): Promise<XaiProviderResult> {
      if (!input.trim()) throw new Error('XAI_INPUT_REQUIRED')

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetchImpl(`${baseUrl}/responses`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input,
            store: false,
            max_output_tokens: 256,
          }),
          signal: controller.signal,
        })

        let payload: unknown
        try {
          payload = await response.json()
        } catch {
          throw new Error(`XAI_PROVIDER_ERROR:${response.status}:INVALID_JSON`)
        }

        if (!isRecord(payload)) {
          throw new Error(`XAI_PROVIDER_ERROR:${response.status}:INVALID_RESPONSE`)
        }

        if (!response.ok) {
          const error = isRecord(payload.error) ? payload.error : {}
          const code =
            typeof error.code === 'string'
              ? error.code
              : typeof error.type === 'string'
                ? error.type
                : 'UNKNOWN'
          throw new Error(`XAI_PROVIDER_ERROR:${response.status}:${code}`)
        }

        const outputText = readOutputText(payload)
        if (!outputText) throw new Error('XAI_EMPTY_OUTPUT')

        const requestId =
          response.headers.get('x-request-id') ||
          (typeof payload.id === 'string' ? payload.id : '')
        if (!requestId) throw new Error('XAI_REQUEST_ID_MISSING')

        return {
          provider: 'xai',
          model,
          requestId,
          outputText,
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
