import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const RUNTIME_VERSION = '2026.08.31.1';
const DEFAULT_PROVIDER = 'xai';
const DEFAULT_XAI_MODEL = 'grok-4.6';
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';
const SUPPORTED_PROVIDERS = ['xai', 'anthropic'] as const;
const RATE_LIMIT_PER_MINUTE = 12;

type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

function isSupportedProvider(value: unknown): value is SupportedProvider {
  return typeof value === 'string' &&
    (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function mappedKey(name: string): string {
  const raw = Deno.env.get(name);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.default === 'string' ? parsed.default : '';
  } catch {
    return '';
  }
}

function publishableKey(): string {
  return mappedKey('SUPABASE_PUBLISHABLE_KEYS') || Deno.env.get('SUPABASE_ANON_KEY') || '';
}

function serverKey(): string {
  return mappedKey('SUPABASE_SECRET_KEYS') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

function resolveXaiKey(): string {
  return Deno.env.get('XAI_API_KEY') || '';
}

function resolveAnthropicKey(): string {
  return Deno.env.get('ANTHROPIC_API_KEY') || '';
}

function providerKey(provider: SupportedProvider): string {
  return provider === 'anthropic' ? resolveAnthropicKey() : resolveXaiKey();
}

function runtimeSharedSecret(): string {
  return Deno.env.get('RUNTIME_SHARED_SECRET') || '';
}

/**
 * Compares without leaking the answer through timing. Length is compared first
 * and is not itself a secret; the byte loop below never exits early.
 */
function secureEqual(supplied: string, expected: string): boolean {
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function responseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as Array<Record<string, unknown>>
      : [];
    for (const part of content) {
      if (typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

const commandSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    route: { type: 'string', enum: ['GENERAL', 'LFORGE_PRODUCTION', 'MEMORY', 'QC', 'SYSTEM'] },
    state: { type: 'string', enum: ['DRAFT', 'AWAITING_DECISION', 'READY', 'BLOCKED'] },
    goal: { type: 'string' },
    requires_approval: { type: 'boolean' },
    approval_key: { type: ['string', 'null'] },
    command: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string' },
        parameters: { type: 'array', items: { type: 'string' } },
      },
      required: ['action', 'parameters'],
    },
    guardrails: { type: 'array', items: { type: 'string' } },
    evidence_required: { type: 'array', items: { type: 'string' } },
  },
  required: ['route', 'state', 'goal', 'requires_approval', 'approval_key', 'command', 'guardrails', 'evidence_required'],
};

async function health() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = serverKey();
  const xaiConfigured = Boolean(resolveXaiKey());
  const anthropicConfigured = Boolean(resolveAnthropicKey());
  // Ready means at least one provider can actually run, not that a specific
  // one is present; the caller selects per request.
  const anyProviderConfigured = xaiConfigured || anthropicConfigured;
  if (!url || !key) {
    return json({
      ok: false,
      service: 'lsuperagent-runtime',
      version: RUNTIME_VERSION,
      database: 'NOT_CONNECTED',
      provider: DEFAULT_PROVIDER,
      providers: SUPPORTED_PROVIDERS,
      xai: xaiConfigured ? 'CONFIGURED' : 'NOT_CONNECTED',
      anthropic: anthropicConfigured ? 'CONFIGURED' : 'NOT_CONNECTED',
      openai: 'LEGACY_INACTIVE',
    }, 503);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from('runtime_releases')
    .select('runtime_name,runtime_version,state,gateway_slug,model,updated_at,dependencies,evidence')
    .eq('runtime_name', 'LSUPERAGENT')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return json({
      ok: false,
      service: 'lsuperagent-runtime',
      version: RUNTIME_VERSION,
      database: 'ERROR',
      provider: DEFAULT_PROVIDER,
      providers: SUPPORTED_PROVIDERS,
      xai: xaiConfigured ? 'CONFIGURED' : 'NOT_CONNECTED',
      anthropic: anthropicConfigured ? 'CONFIGURED' : 'NOT_CONNECTED',
      openai: 'LEGACY_INACTIVE',
      error: 'RUNTIME_RELEASE_LOOKUP_FAILED',
    }, 503);
  }

  const ready = Boolean(data) && data?.state === 'ACTIVE' && anyProviderConfigured;

  return json({
    ok: ready,
    service: 'lsuperagent-runtime',
    version: RUNTIME_VERSION,
    database: data ? 'CONNECTED' : 'SCHEMA_MISSING',
    provider: DEFAULT_PROVIDER,
    providers: SUPPORTED_PROVIDERS,
    xai: xaiConfigured ? 'CONFIGURED' : 'NOT_CONNECTED',
    anthropic: anthropicConfigured ? 'CONFIGURED' : 'NOT_CONNECTED',
    openai: 'LEGACY_INACTIVE',
    release: data,
    timestamp: new Date().toISOString(),
  }, ready ? 200 : 503);
}

async function authenticatedUser(req: Request, url: string, key: string) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const client = createClient(url, key, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

const SYSTEM_PROMPT =
  'You are LSUPERAGENT, BANK\'s single owner agent. LFORGE is the production workflow. Build a deterministic command, never self-approve, use @Approved only for the current BRIEF_PICTURE, use @Rejected to revise, reject historical approval keys, and require evidence for runtime claims.';

async function compileWithAnthropic(
  apiKey: string,
  userRequest: string,
  requestedModel: string,
) {
  const model = requestedModel || Deno.env.get('ANTHROPIC_MODEL') || DEFAULT_ANTHROPIC_MODEL;
  const started = Date.now();
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userRequest }],
    output_config: {
      format: { type: 'json_schema', schema: commandSchema },
    },
  });

  // Safety classifiers can decline with HTTP 200; content is not usable then.
  if (message.stop_reason === 'refusal') {
    throw new Error('ANTHROPIC_REFUSED');
  }

  let output = '';
  for (const block of message.content) {
    if (block.type === 'text') {
      output = block.text;
      break;
    }
  }
  if (!output) throw new Error('ANTHROPIC_EMPTY_OUTPUT');

  let command: unknown;
  try {
    command = JSON.parse(output);
  } catch {
    throw new Error('ANTHROPIC_INVALID_STRUCTURED_OUTPUT');
  }

  return {
    provider: 'anthropic' as const,
    command,
    model,
    providerRequestId: message.id || '',
    durationMs: Date.now() - started,
  };
}

async function compileWithXai(
  apiKey: string,
  userRequest: string,
  requestedModel: string,
) {
  const model = requestedModel || Deno.env.get('XAI_MODEL') || DEFAULT_XAI_MODEL;
  const started = Date.now();
  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1200,
      input: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
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
  });

  const requestId = response.headers.get('x-request-id') || '';
  const raw = await response.text();
  if (!response.ok) {
    let code = 'unknown';
    let type = 'unknown';
    try {
      const diagnostic = JSON.parse(raw) as { error?: { code?: string; type?: string } };
      code = diagnostic.error?.code || code;
      type = diagnostic.error?.type || type;
    } catch {
      // Keep diagnostics minimal; never surface credentials or provider bodies.
    }
    throw new Error(`XAI_PROVIDER_ERROR:${response.status}:${code}:${type}`);
  }

  const payload = JSON.parse(raw) as Record<string, unknown>;
  const output = responseText(payload);
  if (!output) throw new Error('XAI_EMPTY_OUTPUT');

  let command: unknown;
  try {
    command = JSON.parse(output);
  } catch {
    throw new Error('XAI_INVALID_STRUCTURED_OUTPUT');
  }

  return {
    provider: 'xai' as const,
    command,
    model,
    providerRequestId: requestId || String(payload.id || ''),
    durationMs: Date.now() - started,
  };
}

function compileCommand(
  provider: SupportedProvider,
  apiKey: string,
  userRequest: string,
  requestedModel: string,
) {
  return provider === 'anthropic'
    ? compileWithAnthropic(apiKey, userRequest, requestedModel)
    : compileWithXai(apiKey, userRequest, requestedModel);
}

async function runCommand(req: Request) {
  // Gateway identity first: before the body is read, before the user JWT is
  // checked, before any database or provider work. This function is deployed
  // with verify_jwt=false, so without this check any holder of a valid user
  // token could call it directly and bypass the trusted gateway entirely.
  // Ordering it first also keeps unidentified callers off the auth database.
  const configuredRuntimeSecret = runtimeSharedSecret();
  if (!configuredRuntimeSecret) {
    return json({ status: 'FAILED', error: 'RUNTIME_IDENTITY_NOT_CONFIGURED' }, 503);
  }
  if (!secureEqual(req.headers.get('x-lsuperagent-runtime-secret') || '', configuredRuntimeSecret)) {
    // 403, not 401: the caller's own credential is not what failed here, and
    // the gateway maps 401 to "user session invalid" and signs the user out.
    return json({ status: 'BLOCKED', error: 'RUNTIME_IDENTITY_REQUIRED' }, 403);
  }

  const url = Deno.env.get('SUPABASE_URL') || '';
  const publicKey = publishableKey();
  const privateKey = serverKey();
  if (!url || !privateKey || !publicKey) {
    return json({ status: 'BLOCKED', error: 'SUPABASE_RUNTIME_NOT_CONNECTED' }, 503);
  }

  const admin = createClient(url, privateKey, { auth: { persistSession: false } });
  const user = await authenticatedUser(req, url, publicKey);
  if (!user) return json({ status: 'BLOCKED', error: 'AUTHENTICATED_OWNER_REQUIRED' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ status: 'BLOCKED', error: 'INVALID_JSON' }, 400);
  }

  const userRequest = String(body.user_request || '').trim();
  if (!userRequest) return json({ status: 'BLOCKED', error: 'USER_REQUEST_REQUIRED' }, 400);
  if (userRequest.length > 20000) return json({ status: 'BLOCKED', error: 'USER_REQUEST_TOO_LARGE' }, 413);

  // This runtime owns the provider list; the gateway only checks name shape.
  const provider = body.provider === undefined ? DEFAULT_PROVIDER : body.provider;
  if (!isSupportedProvider(provider)) {
    return json({ status: 'BLOCKED', error: 'PROVIDER_NOT_SUPPORTED' }, 400);
  }
  const requestedModel = body.model === undefined ? '' : String(body.model).trim();

  const since = new Date(Date.now() - 60000).toISOString();
  const { count, error } = await admin
    .from('metric_events')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', user.id)
    .eq('event_name', 'lsuperagent_runtime_request')
    .gte('event_time', since);

  if (error) return json({ status: 'FAILED', error: 'RATE_LIMIT_LOOKUP_FAILED' }, 500);
  if ((count || 0) >= RATE_LIMIT_PER_MINUTE) {
    return json({ status: 'BLOCKED', error: 'RATE_LIMIT_EXCEEDED', limit: RATE_LIMIT_PER_MINUTE }, 429);
  }

  const apiKey = providerKey(provider);
  if (!apiKey) {
    return json({ status: 'FAILED', error: `${provider.toUpperCase()}_API_KEY_NOT_CONNECTED` }, 503);
  }

  const correlationId = crypto.randomUUID();
  try {
    const compiled = await compileCommand(provider, apiKey, userRequest, requestedModel);
    if (!compiled.providerRequestId) throw new Error('PROVIDER_REQUEST_ID_MISSING');

    const { data: runtime, error } = await admin.rpc('lsuperagent_start_run', {
      p_user_id: user.id,
      p_user_request: userRequest,
      p_command: compiled.command,
      p_provider_request_id: compiled.providerRequestId,
      p_model: compiled.model,
      p_runtime_version: RUNTIME_VERSION,
      p_duration_ms: compiled.durationMs,
    });

    if (error) throw new Error(`RUNTIME_PERSISTENCE_FAILED:${error.message}`);
    if (runtime?.status !== 'PASS') {
      throw new Error(`RUNTIME_CHAIN_${runtime?.status || 'FAILED'}:${runtime?.reason || runtime?.error || 'unknown'}`);
    }

    // The success metric is the evidence this run happened. Returning EXECUTED
    // without it would report a verified execution that nothing recorded.
    const { error: metricInsertError } = await admin.from('metric_events').insert({
      workspace_id: runtime.workspace_id,
      actor_id: user.id,
      event_name: 'lsuperagent_runtime_request',
      schema_version: '1.0.0',
      correlation_id: runtime.correlation_id,
      dimensions: {
        status: 'success',
        provider: compiled.provider,
        model: compiled.model,
        runtime_version: RUNTIME_VERSION,
      },
    });

    if (metricInsertError) {
      return json({
        status: 'FAILED',
        correlation_id: runtime.correlation_id,
        provider: compiled.provider,
        error: 'METRIC_PERSIST_FAILED',
      }, 500);
    }

    return json({
      status: 'EXECUTED',
      runtime_version: RUNTIME_VERSION,
      provider: compiled.provider,
      model: compiled.model,
      command: compiled.command,
      evidence: {
        provider_request_id: compiled.providerRequestId,
        correlation_id: runtime.correlation_id,
        qa_run_id: runtime.qa_run_id,
        duration_ms: compiled.durationMs,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return json({ status: 'FAILED', correlation_id: correlationId, provider, error: detail }, detail.includes('NOT_CONNECTED') ? 503 : 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  if (req.method === 'GET' && (path.endsWith('/lsuperagent-runtime') || path.endsWith('/health'))) return health();
  if (req.method === 'POST' && (path.endsWith('/lsuperagent-runtime') || path.endsWith('/command'))) return runCommand(req);
  return json({ status: 'BLOCKED', error: 'ROUTE_NOT_FOUND' }, 404);
});
