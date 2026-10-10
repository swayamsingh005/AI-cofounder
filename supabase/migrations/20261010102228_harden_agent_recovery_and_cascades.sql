-- Preserve deployed migration history; harden the existing transaction boundary.
do $migration$
declare definition text; fk record;
begin
  definition := pg_get_functiondef('public.agent_workflow(uuid,uuid,uuid,text,jsonb)'::regprocedure);
  definition := replace(definition, ')) for update loop', ')) for update skip locked loop');
  execute definition;

  -- These are the foreign keys introduced by the agent execution foundation.
  for fk in
    select conrelid::regclass as child_table, conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where contype = 'f'
      and (conrelid = 'public.agent_runs'::regclass
        or confrelid = 'public.agent_runs'::regclass
        or (conrelid = 'public.memories'::regclass and conname = 'memories_company_id_source_action_id_fkey'))
  loop
    execute format('alter table %s drop constraint %I', fk.child_table, fk.conname);
    execute format('alter table %s add constraint %I %s on delete cascade', fk.child_table, fk.conname, fk.definition);
  end loop;

  -- Allow dependent audit rows to be removed only after their company is deleted.
  -- Direct deletion while the company exists is still blocked for browser clients.
  definition := pg_get_functiondef('public.guard_agent_records()'::regprocedure);
  definition := replace(definition, E'begin\n', E'begin\n if tg_op=''DELETE'' and not exists(select 1 from public.companies where id=old.company_id) then return old; end if;\n');
  execute definition;
end
$migration$;
