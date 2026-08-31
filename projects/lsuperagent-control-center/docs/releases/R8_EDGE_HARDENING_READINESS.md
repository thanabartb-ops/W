# R8_EDGE_HARDENING_READINESS evidence packet

## Release note and identity

- Release ID: `R8_EDGE_HARDENING_READINESS`
- Phase: planning/readiness only
- Domain: `activity-hub.online`
- Readiness result: `BLOCKED`
- External mutations performed: none

The roadmap originally assigned domain cutover to R7, while implementation history
used R7 for the authenticated runtime command and closed it at 48 PASS / 0 FAIL /
0 SKIP. This reconciliation preserves that history: the R7 closure does not mean
that domain cutover, stable production, or an edge activation gate passed. R8 is a
new readiness gate and does not authorize infrastructure activation.

## Decision basis

The repository does not contain observable, current evidence for production
deployment/stability, deployed E2E-01_CHAT..E2E-04_AUDIT and QAMap correlation, a complete
sanitized Wix/Cloudflare zone comparison, owner permissions, or executable
rollback targets. Under the fail-closed contract, the only valid result is:

`BLOCKED`

No example or inferred infrastructure value has been used in place of evidence.

## Prerequisite evidence index

| ID | Evidence required | Sanitized evidence reference | Result |
| --- | --- | --- | --- |
| P-01 | Production identity, commit, last-known-good | Not available | `BLOCKED` |
| P-02 | Approved stability window and continuous health | Not available | `BLOCKED` |
| P-03 | Apex/`www` and Vercel target confirmation | Not available | `BLOCKED` |
| P-04 | TLS certificate and renewal health | Not available | `BLOCKED` |
| P-05 | Production Supabase Auth callback | Not available | `BLOCKED` |
| P-06 | Production E2E-01_CHAT..E2E-04_AUDIT | Not available | `BLOCKED` |
| P-07 | Audit correlation and QAMap mapping | Not available | `BLOCKED` |
| P-08 | Complete sanitized Wix zone/TTLs | Not available | `BLOCKED` |
| P-09 | Email/non-web inventory and parity | Not available | `BLOCKED` |
| P-10 | Cloudflare ownership and owner approval | Not available | `BLOCKED` |
| P-11 | Rollback targets/operator/triggers | Not available | `BLOCKED` |
| P-12 | Zero unresolved Sev-1/Sev-2 issues | Not available | `BLOCKED` |

The collection method, parity requirements, command plan, approval checkpoints,
stop conditions, and rollback procedure are defined in
`docs/runbooks/CLOUDFLARE_EDGE.md`.

## Evidence matrix

This is the minimum schema for future authorized collection. One row is required
per check execution; append rows without overwriting earlier observations.

| Release ID | Commit SHA | Environment | UTC timestamp | Test/check ID | Expected | Actual | Status | Sanitized evidence ref | Resolver/system | Deployment/request/correlation ID | Rollback action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R8_EDGE_HARDENING_READINESS` | Not established for a production deployment | Planning | 2026-08-31 | R8-READINESS-001 | All P-01..P-12 evidenced | Required external evidence is not observable | `BLOCKED` | This packet; prerequisite index | Repository review only | Not available | None; no mutation occurred |

## QAMap contract

The canonical runtime mapping remains unchanged:

| Existing ID | Surface | Current R8 production evidence |
| --- | --- | --- |
| E2E-01_CHAT | CHAT | `BLOCKED` — deployed-path evidence absent |
| E2E-02_AUTHORIZATION | AUTHORIZATION | `BLOCKED` — deployed-path evidence absent |
| E2E-03_MEMORY | MEMORY | `BLOCKED` — deployed-path evidence absent |
| E2E-04_AUDIT | AUDIT | `BLOCKED` — deployed-path/correlation evidence absent |

R8 edge entries are independently identified as R8-EDGE-001 through
R8-EDGE-010 in the runbook validation matrix. They must not be renamed to the E2E
IDs, and DNS-only evidence must not be used to claim canonical runtime or database
correctness.

## Approval boundary

This packet requests no activation approval. A future transition to
`READY_FOR_OWNER_APPROVAL` requires every prerequisite to pass with sanitized
evidence and zero unexplained zone differences. Even that result only permits an
owner to review a separate activation request; it is not nameserver, proxy, WAF,
deployment, or Supabase authorization.
