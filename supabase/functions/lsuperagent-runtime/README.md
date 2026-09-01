# lsuperagent-runtime

Supabase Edge Function behind the Trusted Gateway. It compiles a user request
into a deterministic command through a provider, persists the run, and returns
evidence identifiers.

## Verification status

**The code in this directory has not been executed, type-checked, or deployed.**

Neither Deno nor the Supabase CLI is available in the environment where it was
last edited, so there is no test run, no `deno check`, and no deployment behind
it. The only check performed was a TypeScript syntax parse with module and
`Deno` global resolution disabled: it reported no syntax or logic errors, which
rules out typos and malformed code and nothing else.

Treat every claim below as intent, not as verified behaviour. Run `deno check`
and the negative probes in the P0 design before trusting it.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `RUNTIME_SHARED_SECRET` | Yes | Proves the caller is the Trusted Gateway. Must match the gateway's value and must differ from `LSUPERAGENT_GATEWAY_HMAC_SECRET`. Without it, POST fails closed with 503. |
| `SUPABASE_URL` | Yes | Runtime database and auth. |
| `SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side database access. |
| `SUPABASE_PUBLISHABLE_KEYS` or `SUPABASE_ANON_KEY` | Yes | Validating the caller's user JWT. |
| `XAI_API_KEY` | Per provider | Required to execute on `xai`. |
| `ANTHROPIC_API_KEY` | Per provider | Required to execute on `anthropic`. |
| `XAI_MODEL` / `ANTHROPIC_MODEL` | No | Default model per provider when the request does not name one. |

Health reports `ok: true` when the release row is `ACTIVE` and **at least one**
provider key is configured. A provider without its key returns
`<PROVIDER>_API_KEY_NOT_CONNECTED` (503) at request time, not at health time.

## Request

```jsonc
POST  { "user_request": "...", "provider": "anthropic", "model": "claude-opus-5" }
```

`provider` and `model` are optional. Omitted, the runtime uses `xai` and its
default model, which is byte-identical to the request shape used before
provider selection existed.

This runtime owns the provider allowlist. The gateway validates only the shape
of the name, so an unsupported provider is refused here with
`PROVIDER_NOT_SUPPORTED` (400).

## Order of checks on POST

The runtime secret is compared before the body is read, before the user JWT is
validated, and before any database or provider call. That ordering is the point:
the function is deployed with `verify_jwt=false`, so any holder of a valid user
token could otherwise call it directly and bypass the gateway. Putting the check
first also keeps unidentified callers off the auth database.

Failure codes are deliberate:

- missing `RUNTIME_SHARED_SECRET` configuration -> `503 RUNTIME_IDENTITY_NOT_CONFIGURED`
- wrong or absent runtime secret on the request -> `403 RUNTIME_IDENTITY_REQUIRED`
- invalid user JWT -> `401`

403 rather than 401 for a runtime-identity failure matters: the gateway maps a
backend 401 to "the user's session is invalid" and signs the user out. A gateway
identity problem must not log users out.

## Known gaps

- `lsuperagent_start_run` does not take a provider argument, so the run record
  itself does not name the provider. Provider is recorded on the success metric
  (`metric_events.dimensions.provider`). Adding it to the run record needs a
  database migration and separate approval.
- Replay protection (timestamp and nonce) is not implemented. Any design for it
  has to change the gateway at the same time: the gateway currently sends only
  `content-type`, `authorization`, and `x-lsuperagent-runtime-secret`, so a
  runtime that required a timestamp header would reject every real request.
- CORS still allows any origin. It is not a security boundary here - the runtime
  secret and user JWT are - but it should be narrowed once the deployed origins
  are settled.
