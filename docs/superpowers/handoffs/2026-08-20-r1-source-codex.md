# Codex Handoff — LSUPERAGENT Control Center R1_SOURCE

**Date:** 2026-08-20
**Repository:** `thanabartb-ops/W`
**Branch:** `agent/lsuperagent-control-center-v1`
**Project path:** `projects/lsuperagent-control-center`
**PR:** #7
**Execution scope:** `R1_SOURCE` / Implementation Plan Task 1 only

## Authority

The binding design is:

`docs/superpowers/specs/2026-08-20-lsuperagent-control-center-design.md`

The implementation plan is:

`docs/superpowers/plans/2026-08-20-lsuperagent-control-center-implementation.md`

If the plan conflicts with the design, the design wins.

## Required Codex workflow

1. Use `superpowers:using-git-worktrees` first. Detect existing isolation before creating anything.
2. Use `superpowers:subagent-driven-development` to execute the implementation plan.
3. Dispatch a fresh implementer for Task 1.
4. Require implementer self-review and fresh test/build evidence.
5. Dispatch the task reviewer after implementation.
6. Do not begin Task 2 until Task 1 has a clean task review and the R1 gate is satisfied.
7. Stop after Task 1 / `R1_SOURCE` and report evidence. Do not continue to R2 in this Codex run.

## Global constraints

- Existing LSUPERAGENT / Supabase is the only canonical operational backend.
- Do not create a new Supabase project.
- Do not create a duplicate Memory Core, runtime, audit authority, or secret store.
- Do not modify Supabase production schema in R1.
- Do not deploy Supabase Edge Functions in R1.
- Do not create or attach a production Vercel domain in R1.
- Do not modify `activity-hub.online` or any DNS record.
- Do not add `SUPABASE_SERVICE_ROLE_KEY`, provider API keys, GitHub tokens, Vercel tokens, OAuth secrets, or unrestricted credentials to browser code or committed files.
- No backend connectivity claim is allowed in R1.
- Missing backend integrations must remain `NOT_CONNECTED`.
- Node.js runtime floor: 20.9+.
- Package manager: pnpm.
- Work only under the approved project path plus task-specific tests/docs/config.

## Task 1 — R1 Source foundation

### Files

- Create the application scaffold and configuration inside `projects/lsuperagent-control-center/`.
- Create `projects/lsuperagent-control-center/tests/unit/shell.test.tsx`.
- Update `projects/lsuperagent-control-center/README.md` as needed.

### Required result

Produce an installable Next.js source tree, lockfile, deterministic scripts, and a browser-safe public environment contract.

### Execution steps

- Scaffold with current `create-next-app@latest` using App Router, TypeScript, Tailwind CSS, ESLint, `src/`, and pnpm.
- Add Vitest, Testing Library, and jsdom.
- Write a failing shell test that requires exact visible text:
  - `LSUPERAGENT Control Center`
  - `NOT_CONNECTED`
- Run the test and record the RED result before implementation.
- Implement the minimum shell required to make the test pass.
- Create `.env.example` containing only:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Do not add any real secret values.
- Run all required verification commands fresh:

```bash
pnpm vitest run
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

- All four commands must exit 0 before Task 1 can be marked complete.
- Commit with exactly:

```text
feat(control-center): scaffold Next.js source foundation
```

## R1 gate

Task 1 is complete only if all of the following are evidenced:

- real files exist in the repository worktree;
- RED test was observed before implementation;
- Vitest passes after implementation;
- lint exits 0;
- TypeScript check exits 0;
- production build exits 0;
- `.env.example` contains public variable names only;
- no backend connectivity is claimed;
- no Supabase schema/runtime/DNS/deployment side effects occurred;
- task reviewer reports spec compliance and code quality acceptable.

## Mandatory stop condition

After Task 1 is reviewed and committed, STOP.

Do not implement navigation, `/api/health`, Supabase Auth, Trusted Agent Gateway, Vercel Preview, canonical Memory/Audit access, E2E, production deployment, or domain cutover in this run.

## Final Codex report contract

Return only evidence-backed values:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
TASK: R1_SOURCE / Task 1
BRANCH:
WORKTREE:
COMMIT_SHA:
FILES_CHANGED:
RED_TEST_EVIDENCE:
VITEST_RESULT:
LINT_RESULT:
TYPECHECK_RESULT:
BUILD_RESULT:
SECRET_SCAN_NOTES:
SUPABASE_SCHEMA_CHANGED: NO
SUPABASE_EDGE_FUNCTION_DEPLOYED: NO
VERCEL_DEPLOYED: NO
DNS_CHANGED: NO
REVIEW_RESULT:
CONCERNS:
NEXT_GATE: R2_PREVIEW (BLOCKED_PENDING_USER_REVIEW)
```

Never report PASS for a command that was not actually executed.