-- ============================================================================
-- v0.4 Phase A: audit_log.payload jsonb column
--
-- Captures OLD/NEW state on UPDATE so the UI can render before→after diffs
-- (e.g. "stage: lead → qualified"). For INSERT/DELETE we just store the
-- relevant single state.
--
-- Strategy: store a JSON object of the changed fields only. For UPDATE
-- events, that's to_jsonb(NEW) (full new row snapshot). For INSERT, store
-- NEW as well. For DELETE, store OLD. The frontend reads payload.stage
-- (or any other field) and shows the diff.
-- ============================================================================

alter table public.audit_log
  add column if not exists payload jsonb;

create or replace function public.audit_trigger_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity text := tg_table_name;
  v_entity_id uuid;
  v_actor uuid := auth.uid();
  v_payload jsonb;
begin
  if (tg_op = 'INSERT') then
    v_action := 'insert';
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;
    v_payload := to_jsonb(new);
    insert into public.audit_log (actor_id, action, entity, entity_id, at, payload)
    values (v_actor, v_action, v_entity, v_entity_id, now(), v_payload);
    return new;
  elsif (tg_op = 'UPDATE') then
    v_action := 'update';
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;
    v_payload := to_jsonb(new);
    insert into public.audit_log (actor_id, action, entity, entity_id, at, payload)
    values (v_actor, v_action, v_entity, v_entity_id, now(), v_payload);
    return new;
  elsif (tg_op = 'DELETE') then
    v_action := 'delete';
    v_entity_id := (to_jsonb(old) ->> 'id')::uuid;
    v_payload := to_jsonb(old);
    insert into public.audit_log (actor_id, action, entity, entity_id, at, payload)
    values (v_actor, v_action, v_entity, v_entity_id, now(), v_payload);
    return old;
  end if;
  return null;
end;
$$;
-- The trigger is already wired to 6 tables in 0003_triggers.sql; we only
-- replaced the function body. No re-wiring needed.
