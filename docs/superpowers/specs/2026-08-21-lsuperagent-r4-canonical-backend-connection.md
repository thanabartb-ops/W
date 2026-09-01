# LSUPERAGENT R4 Canonical Backend Connection

## Objective
Connect the existing server-only Trusted Gateway to the already deployed canonical `lsuperagent-runtime` backend through a read-only health probe before any provider/model execution or data mutation is enabled.

## Canonical runtime discovered
- Existing Supabase Edge Function: `lsuperagent-runtime`
- Runtime version reported by source: `2026.08.18.1`
- Backend probe method: `GET`
- Backend identity: `service = lsuperagent-runtime`
- Database connectivity signal: `database = CONNECTED`

## Authority boundary
- GitHub remains source/CI/release evidence authority for this change.
- Existing LSUPERAGENT/Supabase remains canonical backend/state authority.
- No new Supabase project, memory store, audit store, policy engine, or provider runtime is created.
- Gateway does not call the backend command/POST path in R4.
- Provider/model execution remains disabled.
- No canonical data writes are authorized by R4.

## Connection semantics
A reachable canonical runtime is considered backend-connected when its health payload identifies `lsuperagent-runtime` and reports `database = CONNECTED`, regardless of whether the provider is configured, blocked, or not connected.

The Gateway continues to fail closed for chat execution. A successful R4 backend probe changes only the truthful status from `backend = NOT_CONNECTED` to `backend = CONNECTED`; provider execution remains disabled and the chat request still does not execute a model.

## Verification
1. Unit-test backend health parsing and fail-closed behavior.
2. Route-test authenticated `/api/chat` with mocked backend health.
3. Update PRO handshake mapping to accept truthful backend-connected/provider-disabled state.
4. Run GitHub-hosted network E2E through TLS/HMAC.
5. Run GitHub-hosted live read-only E2E against the existing Supabase `lsuperagent-runtime` GET health endpoint.

## Hard stops
R4 does not authorize:
- POST/command calls to `lsuperagent-runtime`
- OpenAI/Gemini/Claude execution
- memory/audit/tool writes
- merge
- production deploy
- custom-domain or DNS changes
