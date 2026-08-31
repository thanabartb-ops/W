# LSUPERAGENT Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the first production-capable LSUPERAGENT web control surface without duplicating the existing canonical LSUPERAGENT/Supabase backend.

**Architecture:** The application lives under `projects/lsuperagent-control-center` in `thanabartb-ops/W`, uses Next.js App Router + TypeScript + Tailwind CSS on Vercel, and exposes privileged behavior only through server-side Trusted Agent Gateway routes. Existing LSUPERAGENT/Supabase remains the single durable authority for Auth, Memory, Audit, and approved runtime state; Cloudflare is deferred to post-production edge hardening.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, React, Supabase Auth (`@supabase/ssr` + `@supabase/supabase-js`), Vitest, Playwright, Vercel Preview Deployments.

**Spec:** `docs/superpowers/specs/2026-08-20-lsuperagent-control-center-design.md`

## Global Constraints

- Canonical backend: existing LSUPERAGENT / Supabase only.
- Do not create a new Supabase project, parallel Memory Core, duplicate runtime, or second audit authority.
- Browser-safe environment only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and non-secret UI configuration.
- Never expose service-role credentials, provider API keys, GitHub tokens, deployment tokens, or unrestricted runtime credentials to browser code.
- Privileged and state-changing operations must fail closed and pass through the server-side gateway.
- Production DNS for `activity-hub.online` remains unchanged until R6 production verification succeeds.
- V1 E2E scope remains exactly four paths: Chat, Authorization, Memory, Audit.
- Detailed account-specific Base44 migration evidence stays outside the public source tree.
- Node.js runtime floor: 20.9 or newer.
- Use current first-party patterns: Next.js App Router, Supabase cookie-based SSR with `@supabase/ssr`, and Vercel branch Preview deployments with environment isolation.

---

## Planned project tree

```text
projects/lsuperagent-control-center/
├── src/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── chat/page.tsx
│   │   │   ├── projects/page.tsx
│   │   │   ├── memory/page.tsx
│   │   │   ├── tools/page.tsx
│   │   │   ├── runtime/page.tsx
│   │   │   └── audit/page.tsx
│   │   ├── api/
│   │   │   ├── health/route.ts
│   │   │   ├── chat/route.ts
│   │   │   ├── memory/route.ts
│   │   │   ├── memory/candidate/route.ts
│   │   │   ├── tools/route.ts
│   │   │   ├── execute/route.ts
│   │   │   └── audit/route.ts
│   │   ├── auth/callback/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
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
├── docs/runbooks/
├── .env.example
├── package.json
├── playwright.config.ts
├── vitest.config.ts
├── tsconfig.json
└── README.md
```

## Task 1 — R1 Source foundation

**Files**
- Create application scaffold and configuration inside `projects/lsuperagent-control-center/`.
- Create `tests/unit/shell.test.tsx`.
- Modify project `README.md`.

**Produces:** installable Next.js source tree, lockfile, deterministic scripts, public environment contract.

- [ ] Scaffold with current `create-next-app@latest`, App Router, TypeScript, Tailwind, ESLint, `src/`, and pnpm.
- [ ] Add Vitest + Testing Library + jsdom.
- [ ] Write failing shell test that requires `LSUPERAGENT Control Center` and `NOT_CONNECTED`.
- [ ] Run test and confirm RED.
- [ ] Implement minimum shell and `.env.example` containing only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] Run `pnpm vitest run`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- [ ] Commit: `feat(control-center): scaffold Next.js source foundation`.

**Gate:** all commands exit 0; no backend-connectivity claim.

## Task 2 — R2 Navigation + status semantics + `/api/health`

**Files**
- Create shell/navigation components.
- Create typed `ConnectionStatus`.
- Create six application module pages: Chat, Projects, Memory, Tools, Runtime, Audit.
- Create `src/app/api/health/route.ts`.
- Create unit/integration tests.

**Produces:** responsive control-center shell and first real API contract.

- [ ] Write failing `StatusBadge` test for exact `NOT_CONNECTED` rendering.
- [ ] Write failing `/api/health` test requiring `app=ok`, `gateway=NOT_CONNECTED`, `backend=NOT_CONNECTED`, request ID, timestamp.
- [ ] Verify RED.
- [ ] Implement navigation and six pages; unavailable backend areas remain `NOT_CONNECTED`.
- [ ] Implement health route without making external connectivity claims.
- [ ] Run full unit suite, lint, type-check, build.
- [ ] Commit: `feat(control-center): add navigation shell and health contract`.

**Gate:** build succeeds and status semantics do not fabricate connectivity.

## Task 3 — R2 Vercel Preview evidence

**Files**
- Create `docs/runbooks/PREVIEW_RELEASE.md`.
- Update project README.

**Produces:** first actual Preview deployment, deployment/build reference, rollback-before-cutover procedure.

- [ ] Configure Vercel project root as `projects/lsuperagent-control-center`.
- [ ] Keep `activity-hub.online` unattached.
- [ ] Configure Preview environment separately from Production; do not add service-role/provider secrets.
- [ ] Trigger Preview from feature branch.
- [ ] Verify actual Preview `/api/health` returns HTTP 200 with honest backend status.
- [ ] Re-resolve `activity-hub.online`; confirm legacy production DNS is unchanged.
- [ ] Record deployment ID, preview URL, branch, commit SHA, health evidence, `production_dns_changed=false`.
- [ ] Commit preview runbook/evidence template.

**Gate:** Preview loads, health passes, production DNS unchanged.

## Task 4 — R3 Supabase cookie-session boundary

**Files**
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/proxy.ts`
- `src/proxy.ts`
- `src/lib/auth/get-current-user.ts`
- `src/app/auth/callback/route.ts`
- auth-boundary tests.

**Produces:** user-scoped browser/server Supabase clients; no admin/service-role client.

- [ ] Add `@supabase/supabase-js` + `@supabase/ssr`.
- [ ] Write failing public-env and auth-boundary tests.
- [ ] Implement `createBrowserClient` and cookie-based `createServerClient`.
- [ ] Implement session refresh proxy using current Supabase SSR pattern.
- [ ] Implement normalized `getCurrentUser()` that authenticates identity but does not grant privileged authority.
- [ ] Verify tests, lint, type-check, build.
- [ ] Commit: `feat(control-center): add Supabase SSR auth boundary`.

**Gate:** no service-role reference in browser code; auth boundary tests pass.

## Task 5 — R3 Trusted Agent Gateway + `/api/chat`

**Files**
- `src/lib/gateway/context.ts`
- `src/lib/gateway/errors.ts`
- `src/lib/gateway/authorize.ts`
- `src/lib/observability/request-log.ts`
- `src/app/api/chat/route.ts`
- gateway/chat tests.

**Produces:** normalized `GatewayContext`, stable public errors, deny-by-default chat boundary.

`GatewayContext`:

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

Stable public errors:

```text
UNAUTHENTICATED
FORBIDDEN
INVALID_REQUEST
POLICY_BLOCKED
UPSTREAM_UNAVAILABLE
AUDIT_WRITE_FAILED
INTERNAL_ERROR
```

- [ ] Write failing context-normalization test.
- [ ] Write failing unauthenticated chat test expecting 401 + request ID.
- [ ] Implement gateway normalization and safe structured logging.
- [ ] Implement `/api/chat` fail-closed: authenticated but unwired upstream returns 503 `UPSTREAM_UNAVAILABLE`, never fake text.
- [ ] Build and scan `.next/static` for service-role/provider/deployment secret names.
- [ ] Commit: `feat(control-center): add trusted gateway boundary`.

**Gate:** tests pass; browser bundle secret scan has zero matches.

## Task 6 — R4 Canonical Memory read + Audit correlation

**Files**
- `src/lib/gateway/memory.ts`
- `src/lib/gateway/audit.ts`
- `src/app/api/memory/route.ts`
- `src/app/api/audit/route.ts`
- memory/audit integration tests.

**Produces:** authorized read-only access to existing canonical memory/audit paths.

- [ ] Write tests for anonymous=401, insufficient scope=403, backend unavailable=503, approved canonical read=200.
- [ ] Implement read adapter only; no tables, migrations, or legacy `user_memory_store`.
- [ ] Filter revoked/expired/superseded/out-of-scope records according to approved policy.
- [ ] Require request/audit correlation where policy requires evidence.
- [ ] Verify integration suite and build.
- [ ] Commit: `feat(control-center): integrate canonical memory and audit reads`.

**Gate:** no new schema; allowed/denied tests and audit correlation pass.

## Task 7 — R4 Tools + deny-by-default execution

**Files**
- `src/lib/gateway/tools.ts`
- `src/app/api/tools/route.ts`
- `src/app/api/execute/route.ts`
- tool integration tests.

**Produces:** capability metadata plus protected execution route.

- [ ] Write tests: unknown tool/action=403 `POLICY_BLOCKED`; anonymous=401.
- [ ] Expose only stable tool ID, description, availability, scope, risk classification.
- [ ] Require auth, validation, policy decision, timeout/error classification, sanitized result, and audit correlation before privileged `VERIFIED` state.
- [ ] Verify tests/build.
- [ ] Commit: `feat(control-center): add deny-by-default tool boundary`.

**Gate:** no browser-side privileged tool invocation.

## Task 8 — R5 Exactly four Playwright E2E gates

**Files**
- `playwright.config.ts`
- `tests/e2e/chat.spec.ts`
- `tests/e2e/authorization.spec.ts`
- `tests/e2e/memory.spec.ts`
- `tests/e2e/audit.spec.ts`

**Produces:** deployed-path release verification.

- [ ] Install `@playwright/test` and Chromium.
- [ ] `E2E-01_CHAT`: authenticated browser → Chat → gateway → visible response/correlation.
- [ ] `E2E-02_AUTHORIZATION`: insufficiently scoped operation → blocked result visible.
- [ ] `E2E-03_MEMORY`: authorized request → canonical memory retrieval; no mock boolean proof.
- [ ] `E2E-04_AUDIT`: protected successful action → matching canonical audit correlation.
- [ ] Run all four against actual Preview/Staging URL.
- [ ] Commit: `test(control-center): add four production-path e2e gates`.

**Gate:** exactly 4 passed, 0 failed against deployed application.

## Task 9 — R6 Production + rollback evidence

**Files**
- `docs/runbooks/PRODUCTION_RELEASE.md`
- `docs/runbooks/ROLLBACK.md`

**Produces:** healthy Vercel production deployment before domain cutover.

- [ ] Record approved commit SHA, Preview deployment ID, 4-E2E summary, environment-variable names only, rollback deployment ID.
- [ ] Promote/deploy approved commit to Vercel Production without attaching `activity-hub.online`.
- [ ] Verify production URL + `/api/health`.
- [ ] Review build/runtime logs for release-blocking errors.
- [ ] Record last-known-good rollback deployment.
- [ ] Commit release/rollback runbooks.

**Gate:** production healthy before DNS cutover.

## Task 10 — R7 Domain cutover

**Files**
- `docs/runbooks/DOMAIN_CUTOVER.md`
- `docs/releases/<release-id>.md`

**Produces:** controlled migration of `activity-hub.online` from legacy Base44/Render routing to actual Vercel targets.

- [ ] Inspect Wix DNS zone directly and record complete visible zone.
- [ ] Obtain actual target values from the real Vercel project; never use example A/CNAME values as authority.
- [ ] Save previous apex + `www` web targets for rollback.
- [ ] Change only required web records; preserve NS/SOA/email/non-web records unless separately approved.
- [ ] Verify apex, `www`, TLS, auth callback, health, and application routes.
- [ ] If health fails, restore recorded prior web targets or last-known-good Vercel deployment.
- [ ] Commit non-secret release evidence.

**Gate:** post-cutover health and rollback evidence pass.

## Task 11 — R8 Optional Cloudflare edge hardening

**Files**
- `docs/runbooks/CLOUDFLARE_EDGE.md`

**Produces:** optional DNS-authority/WAF migration only after stable production.

- [ ] Inventory Wix DNS and recreate required records in Cloudflare.
- [ ] Inventory every owner/type, including DKIM, DMARC, verification, wildcard, and delegated-subdomain records, and prove exact parity.
- [ ] Prove current DNSSEC/DNSKEY and parent DS state; approve the provider-supported transition and DS/nameserver rollback before nameserver change.
- [ ] Do not combine nameserver migration with application-origin migration.
- [ ] Validate `/api/health` by HTTP 200 **and** parsed `gateway: CONNECTED` and `backend: CONNECTED` fields.
- [ ] Keep records DNS-only until `Full (strict)` origin validation and an active hostname-covering edge certificate are proven.
- [ ] After delegation, validate every inventoried DNS owner/type through authoritative and independent recursive resolvers.
- [ ] Add WAF/security rules incrementally and verify Vercel domain validation/auth/API routes after material changes.
- [ ] Record nameserver/rule rollback before activation.
- [ ] Commit edge-hardening runbook.

**Gate:** planning may complete, but readiness remains `BLOCKED` until the evidence register P-01 through P-12 in `docs/runbooks/CLOUDFLARE_EDGE.md` is satisfied one item at a time.

## Self-review

- Spec coverage: canonical authority, no duplicate runtime/memory, secrets, auth, gateway, memory, tools, audit, observability, Vercel Preview, exactly four E2Es, production, DNS cutover, rollback, Cloudflare are all mapped to tasks.
- Placeholder scan: live values such as Preview URL and production DNS targets are intentionally retrieved during execution rather than guessed.
- Type consistency: route paths, `GatewayContext`, public environment names, and status/error terms match the design spec.
- Scope control: no Supabase migration or new project is introduced; Base44 recovery is not an implementation dependency.
