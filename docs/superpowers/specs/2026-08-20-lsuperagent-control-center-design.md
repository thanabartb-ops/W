# LSUPERAGENT Control Center Design

**Date:** 2026-08-20  
**Project:** `LSUPERAGENT Control Center`  
**Slug:** `lsuperagent-control-center`  
**Target domain:** `activity-hub.online`  
**Design status:** `DESIGN_STAGED`  
**Operational authority:** existing LSUPERAGENT / Supabase  
**Source authority:** GitHub path `projects/lsuperagent-control-center`  

## 1. Goal

Create a production-grade web control surface for LSUPERAGENT that exposes Chat, Projects, Memory, Tools, Runtime, and Audit through a trusted server-side gateway while preserving the existing LSUPERAGENT/Supabase canonical authority.

The web application must be independently deployable, observable, testable, and replaceable without duplicating the runtime, database, Memory Core, audit authority, or secret store.

## 2. Non-goals

This project does not:

- rebuild or replace the existing LSUPERAGENT canonical Supabase backend;
- create a second Memory Core or operational database;
- deploy the legacy/mock single-file runtime as production;
- recover or continue BANK-X-REWARD application logic;
- depend on Base44 after domain cutover;
- move production DNS before the new stack is verified;
- make Cloudflare a second application host;
- expose service-role credentials or provider API keys to browser code.

## 3. Architecture

```text
activity-hub.online
        │
        ▼
DNS / edge layer
        │
        ▼
Vercel
        │
        ▼
Next.js App Router
┌─────────────────────────────────────┐
│ Chat  Projects  Memory  Tools       │
│ Runtime  Audit                      │
└─────────────────┬───────────────────┘
                  │
                  ▼
        Trusted Agent Gateway
                  │
      ┌───────────┼────────────┐
      ▼           ▼            ▼
     Auth       Policy       Retrieval
      │           │            │
      └───────────┼────────────┘
                  ▼
        Tool / LLM execution
                  │
                  ▼
          Verification / Audit
                  │
                  ▼
     Existing LSUPERAGENT / Supabase
```

### 3.1 Authority split

- GitHub owns application source and change history.
- Vercel owns build/deployment execution for this web application.
- Next.js owns UI rendering and server-side route handling for this application.
- Trusted Agent Gateway owns request validation, authentication context, policy enforcement, orchestration, and response shaping for web requests.
- Existing LSUPERAGENT/Supabase remains the only canonical operational authority for durable memory, audit state, and approved runtime data.
- Cloudflare, when activated, is an edge/DNS/security layer only; it does not become an application runtime or database authority.

## 4. Application boundaries

### 4.1 Browser

The browser may contain only public configuration and user-scoped auth state.

Allowed browser configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- non-secret UI configuration

Forbidden in browser bundles:

- Supabase service-role credentials
- OpenAI/provider API keys
- GitHub tokens
- deployment tokens
- unrestricted runtime credentials

### 4.2 Server-side gateway

The gateway runs in server-only Next.js Route Handlers or equivalent server functions and is the only web-facing entry point for privileged LSUPERAGENT operations.

Initial API contract:

```text
GET  /api/health
POST /api/chat
GET  /api/memory
POST /api/memory/candidate
GET  /api/tools
POST /api/execute
GET  /api/audit
```

R2 implements `/api/health`. R3 implements `/api/chat`. Remaining routes become active only after their corresponding policy and audit contracts exist.

## 5. Authentication

Use Supabase Auth with cookie-based server-side sessions for the Next.js App Router.

Rules:

1. Browser authentication uses the existing Supabase project and publishable key.
2. Server routes verify the current user/session before any protected operation.
3. Authenticated identity is converted into a normalized gateway execution context.
4. A valid login is not sufficient authority for privileged writes; policy checks remain mandatory.
5. Any administrative or service-role access remains server-only.
6. OAuth callback configuration is created for the new application; legacy Base44 callback paths are not reused as authority.

## 6. Gateway execution context

Every protected request is normalized into a single internal contract:

```ts
export type GatewayContext = {
  requestId: string
  userId: string
  workspaceId: string | null
  action: string
  input: unknown
  receivedAt: string
}
```

No executor receives a raw browser request. The gateway validates and normalizes first.

## 7. Chat flow

```text
User input
  ↓
POST /api/chat
  ↓
Session verification
  ↓
Request validation
  ↓
Build authorized retrieval packet
  ↓
Policy decision
  ↓
LLM/tool execution if allowed
  ↓
Output verification
  ↓
Audit write
  ↓
Response to browser
```

Failure is fail-closed for protected or state-changing operations.

## 8. Memory

The web app does not invent a new memory schema.

Rules:

- canonical/verified LSUPERAGENT memory outranks session context;
- browser/session text is never silently promoted to canonical memory;
- new durable memory enters as a candidate through the existing policy path;
- revoked, expired, superseded, or out-of-scope records are not returned by default;
- memory retrieval and promotion must remain auditable;
- the project does not use the legacy `user_memory_store` schema from old runtime prototypes.

## 9. Tools

Tool execution is deny-by-default.

Each tool exposed to the web app requires:

- stable tool identifier;
- explicit allowed action scope;
- authenticated caller context;
- policy decision before execution;
- sanitized input contract;
- timeout/error classification;
- audit event containing request/tool/result references without raw secrets.

The Tools UI may display capability metadata before execution support exists, but must clearly distinguish `AVAILABLE`, `BLOCKED`, and `NOT_CONNECTED` states.

## 10. Audit

Every state-changing or privileged execution must emit a canonical audit event.

Minimum correlation fields at the gateway boundary:

```text
request_id
user_id
workspace_id
route/action
decision/result
started_at
completed_at
correlation reference to canonical audit record
```

The application must never claim an action completed merely because the UI received HTTP 200. A completion state requires the expected runtime result and, where required, the audit record.

## 11. UI modules

### Chat

Primary LSUPERAGENT interaction surface. Shows request state, streaming/non-streaming response state, execution ID/correlation reference, and blocked/failure state.

### Projects

Read-oriented V1 view of known LSUPERAGENT project/work state. No unrestricted project mutation in the first release.

### Memory

Read canonical/verified memory relevant to the authorized user. Candidate-write functionality is introduced only after the memory-write policy route passes integration tests.

### Tools

Displays tool registry/capability state and executes only tools explicitly enabled by the gateway policy.

### Runtime

Displays application/gateway health, deployment/build reference, and canonical backend reachability. It must distinguish UI health, gateway health, and backend health.

### Audit

Displays authorized audit records and correlation IDs. It never exposes secrets or unrestricted service logs.

## 12. Repository structure

Planned application structure:

```text
projects/lsuperagent-control-center/
├── src/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── chat/
│   │   │   ├── projects/
│   │   │   ├── memory/
│   │   │   ├── tools/
│   │   │   ├── runtime/
│   │   │   └── audit/
│   │   ├── api/
│   │   │   ├── health/route.ts
│   │   │   ├── chat/route.ts
│   │   │   ├── memory/route.ts
│   │   │   ├── tools/route.ts
│   │   │   ├── execute/route.ts
│   │   │   └── audit/route.ts
│   │   └── auth/
│   ├── components/
│   ├── lib/
│   │   ├── auth/
│   │   ├── gateway/
│   │   ├── policy/
│   │   ├── supabase/
│   │   └── observability/
│   └── types/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── public/
├── .env.example
├── package.json
├── playwright.config.ts
└── README.md
```

Focused files are preferred over a single large runtime file.

## 13. Environment strategy

Three isolated application environments:

- `development` — local development, never production DNS.
- `preview` — Vercel branch/PR preview; isolated preview environment variables.
- `production` — main production deployment; custom domain attached only after release verification.

Secrets are scoped by environment. Preview deployments must not automatically inherit production-only privileged credentials.

## 14. Vercel strategy

Vercel is the primary host for the Next.js web application and gateway.

Rules:

- feature branches produce Preview deployments;
- production is promoted only from the approved production branch/release path;
- build and runtime logs are part of release evidence;
- sensitive environment variables are stored server-side in Vercel project settings;
- custom domain attachment occurs after preview/E2E/production verification;
- production DNS target values are taken from the actual Vercel project configuration, never from examples.

## 15. Cloudflare strategy

Cloudflare activation is R8, not a prerequisite for R1–R7.

If DNS authority is migrated from Wix to Cloudflare:

1. inventory the complete Wix DNS zone first;
2. include every owner/type, including DKIM, DMARC, verification, wildcard, and delegated-subdomain records;
3. prove the current DNSSEC/DNSKEY and parent DS state and approve a matching DNSSEC transition and rollback before changing nameservers;
4. recreate required records in Cloudflare and prove exact zone parity;
5. change nameservers only after parity and the DNSSEC/DS prerequisite are proven;
6. validate every inventoried owner/type after delegation, not only apex and `www`;
7. keep records DNS-only until Cloudflare is set to `Full (strict)`, the origin certificate validates, and an active edge certificate covers each hostname to proxy;
8. require `/api/health` HTTP 200 plus parsed `gateway: CONNECTED` and `backend: CONNECTED` fields before and after each material change;
9. enable WAF/security rules only after the application is stable;
10. do not proxy routes in a way that breaks Vercel domain verification or authentication callbacks.

Cloudflare must not host a second copy of the LSUPERAGENT application unless a separately approved disaster-recovery design exists.

## 16. Testing strategy

### Unit tests

Cover deterministic validation, context normalization, route input validation, policy response handling, and output shaping.

### Integration tests

Cover Supabase session verification, authorized canonical reads, denied reads/writes, audit correlation, and gateway/provider failure behavior.

### E2E tests

Only four mandatory production-path tests for V1:

1. `E2E-01_CHAT` — authenticated browser → Chat UI → `/api/chat` → gateway → response visible.
2. `E2E-02_AUTHORIZATION` — unauthorized/insufficiently scoped action → gateway → blocked result visible.
3. `E2E-03_MEMORY` — authorized request → canonical memory retrieval → expected context used/returned.
4. `E2E-04_AUDIT` — successful protected action → canonical audit record/correlation evidence exists.

E2E must exercise the deployed application. A mock boolean such as `tenantIsolationVerified = true` is never considered proof.

## 17. Observability

Every server request uses a generated `requestId` and structured log fields.

Minimum runtime diagnostics:

- deployment/build reference;
- request ID;
- route/action;
- authenticated/anonymous classification without sensitive user data;
- duration;
- result class (`VERIFIED`, `BLOCKED`, `FAILED`);
- upstream/backend status class;
- canonical audit correlation reference when applicable.

Raw tokens, API keys, authorization headers, provider prompts containing secrets, and service-role credentials are never logged.

## 18. Error handling

Public API errors use stable categories rather than leaking internal stack details:

```text
UNAUTHENTICATED
FORBIDDEN
INVALID_REQUEST
POLICY_BLOCKED
UPSTREAM_UNAVAILABLE
AUDIT_WRITE_FAILED
INTERNAL_ERROR
```

The UI displays a user-safe error plus request ID. Detailed diagnostics remain in server logs/audit evidence.

## 19. Release sequence and gates

### R1_SOURCE

Deliverables:

- project directory;
- design/spec;
- source-of-truth manifest;
- dependency and CI foundation.

Gate: design reviewed and implementation plan approved.

### R2_PREVIEW

Deliverables:

- Next.js/TypeScript/Tailwind shell;
- six navigation modules;
- `/api/health`;
- first Vercel Preview URL.

Gate: build succeeds, preview loads, production DNS unchanged.

### R3_GATEWAY

Deliverables:

- server-only gateway boundary;
- auth context;
- validated `/api/chat` contract;
- failure categories.

Gate: unit/integration tests pass; no privileged credentials in browser build.

### R4_CANONICAL_DATA

Deliverables:

- existing Supabase Auth integration;
- canonical memory read path;
- canonical audit path;
- no new parallel memory schema.

Gate: allowed/denied integration tests plus audit evidence pass.

### R5_E2E

Deliverables: four Playwright E2E cases.

Gate: all four pass against a deployed preview/staging target.

### R6_PRODUCTION

Deliverables:

- production Vercel deployment;
- health verification;
- logs reviewed;
- rollback target identified.

Gate: production deployment is healthy before domain cutover.

### R7_DOMAIN_CUTOVER

Deliverables:

- verify actual Wix DNS zone;
- replace only the required Base44 web targets with actual Vercel targets;
- verify apex, `www`, TLS, auth callback, health, and application routes.

Gate: post-cutover health and rollback evidence pass.

### R8_EDGE_HARDENING

Deliverables: optional Cloudflare DNS/WAF migration after stable production.

Gate: full DNS inventory parity and no regression in web/auth/email services.

## 20. Rollback model

Before domain cutover:

- rollback is a Vercel deployment rollback/redeployment while old domain routing stays untouched.

During/after domain cutover:

- preserve the previous web DNS target values in the release record;
- if the new application fails release health, restore the last known-good DNS target or last known-good Vercel deployment according to the incident decision;
- do not change nameservers and application origin in the same release.

## 21. Migration baseline

The existing Base44 application is treated as a legacy external system. Source recovery is optional and is not a dependency for the new LSUPERAGENT application.

Current migration baseline conclusions used by this design:

- production domain remains unchanged during development;
- legacy Base44 routing is still externally observable;
- detailed Base44 source recovery is unavailable without additional access/plan;
- the new application is built from zero against existing LSUPERAGENT/Supabase;
- DNS cutover is a separate release after application verification.

Sensitive/account-specific migration evidence remains outside the public application source tree unless explicitly approved for publication.

## 22. External technical basis checked on 2026-08-20

Implementation must follow current primary documentation rather than old prototypes:

- Next.js documentation for App Router/Route Handlers and server-only environment behavior.
- Supabase documentation for Next.js server-side authentication, cookie sessions, publishable client keys, and RLS-backed authorization.
- Vercel documentation for Git-based Preview deployments, environment scoping, sensitive environment variables, build/runtime logs, and domain configuration.

Reference URLs:

- https://supabase.com/docs/guides/auth/quickstarts/nextjs
- https://supabase.com/docs/guides/auth/server-side
- https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs
- https://vercel.com/kb/git-integration
- https://vercel.com/academy/vercel-foundations/vercel-settings

## 23. Acceptance criteria for the design

The design is accepted when all of the following remain true:

- one canonical operational backend: existing LSUPERAGENT/Supabase;
- one primary application source path in GitHub;
- one primary application host: Vercel;
- secrets remain server-side;
- no DNS production change before release verification;
- four explicit V1 E2E paths only;
- every production-impacting release has health evidence and an actionable rollback path;
- no legacy mock runtime is treated as production evidence.
