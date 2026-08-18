begin;

-- Canonical operational memory lives in a private schema. It is intentionally
-- not exposed through the Data API; approved server-side runtime code is the
-- only writer and all direct client access is denied.
create schema if not exists lsuperagent;
revoke all on schema lsuperagent from public, anon, authenticated;
grant usage on schema lsuperagent to service_role;

create table if not exists lsuperagent.memory_records (
  memory_id uuid primary key default gen_random_uuid(),
  namespace text not null check (namespace in ('constitution', 'identity', 'project', 'user', 'run', 'audit')),
  memory_class text not null check (memory_class in (
    'constitution', 'identity', 'user_preference', 'verified_fact',
    'work_state', 'artifact', 'operational_lesson', 'session_note'
  )),
  status text not null default 'candidate' check (status in (
    'candidate', 'verified', 'canonical', 'superseded', 'revoked', 'expired'
  )),
  subject_id uuid,
  content jsonb not null,
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  evidence_level text not null check (evidence_level in (
    'user_confirmed', 'validator_verified', 'sourced', 'inferred'
  )),
  owner_kind text not null check (owner_kind in ('human', 'service', 'agent')),
  owner_ref text not null,
  policy_decision_id text,
  integrity_hash text not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  supersedes uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_validity_window check (valid_until is null or valid_until >= valid_from)
);

create index if not exists memory_records_namespace_class_status_idx
  on lsuperagent.memory_records (namespace, memory_class, status);
create index if not exists memory_records_subject_status_idx
  on lsuperagent.memory_records (subject_id, status)
  where subject_id is not null;
create index if not exists memory_records_valid_until_idx
  on lsuperagent.memory_records (valid_until)
  where valid_until is not null;

create table if not exists lsuperagent.memory_audit_events (
  event_id uuid primary key default gen_random_uuid(),
  memory_id uuid references lsuperagent.memory_records(memory_id) on delete restrict,
  action text not null check (action in (
    'candidate_created', 'validated', 'canonicalized', 'superseded',
    'revoked', 'expired', 'retrieved', 'write_rejected'
  )),
  actor_kind text not null check (actor_kind in ('human', 'service', 'agent', 'policy_engine')),
  actor_ref text not null,
  policy_decision_id text,
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists memory_audit_events_memory_created_idx
  on lsuperagent.memory_audit_events (memory_id, created_at desc);
create index if not exists memory_audit_events_action_created_idx
  on lsuperagent.memory_audit_events (action, created_at desc);

-- Defense in depth: neither table is available to anon/authenticated users.
alter table lsuperagent.memory_records enable row level security;
alter table lsuperagent.memory_audit_events enable row level security;
revoke all on lsuperagent.memory_records from public, anon, authenticated;
revoke all on lsuperagent.memory_audit_events from public, anon, authenticated;
grant select, insert, update, delete on lsuperagent.memory_records to service_role;
grant select, insert on lsuperagent.memory_audit_events to service_role;

-- Prevent silent alteration of evidence history. The runtime may append events,
-- but an audit correction must be represented by a new event instead.
create or replace function lsuperagent.reject_audit_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'memory audit events are append-only';
end;
$$;

drop trigger if exists memory_audit_events_append_only on lsuperagent.memory_audit_events;
create trigger memory_audit_events_append_only
before update or delete on lsuperagent.memory_audit_events
for each row execute function lsuperagent.reject_audit_event_mutation();

comment on schema lsuperagent is
  'Private LSUPERAGENT canonical runtime schema; no direct Data API exposure.';
comment on table lsuperagent.memory_records is
  'Validated canonical memory and quarantine candidates. Never store raw secrets.';
comment on table lsuperagent.memory_audit_events is
  'Append-only audit history for memory lifecycle decisions.';

-- Existing auto-RLS event-trigger function does not need REST/RPC callers.
-- Revoking direct execution clears the current external security warning while
-- preserving its use by the database event trigger.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;
