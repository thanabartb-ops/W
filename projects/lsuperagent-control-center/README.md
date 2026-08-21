# LSUPERAGENT Control Center

Canonical app source for the LSUPERAGENT Mobile Web / PWA surface.

## Deployment mapping

- Primary UI host: `lsuperagent-pro-lab`
- Gateway host: `lsuperagent-r3-gateway-preview` (backend/gateway only)
- App source root: `projects/lsuperagent-control-center`
- Canonical backend/runtime authority remains the existing LSUPERAGENT / Supabase stack.

## Mobile visual system

The current mobile home implements the approved Matte Black × Pink × Sky Blue visual direction with real safe-area handling, mobile-first layout, dynamic text UI, and no fake device chrome.

## Verification

Required release checks:

```bash
pnpm install --frozen-lockfile
pnpm vitest run
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

All release checks passed in GitHub Actions run #33 for PR #14 before release promotion.
