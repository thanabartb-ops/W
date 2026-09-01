# LSUPERAGENT R4 Canonical Backend Implementation Plan

1. Add failing unit test for canonical backend health probe semantics.
2. Implement minimum server-only GET probe for `lsuperagent-runtime` health.
3. Add failing route test showing authenticated `/api/chat` reports backend `CONNECTED` when the canonical runtime health probe succeeds, while provider execution remains disabled.
4. Wire the probe into the canonical gateway without calling backend POST/command routes.
5. Update LSUPERAGENT PRO handshake mapping for backend-connected/provider-disabled state.
6. Extend GitHub network E2E to run PRO -> TLS -> Gateway -> existing Supabase runtime GET health.
7. Verify tests, lint, TypeScript, build, and source boundaries.
8. Keep PRs draft/unmerged and stop before provider execution, live writes, production deploy, or DNS.
