# SUPABASE AUDIT PACKET — LSUPERAGENT

- Generated at: `2026-08-30T17:17:01Z`
- Mode: `READ_ONLY`
- Redaction status: `SANITIZED`
- Repository commit inspected: `c8c081577d3600e8d95aafdeb6a76885a929ff7f`
- Production verification status: `NOT_VERIFIED`

## Evidence status

| Evidence | Status | Reason |
| --- | --- | --- |
| Repository runtime source | AVAILABLE | Inspected at the repository commit above. |
| Supabase project metadata | NOT_AVAILABLE | No authenticated Supabase connection or project metadata is available in this environment. |
| Physical database schema | NOT_AVAILABLE | No read-only database connection or schema export is available. |
| Deployed Edge Function | NOT_AVAILABLE | Repository source exists, but deployment identity and deployed-source parity cannot be established. |
| Runtime health response | NOT_AVAILABLE | No authenticated network path to the real runtime is available. |
| Deterministic NOOP response | NOT_AVAILABLE | No test-owner JWT or authenticated runtime endpoint is available. |

`NOT_AVAILABLE` never means `NOT_SET`, absent, or failed. It means the requested fact could not be observed from the current read-only environment.

## 1. Project identity

| Field | Value |
| --- | --- |
| Project reference | `NOT_AVAILABLE` |
| Project name | `NOT_AVAILABLE` |
| Region | `NOT_AVAILABLE` |
| Supabase hostname | `NOT_AVAILABLE` |
| Environment classification | `NOT_AVAILABLE` |

## 2. Physical database schema

Status: `NOT_AVAILABLE`

The repository contains no Supabase migrations, schema dump, or generated database types. Therefore columns, data types, nullability, defaults, keys, constraints, indexes, views, materialized views, RLS state, and policy definitions cannot be reported as physical database facts.

The repository runtime source references these objects, but their existence and definitions remain unverified:

| Referenced object | Observed operation |
| --- | --- |
| `runtime_releases` | Select latest release for `runtime_name = 'LSUPERAGENT'`. |
| `metric_events` | Count recent runtime requests and insert a success metric. |
| `lsuperagent_start_run` | Invoke through Supabase RPC. |

No table rows or user data are included.

## 3. `public.lsuperagent_start_run`

Status: `NOT_AVAILABLE`

The runtime invokes RPC name `lsuperagent_start_run` with the following named arguments:

- `p_user_id`
- `p_user_request`
- `p_command`
- `p_provider_request_id`
- `p_model`
- `p_runtime_version`
- `p_duration_ms`

The function definition, schema-qualified resolution, argument types, return type, owner, language, security mode, `search_path`, grants, dependencies, target tables, and related triggers are not present in the repository and cannot be inferred safely.

## 4. Edge Function: `lsuperagent-runtime`

### Deployment evidence

| Field | Value |
| --- | --- |
| Function name | `lsuperagent-runtime` (repository path; deployed identity not verified) |
| Deployment status | `NOT_AVAILABLE` |
| Deployment identifier | `NOT_AVAILABLE` |
| Deployment timestamp | `NOT_AVAILABLE` |
| `verify_jwt` setting | `NOT_AVAILABLE` |
| Deployed source parity | `NOT_AVAILABLE` |

### Repository source evidence

| Field | Observed value |
| --- | --- |
| Source | `supabase/functions/lsuperagent-runtime/index.ts` |
| Deno configuration | `supabase/functions/lsuperagent-runtime/deno.json` |
| Declared runtime version | `2026.08.30.1` |
| Declared provider | `xai` |
| Default model | `grok-4.6` |
| Rate limit | 12 requests per actor per minute |
| Health methods/routes | `GET` on paths ending in `/lsuperagent-runtime` or `/health` |
| Command methods/routes | `POST` on paths ending in `/lsuperagent-runtime` or `/command` |
| Provider endpoint | `https://api.x.ai/v1/responses` |
| Provider retention request | `store: false` |

The source requires authenticated Supabase user resolution before command execution, validates a non-empty request of at most 20,000 characters, performs a database-backed rate-limit lookup, requires a provider request ID, persists through `lsuperagent_start_run`, and returns provider, correlation, and QA evidence identifiers on success.

This repository source is a candidate deployment artifact only. It is not evidence that the same bytes are deployed.

## 5. Secret inventory

Values, partial values, hashes, lengths, encodings, and fingerprints are intentionally excluded.

| Key name referenced by repository source | Status |
| --- | --- |
| `SUPABASE_URL` | `NOT_AVAILABLE` |
| `SUPABASE_PUBLISHABLE_KEYS` | `NOT_AVAILABLE` |
| `SUPABASE_ANON_KEY` | `NOT_AVAILABLE` |
| `SUPABASE_SECRET_KEYS` | `NOT_AVAILABLE` |
| `SUPABASE_SERVICE_ROLE_KEY` | `NOT_AVAILABLE` |
| `XAI_API_KEY` | `NOT_AVAILABLE` |
| `XAI_MODEL` | `NOT_AVAILABLE` |

The current environment does not expose the real Supabase deployment inventory, so none of these entries can truthfully be marked `SET` or `NOT_SET`.

## 6. Runtime release evidence

Status: `NOT_AVAILABLE`

The repository source requests the latest `runtime_releases` record with these fields:

- `runtime_name`
- `runtime_version`
- `state`
- `gateway_slug`
- `model`
- `updated_at`
- `dependencies`
- `evidence`

It filters `runtime_name = 'LSUPERAGENT'`, orders by `updated_at` descending, and limits the result to one. No physical row or sanitized query result is available, so no release state is asserted.

## 7. Role grants

Status: `NOT_AVAILABLE`

Effective grants for `anon`, `authenticated`, and `service_role` cannot be determined without a database catalog export. No privilege is inferred from client code. Credentials and tokens are not included.

## 8. Sanitized verification evidence

### Health response

Status: `NOT_AVAILABLE`

Reason: no authenticated network route or real Supabase project identity is available. The repository contract expects a response containing service, runtime version, database state, provider state, optional release evidence, and timestamp; that contract is not substituted for a real response.

### Deterministic NOOP command response

Status: `NOT_AVAILABLE`

Reason: no test-owner JWT, real runtime endpoint, or approved production test context is available. No synthetic provider, correlation, or QA identifier is presented as production evidence.

| Evidence field | Value |
| --- | --- |
| HTTP status | `NOT_AVAILABLE` |
| Runtime status | `NOT_AVAILABLE` |
| Provider ID | `NOT_AVAILABLE` |
| Correlation ID | `NOT_AVAILABLE` |
| QA run ID | `NOT_AVAILABLE` |

## 9. Verification conclusion

```text
Repository source inspection: COMPLETE
Physical Supabase inspection: NOT_AVAILABLE
Deployed runtime parity: NOT_AVAILABLE
Authenticated API command: NOT_AVAILABLE
E2E-001..004: NOT_EXECUTED
QAMap: NOT_VERIFIED
Final state: NOT_VERIFIED
```

No project, schema, function, secret, deployment, data, or access-control change was performed while producing this packet.
