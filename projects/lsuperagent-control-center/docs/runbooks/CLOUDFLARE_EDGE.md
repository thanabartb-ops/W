# Cloudflare edge readiness and activation runbook

## Control header

| Field | Value |
| --- | --- |
| Release ID | `R8_EDGE_HARDENING_READINESS` |
| Domain | `activity-hub.online` |
| Current phase | Planning/readiness only |
| Current result | `BLOCKED` |
| Application origin | Vercel only |
| Operational and durable authority | Existing LSUPERAGENT / Supabase only |
| Edge scope | Cloudflare DNS, TLS edge, proxy, and WAF only |

This document does **not** authorize deployment, DNS or nameserver mutation, proxy
activation, WAF activation, or Supabase changes. Cloudflare must never be used to
repair or replace an unhealthy runtime, authentication flow, deployment, database,
or E2E path. `READY_FOR_OWNER_APPROVAL`, if reached later, is not activation
approval; a second explicit owner approval is required.

## Release-label reconciliation

The original roadmap labels R7 as `R7_DOMAIN_CUTOVER`. Implementation history,
however, used R7 for the authenticated runtime command and closed that work at
48 PASS / 0 FAIL / 0 SKIP. The history is not being rewritten. In particular,
the R7 result is **not** evidence that domain cutover, production stability, or an
edge activation gate ever passed. This R8 release is the first edge-hardening
planning/readiness gate.

## Architectural invariants

- Existing LSUPERAGENT/Supabase remains the sole operational and durable authority.
- Vercel remains the sole application origin. No origin migration is combined with
  a nameserver migration.
- Cloudflare is limited to DNS, TLS edge, proxy, and WAF. Do not create Workers,
  Pages, D1, KV, Durable Objects, databases, memory/audit stores, or another app.
- Preserve every MX, TXT, SPF, DKIM, DMARC, verification, and non-web record unless
  a separately approved change explicitly says otherwise.
- Use only observed values from authorized Wix, Cloudflare, Vercel, and Supabase
  surfaces. Never substitute examples or inferred A/CNAME targets.
- Keep credentials, tokens, authorization headers, account IDs, internal-only
  hostnames, and other sensitive values out of the repository and captured output.
- DNS stability precedes optional proxy enablement; proxy stability precedes
  incremental WAF enforcement.

## Prerequisite checklist

Every row requires sanitized, observable evidence. A missing row makes the release
`BLOCKED`; narrative assurance, inference, and sample values are not evidence.

| # | Required evidence | Evidence location | State |
| --- | --- | --- | --- |
| P-01 | Production deployment identity, commit SHA, and last-known-good deployment | R8 evidence packet, P-01 | `BLOCKED` — not observable in repository |
| P-02 | Continuous production health over owner-approved stability window | R8 evidence packet, P-02 | `BLOCKED` — window and observations absent |
| P-03 | Apex and `www` match Vercel-confirmed production targets | R8 evidence packet, P-03 | `BLOCKED` — authoritative and Vercel evidence absent |
| P-04 | TLS certificate identity, chain, expiry, and renewal state healthy | R8 evidence packet, P-04 | `BLOCKED` — production evidence absent |
| P-05 | Supabase Auth production callback succeeds | R8 evidence packet, P-05 | `BLOCKED` — production-flow evidence absent |
| P-06 | E2E-01_CHAT through E2E-04_AUDIT pass against deployed production | R8 evidence packet, P-06 | `BLOCKED` — deployed-path evidence absent |
| P-07 | Canonical audit correlation and QAMap mapping | R8 evidence packet, P-07 | `BLOCKED` — production mapping absent |
| P-08 | Complete sanitized Wix inventory including required values and TTLs | Source-zone table below and R8 packet, P-08 | `BLOCKED` — authorized export absent |
| P-09 | Email and all non-web records identified with parity plan | Source/target tables below, P-09 | `BLOCKED` — inventory absent |
| P-10 | Cloudflare account/zone ownership and nameserver-change owner approval | External approval reference in R8 packet, P-10 | `BLOCKED` — approval absent |
| P-11 | Prior nameservers/records, rollback operator, triggers, and last-known-good target | Rollback record below, P-11 | `BLOCKED` — values/operator absent |
| P-12 | No unresolved Sev-1/Sev-2 runtime, auth, audit, or DNS issue | Sanitized issue review, P-12 | `BLOCKED` — review absent |

## Sanitized Wix source-zone inventory

Inventory capture must be performed through an owner-authorized, read-only path.
Store raw sensitive exports outside Git; transcribe only sanitized values needed to
prove parity. No current record values have been observed during this planning
phase, so the table deliberately contains no fabricated infrastructure values.

| Record ID | Type | Sanitized owner/name | Sanitized value/target | Priority | TTL | Purpose | Preserve? | Evidence reference | State |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WI-PENDING | — | Not observed | Not observed | Not observed | Not observed | Full Wix zone inventory | Pending inventory; no decision yet | P-08 | `BLOCKED` |

The completed inventory must include SOA context and every apex, `www`, MX, TXT,
CAA, SPF, DKIM, DMARC, auth-related, and service-verification record. Multiple
values must remain separate rows. Wildcards and delegated subdomains must be
called out explicitly.

## Cloudflare target-zone parity

Create one target row per observed Wix source row. Normalize FQDN case and trailing
dots for comparison, but preserve semantic values, MX priority, and required TTL
behavior. An unexplained difference is a stop condition.

| Source record ID | Target record ID | Name/type/value/priority parity | Source TTL | Target TTL behavior | Proxy mode | Preservation/change decision | Evidence | State |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WI-PENDING | CF-PENDING | Cannot compare until source and target inventories are observed | Not observed | Not observed | `DNS-only` pending classification | No change authorized | P-08/P-09 | `BLOCKED` |

MX, TXT, SPF, DKIM, DMARC, CAA, verification, auth callback dependencies, and any
ambiguous record are always DNS-only. Only explicitly approved web/API hostnames
may later be considered for proxying. Target-zone preparation remains inactive
until owner approval and must not alter authoritative Wix DNS.

## Origin and proxy-mode matrix

| Surface | Required origin/authority | Preparation mode | Earliest optional proxy mode | Validation |
| --- | --- | --- | --- | --- |
| Apex | Actual Vercel-confirmed target; not yet observed | DNS-only | Proxied only after delegation stability and separate approval | DNS, redirect, TLS, health |
| `www` | Actual Vercel-confirmed target; not yet observed | DNS-only | Proxied only after delegation stability and separate approval | DNS, redirect, TLS, health |
| `/api/health` and `/api/chat` | Same sole Vercel application origin | DNS-only | Follows approved web hostname only | health, authenticated API, upstream status |
| Supabase Auth callback | Existing production application/Supabase flow | DNS-only dependencies | Do not proxy an ambiguous verification/auth record | login, callback, refresh |
| MX and mail policy | Existing providers from Wix inventory | DNS-only | Never proxied | MX/TXT parity and approved mail check |
| Verification/CAA/other non-web | Existing observed values | DNS-only | Never proxied unless a later explicit design proves suitability | exact parity and provider validation |

## Phased procedure and approval checkpoints

### 1. Zone preparation — checkpoint A

1. Obtain explicit approval to perform read-only inventory collection.
2. Record deployment identity, production evidence, source inventory, target draft,
   owner-approved stability window, and rollback data in the evidence packet.
3. Prepare a non-authoritative Cloudflare zone only after separate authorization.
4. Keep all records DNS-only and make no Wix, registrar, Vercel, or Supabase change.

**Checkpoint A:** prerequisite P-01 through P-12 must all be PASS before any
activation request is assembled.

### 2. Parity verification — checkpoint B

1. Compare normalized source and target record sets by name, type, value, priority,
   and required TTL behavior.
2. Require zero missing, extra, or unexplained-different records.
3. Independently review mail, verification, Vercel, and Supabase dependencies.

**Checkpoint B:** owner signs the sanitized parity report and rollback packet.
This still does not authorize nameserver activation.

### 3. Nameserver activation — checkpoint C (future phase only)

1. Obtain a second explicit owner approval naming the change window and operator.
2. Capture a fresh baseline and confirm rollback evidence is accessible without the
   application or new DNS path.
3. Change only the approved delegation set; do not change origin, proxy, or WAF.

### 4. Propagation observation — checkpoint D

Observe delegation, DNS, web, TLS, API, auth, E2E, email, latency, and error rate
through the approved window. Any threshold breach invokes fail-closed rollback.

### 5. Optional proxy enablement — checkpoint E

After DNS stability, request separate approval per eligible hostname. Enable one
hostname at a time, repeat the full relevant matrix, and retain DNS-only mode for
ambiguous, auth-verification, mail, and non-web records.

### 6. Incremental WAF enablement — checkpoint F

After proxy stability, document each rule ID, mode, protected path, and rollback.
Begin in log/simulate mode where available; verify authorized API/auth callbacks,
application-boundary rejection of unauthorized requests, and secret-safe logs.
Promote only one stable rule at a time under separate approval.

## Validation commands

Run only in a future authorized validation window. Replace shell variables with
values obtained from the approved change record; do not commit their contents.
Use at least two genuinely independent resolvers selected by the operator.

```bash
export RELEASE_ID=R8_EDGE_HARDENING_READINESS
export DOMAIN=activity-hub.online
export RESOLVER_A='<approved-resolver-a>'
export RESOLVER_B='<approved-resolver-b>'

for resolver in "$RESOLVER_A" "$RESOLVER_B"; do
  for type in NS SOA A AAAA MX TXT CAA; do
    dig +noall +answer @"$resolver" "$DOMAIN" "$type"
  done
  dig +noall +answer @"$resolver" "www.$DOMAIN" A
  dig +noall +answer @"$resolver" "www.$DOMAIN" AAAA
done

curl --fail-with-body --silent --show-error --location \
  --output /dev/null --write-out '%{http_code} %{url_effective}\n' \
  "https://$DOMAIN/api/health"
curl --silent --show-error --include --max-redirs 0 "https://$DOMAIN/"
openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" \
  -showcerts </dev/null
```

Before activation, also run the existing R1/R2/R7 regression suite, full Vitest,
TypeScript, lint, and production build; run E2E-01_CHAT..E2E-04_AUDIT against the deployed
production URL using the repository's approved harness. Authentication and
`/api/chat` checks must use secret-safe tooling and must not print headers or
payload secrets. Every captured result records UTC timestamp, environment,
release ID, sanitized reference/correlation ID, resolver/system, and rollback.

## Validation matrix

| Check ID | Stage | Surface | Expected result | Evidence fields |
| --- | --- | --- | --- | --- |
| R8-EDGE-001 | Baseline/parity/post | Apex | Approved Vercel target, expected redirect, healthy TLS/HTTP | Both resolvers, Vercel reference, request ID |
| R8-EDGE-002 | Baseline/parity/post | `www` | Approved target and redirect behavior | Both resolvers, Vercel reference |
| R8-EDGE-003 | Baseline/post | TLS | Valid identity/chain and healthy renewal state | Certificate fingerprint/reference, UTC |
| R8-EDGE-004 | Baseline/post | API/health | `/api/health` healthy; authenticated `/api/chat` contract passes | Sanitized request/correlation IDs |
| R8-EDGE-005 | Baseline/post | Auth callback | Login, callback, and session refresh pass | Sanitized Supabase/request references |
| R8-EDGE-006 | Parity/post | Email | MX, SPF, DKIM, DMARC exact parity; approved non-destructive flow passes | Resolver/provider references |
| R8-EDGE-007 | Parity/post | Verification/CAA | No missing or unexplained difference | Record IDs and provider references |
| R8-EDGE-008 | Baseline/post | Runtime E2E/QAMap | E2E-01_CHAT, E2E-02_AUTHORIZATION, E2E-03_MEMORY, E2E-04_AUDIT pass | Canonical correlation and QAMap refs |
| R8-EDGE-009 | Post | Delegation | Approved Cloudflare NS visible from independent resolvers | Resolver answers and UTC |
| R8-EDGE-010 | Post | Stability | Error rate, latency, and upstream status within approved thresholds/window | Monitoring reference |

R8 edge check IDs are separate QAMap entries. DNS success never proves runtime,
database, authorization, memory, or audit correctness.

## Stop conditions

Stop before mutation, or roll back during a future activation, for any missing
prerequisite/approval; nonzero unexplained parity difference; unknown or ambiguous
record; unhealthy web, auth, API, email, TLS, domain validation, or E2E result;
unresolved Sev-1/Sev-2 issue; unapproved origin change; unavailable rollback data
or operator; secret exposure; or breach of the approved error, latency,
propagation, or stability threshold. Do not attempt to compensate with Cloudflare.

## Rollback procedure (future activation only)

The following record must be complete and independently accessible before change:

| Item | Required recorded value | Current state |
| --- | --- | --- |
| Prior authoritative nameservers | Exact observed set in restricted external evidence | `BLOCKED` — not captured |
| Prior DNS records | Complete sanitized/exported Wix set and protected raw copy | `BLOCKED` — not captured |
| Last-known-good Vercel deployment | Deployment ID, URL/reference, and commit | `BLOCKED` — not captured |
| Responsible operator and backup | Named in owner-approved change record | `BLOCKED` — not assigned |
| Approved rollback thresholds/window | Health, TLS, auth, API, email, E2E, error, latency | `BLOCKED` — not approved |

On a trigger: freeze all further changes; disable the individual WAF rule or proxy
change first when that is the isolated cause; otherwise restore the prior
nameserver delegation and only the explicitly changed records from independently
stored evidence. Do not migrate the origin. Record UTC time and operator action,
observe propagation, then repeat DNS, TLS, health, auth, API, email, and E2E
validation. Escalate while remaining fail-closed if restoration cannot be proven.

## Evidence locations and schema

- Sanitized readiness packet:
  `docs/releases/R8_EDGE_HARDENING_READINESS.md`
- This procedure and sanitized inventory/parity views:
  `docs/runbooks/CLOUDFLARE_EDGE.md`
- Concise activity record: `docs/runbooks/WORK_LOG.md`
- Sensitive raw exports, credentials, account identifiers, and operator contact
  details: owner-controlled external store referenced only by sanitized ID.

Each evidence row must contain: release ID, commit SHA, environment, UTC timestamp,
test/check ID, expected result, actual result, PASS/FAIL/BLOCKED/SKIP, sanitized
evidence reference, resolver/external system, deployment/request/correlation ID
when available, and rollback action. SKIP requires an explicit reason and can
never satisfy a prerequisite.

## Current decision

`BLOCKED`

Production stability, deployed E2E/QAMap, source/target DNS inventories, ownership
approval, and actionable rollback evidence are not currently observable. No
external surface was queried or mutated in this planning phase.
