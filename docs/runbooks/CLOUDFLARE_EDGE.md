# R8 Cloudflare Edge Hardening Plan

## Status and scope

- **Planning:** `COMPLETE`
- **Readiness:** `BLOCKED`
- **Execution:** prohibited until every prerequisite `P-01` through `P-12` has
  evidence and an explicit approval is recorded.

This runbook is evidence collection only. It does not authorize DNS delegation,
Cloudflare proxying, Vercel changes, Supabase changes, runtime changes, or an R7
status mutation. Cloudflare remains DNS/edge infrastructure and never becomes a
second application runtime or data authority.

## Prerequisite evidence register

Each item remains `BLOCKED` until its non-secret evidence is attached to the R8
release record. A missing, stale, or ambiguous artifact fails closed.

| ID | Required evidence |
| --- | --- |
| P-01 | Registrar, current authoritative nameservers, registrar-lock state, and authorized operator are verified. |
| P-02 | Complete authoritative DNS inventory is captured by **owner/name, type, TTL, value/target, priority, and proxy eligibility**. |
| P-03 | Inventory includes apex, `www`, MX, SPF/TXT, every DKIM selector, DMARC, CAA, verification records, SRV, wildcard owners, and delegated subdomains/child-zone NS records. |
| P-04 | Cloudflare candidate zone is compared with the inventory and exact parity is proven; intentional differences are separately approved. |
| P-05 | DNSSEC state is proven at both current DNS provider and parent/registrar, including every published DS record. |
| P-06 | DNSSEC transition procedure and tested rollback are approved as described below. |
| P-07 | Actual Vercel production targets, domain verification, auth callback URLs, and last-known-good deployment are recorded without secrets. |
| P-08 | Origin `/api/health` returns HTTP 200 **and** parsed JSON states `gateway: "CONNECTED"` and `backend: "CONNECTED"`; HTTP status alone is insufficient. |
| P-09 | Cloudflare SSL/TLS mode is `Full (strict)` and the origin certificate chain/hostname validates before any record is proxied. |
| P-10 | Cloudflare Universal/Advanced edge certificate is active and covers every hostname selected for proxying before proxy activation. |
| P-11 | Pre-change and post-delegation probes, owners/types, resolvers, expected answers, TTL windows, responsible operator, and evidence locations are approved. |
| P-12 | Nameserver, DNSSEC/DS, record, proxy, and rules rollback procedures are approved with stop conditions and authorized operators. |

## DNSSEC/DS delegation gate and rollback

Before changing nameservers, query the current authoritative zone and the parent
zone from multiple independent resolvers and record whether the zone is signed,
the active DNSKEY/key tags, and all parent DS records. The operator must choose
and document the provider-supported transition sequence; guessing is prohibited.

If a DS exists at the parent, nameservers **must not** be changed until the
Cloudflare DNSSEC chain is valid using the exact DS values Cloudflare supplies,
or the old DS has been removed at the registrar and independent resolvers prove
the parent no longer publishes it. Merely disabling signing at the old provider
is not sufficient. The approved sequence must account for registrar and TTL
propagation and must be validated with DNSSEC-aware queries before delegation.

Stop immediately on `SERVFAIL`, bogus validation, DS/DNSKEY mismatch, or loss of
an inventoried answer. Roll back in this order, according to the pre-approved
transition path:

1. restore the previous registrar nameservers;
2. restore the previous parent DS set (or remove the newly introduced DS) so it
   matches the restored authoritative DNSKEY state;
3. keep the previous authoritative zone serving for at least the maximum
   delegation/DS TTL and prove the chain with multiple DNSSEC-validating
   resolvers;
4. do not retry until the mismatch and propagation evidence are understood.

## Proxy activation gate

Delegation and proxy activation are separate changes. All records begin
DNS-only. A hostname may become proxied only after P-09 and P-10 pass: Cloudflare
must show `Full (strict)`, the origin hostname and certificate chain must
validate, and an active edge certificate must cover that hostname. Recheck
Vercel verification, authentication callbacks, API behavior, and the parsed
health-body connectivity fields after each hostname is enabled. On certificate,
TLS, auth, or health failure, return that hostname to DNS-only before considering
any broader rollback.

## Health contract

Every pre-change and post-change health probe must save the HTTP status and parse
the JSON response. Passing requires all of the following:

```text
HTTP status = 200
body.gateway = CONNECTED
body.backend = CONNECTED
```

Invalid JSON, missing fields, any other connectivity value, or a non-200 status
is a failure. A successful TCP/TLS exchange or HTTP 200 by itself is not proof.

## Complete post-delegation validation

Validation is inventory-driven, not a hard-coded apex/`www` sample. For **every
row** in the approved P-02/P-03 inventory, query the exact owner and record type
against each assigned Cloudflare authoritative nameserver and at least two
independent recursive resolvers. Compare the complete answer set and delegation
behavior with the approved expected value after TTL expiry.

This includes all apex and subdomain A/AAAA/CNAME records, MX, SPF and other TXT,
every DKIM selector, DMARC, CAA, verification records, SRV, wildcard behavior,
and delegated child-zone NS/glue where applicable. Negative answers and wildcard
exceptions must also match the inventory. Any missing, extra, truncated, proxied
when ineligible, or otherwise divergent owner/type blocks completion and invokes
the applicable rollback.

## Canonical QAMap

Only these canonical IDs may be used in R8 evidence references:

- `E2E-01_CHAT`
- `E2E-02_AUTHORIZATION`
- `E2E-03_MEMORY`
- `E2E-04_AUDIT`

R8 remains `BLOCKED` after this plan is merged. Evidence collection closes
P-01 through P-12 one at a time; no DNS or Cloudflare action is implied.
