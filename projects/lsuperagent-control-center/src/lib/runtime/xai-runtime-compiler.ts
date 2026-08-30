type JsonSchema = Record<string, unknown>

type XaiRuntimeCompilerOptions = {
  apiKey?: string
  model?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

type CompileResult = {
  provider: 'xai'
  model: string
  providerRequestId: string
  command: unknown
}

const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses'
const DEFAULT_MODEL = 'grok-4.6'

const SYSTEM_PROMPT =
  "You are LSUPERAGENT, BANK's single owner agent. LFORGE is the production workflow. Build a deterministic command, never self-approve, use @Approved only for the current BRIEF_PICTURE, use @Rejected to revise, reject historical approval keys, and require evidence for runtime claims."

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

export function createXaiRuntimeCompiler(options: XaiRuntimeCompilerOptions = {}) {
  const apiKey = options.apiKey ?? process.env.XAI_API_KEY ?? ''
  if (!apiKey.trim()) throw new Error('XAI_API_KEY_NOT_CONFIGURED')

  const model = options.model ?? process.env.XAI_MODEL ?? DEFAULT_MODEL
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 15_000

  return {
    async compile(userRequest: string, commandSchema: JsonSchema): Promise<CompileResult> {
      if (!userRequest.trim()) throw new Error('XAI_INPUT_REQUIRED')

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetchImpl(XAI_RESPONSES_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            store: false,
            max_output_tokens: 1200,
            input: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userRequest },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'lsuperagent_command',
                strict: true,
                schema: commandSchema,
              },
            },
          }),
          signal: controller.signal,
        })

        const raw = await response.text()
        let payload: unknown
        try {
          payload = JSON.parse(raw)
        } catch {
          throw new Error(`XAI_PROVIDER_ERROR:${response.status}:INVALID_JSON:INVALID_JSON`)
        }

        if (!isRecord(payload)) {
          throw new Error(`XAI_PROVIDER_ERROR:${response.status}:INVALID_RESPONSE:INVALID_RESPONSE`)
        }

        if (!response.ok) {
          const error = isRecord(payload.error) ? payload.error : {}
          const code = typeof error.code === 'string' ? error.code : 'unknown'
          const type = typeof error.type === 'string' ? error.type : 'unknown'
          throw new Error(`XAI_PROVIDER_ERROR:${response.status}:${code}:${type}`)
        }

        const outputText = readOutputText(payload)
        if (!outputText) throw new Error('XAI_EMPTY_OUTPUT')

        let command: unknown
        try {
          command = JSON.parse(outputText)
        } catch {
          throw new Error('XAI_INVALID_STRUCTURED_OUTPUT')
        }

        const providerRequestId =
          response.headers.get('x-request-id') ||
          (typeof payload.id === 'string' ? payload.id : '')
        if (!providerRequestId) throw new Error('XAI_REQUEST_ID_MISSING')

        return {
          provider: 'xai',
          model,
          providerRequestId,
          command,
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
