-- Existing decision authorship cannot be reliably reconstructed. Leave it unknown.
alter table public.decisions add column source text check (source in ('user','ai'));
alter table public.decisions alter column source set default 'user';

-- Approved AI suggestions retain AI authorship even though a founder approves them.
do $migration$
declare definition text;
begin
 definition := pg_get_functiondef('public.execute_internal_action_v2(uuid,boolean)'::regprocedure);
 definition := replace(definition,
  'insert into public.decisions(company_id,user_id,title,reasoning,status) values(a.company_id,auth.uid(),a.title,a.description,''active'')',
  'insert into public.decisions(company_id,user_id,title,reasoning,status,source) values(a.company_id,auth.uid(),a.title,a.description,''active'',''ai'')');
 execute definition;
end
$migration$;

create or replace function public.capture_company_change() returns trigger
language plpgsql security invoker set search_path='' as $$
declare event_kind text; note text; author_source text := 'user';
begin
 if auth.uid() is null then return new; end if;
 if tg_table_name='tasks' then
   if new.status <> 'completed' or old.status='completed' then return new; end if;
   event_kind:='task_completed'; note:='Task marked complete. Business impact is not yet measured.';
 elsif tg_table_name='decisions' then
   event_kind:='decision_created'; note:=coalesce(new.reasoning,'Decision recorded without reasoning.');
   author_source:=new.source;
 elsif tg_table_name='memories' then
   if new.kind <> 'customer_signal' then return new; end if;
   event_kind:='customer_signal'; note:=new.content; author_source:=new.source;
 end if;
 insert into public.company_events(company_id,user_id,source,external_id,event_type,title,description,payload)
 values(new.company_id,new.user_id,'internal',event_kind||':'||new.id||':'||clock_timestamp(),event_kind,new.title,left(note,2000),jsonb_build_object('record_id',new.id,'author',author_source));
 if tg_table_name<>'memories' and author_source is not null then
   insert into public.memories(company_id,user_id,kind,title,content,source)
   values(new.company_id,new.user_id,case when tg_table_name='decisions' then 'decision' else 'learning' end,new.title,left(note,2000),author_source);
 end if;
 return new;
end $$;
