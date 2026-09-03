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
    'candidate_created', 'record_updated', 'validated', 'canonicalized',
    'superseded', 'revoked', 'expired', 'retrieved', 'write_rejected',
    'render_requested', 'scene_rendered', 'text_layer_rendered',
    'composite_rendered', 'render_qc_passed', 'render_qc_failed',
    'artifact_registered'
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
grant select, insert, update on lsuperagent.memory_records to service_role;
grant select, insert on lsuperagent.memory_audit_events to service_role;

-- Enforce the canonical lifecycle at the database boundary. Physical deletes are
-- forbidden, new records always begin as candidates, validated/canonical payloads
-- are immutable, and every status transition must carry a policy decision.
create or replace function lsuperagent.enforce_memory_record_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'memory records are lifecycle-managed and cannot be deleted';
  end if;

  if TG_OP = 'INSERT' then
    if NEW.status <> 'candidate' then
      raise exception 'new memory records must start as candidate';
    end if;
    NEW.updated_at := pg_catalog.now();
    return NEW;
  end if;

  if OLD.status in ('superseded', 'revoked', 'expired') then
    raise exception 'terminal memory records are immutable';
  end if;

  if NEW.memory_id is distinct from OLD.memory_id
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'memory identity and created_at are immutable';
  end if;

  if OLD.status in ('verified', 'canonical') and (
       NEW.namespace is distinct from OLD.namespace
       or NEW.memory_class is distinct from OLD.memory_class
       or NEW.subject_id is distinct from OLD.subject_id
       or NEW.content is distinct from OLD.content
       or NEW.source_refs is distinct from OLD.source_refs
       or NEW.evidence_level is distinct from OLD.evidence_level
       or NEW.owner_kind is distinct from OLD.owner_kind
       or NEW.owner_ref is distinct from OLD.owner_ref
       or NEW.integrity_hash is distinct from OLD.integrity_hash
       or NEW.valid_from is distinct from OLD.valid_from
       or NEW.supersedes is distinct from OLD.supersedes
     ) then
    raise exception 'verified and canonical payloads are immutable; create a new candidate instead';
  end if;

  if NEW.status is distinct from OLD.status and NEW.policy_decision_id is null then
    raise exception 'memory status transitions require policy_decision_id';
  end if;

  if not (
    (OLD.status = 'candidate' and NEW.status in ('candidate', 'verified', 'revoked', 'expired'))
    or (OLD.status = 'verified' and NEW.status in ('verified', 'canonical', 'revoked', 'expired'))
    or (OLD.status = 'canonical' and NEW.status in ('canonical', 'superseded', 'revoked', 'expired'))
  ) then
    raise exception 'invalid memory status transition: % -> %', OLD.status, NEW.status;
  end if;

  NEW.updated_at := pg_catalog.now();
  return NEW;
end;
$$;
revoke all on function lsuperagent.enforce_memory_record_lifecycle() from public, anon, authenticated;

drop trigger if exists memory_records_lifecycle_guard on lsuperagent.memory_records;
create trigger memory_records_lifecycle_guard
before insert or update or delete on lsuperagent.memory_records
for each row execute function lsuperagent.enforce_memory_record_lifecycle();

-- Append an audit event in the same transaction as every accepted insert/update.
-- This prevents a service-side writer from mutating canonical lifecycle state
-- without leaving durable evidence.
create or replace function lsuperagent.audit_memory_record_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  audit_action text;
begin
  if TG_OP = 'INSERT' then
    audit_action := 'candidate_created';
  elsif NEW.status is distinct from OLD.status then
    audit_action := case NEW.status
      when 'verified' then 'validated'
      when 'canonical' then 'canonicalized'
      when 'superseded' then 'superseded'
      when 'revoked' then 'revoked'
      when 'expired' then 'expired'
      else 'record_updated'
    end;
  else
    audit_action := 'record_updated';
  end if;

  insert into lsuperagent.memory_audit_events (
    memory_id,
    action,
    actor_kind,
    actor_ref,
    policy_decision_id,
    evidence_refs,
    event_data
  ) values (
    NEW.memory_id,
    audit_action,
    'service',
    current_user,
    NEW.policy_decision_id,
    NEW.source_refs,
    pg_catalog.jsonb_build_object(
      'from_status', case when TG_OP = 'UPDATE' then OLD.status else null end,
      'to_status', NEW.status,
      'integrity_hash', NEW.integrity_hash,
      'updated_at', NEW.updated_at
    )
  );

  return NEW;
end;
$$;
revoke all on function lsuperagent.audit_memory_record_change() from public, anon, authenticated;

drop trigger if exists memory_records_audit_append on lsuperagent.memory_records;
create trigger memory_records_audit_append
after insert or update on lsuperagent.memory_records
for each row execute function lsuperagent.audit_memory_record_change();

-- Prevent silent alteration of evidence history. Audit corrections must be new
-- events; existing audit rows can never be updated or deleted.
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
revoke all on function lsuperagent.reject_audit_event_mutation() from public, anon, authenticated;

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
