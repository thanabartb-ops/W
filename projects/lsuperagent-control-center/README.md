# LSUPERAGENT Control Center

**Project slug:** `lsuperagent-control-center`  
**Target domain:** `activity-hub.online`  
**Status:** `DESIGN_STAGED`  
**Source authority:** this GitHub project path  
**Operational authority:** existing LSUPERAGENT / Supabase  

## Purpose

Build the production web control surface for LSUPERAGENT without creating a parallel runtime, memory store, database authority, or secret store.

Target flow:

```text
activity-hub.online
        ↓
Edge / DNS layer
        ↓
Vercel
        ↓
Next.js LSUPERAGENT App
        ↓
Trusted Agent Gateway
        ↓
Auth / Policy / Memory / Tools / LLM / Audit
        ↓
Existing canonical LSUPERAGENT / Supabase
```

## V1 modules

- Chat
- Projects
- Memory
- Tools
- Runtime
- Audit

## Release sequence

1. `R1_SOURCE` — project source, governance, documentation, CI foundation.
2. `R2_PREVIEW` — Next.js shell deployed to an isolated Vercel Preview.
3. `R3_GATEWAY` — trusted server-side `/api/health` and `/api/chat` gateway.
4. `R4_CANONICAL_DATA` — authenticated Memory and Audit integration with existing LSUPERAGENT/Supabase.
5. `R5_E2E` — browser-to-gateway-to-Supabase verification for chat, authorization, memory, and audit.
6. `R6_PRODUCTION` — verified Vercel production deployment with rollback evidence.
7. `R7_DOMAIN_CUTOVER` — change `activity-hub.online` only after R1–R6 pass.
8. `R8_EDGE_HARDENING` — Cloudflare DNS/WAF migration or hardening after production is stable.

## Hard constraints

- Do not create a second Supabase project.
- Do not create a second Memory Core.
- Do not deploy the legacy/mock single-file runtime as production.
- Do not expose a Supabase service-role credential or provider API key to browser code.
- Do not change production DNS before preview, E2E, production health, and rollback readiness pass.
- Do not treat model/session context as canonical memory.
- Every production-impacting change must have evidence and rollback instructions.

## Project documents

- Design: `../../docs/superpowers/specs/2026-08-20-lsuperagent-control-center-design.md`
- Source-of-truth manifest: `../../source-of-truth/LSUPERAGENT_CONTROL_CENTER_v1.yaml`

## Migration evidence

The detailed BANK-X-REWARD/Base44 migration note is intentionally not copied into this public repository path. The project tracks only the non-secret migration conclusions required for cutover: the old Base44 domain target remains active, current DNS authority is external to this application, and production DNS remains unchanged until the new stack is verified.
