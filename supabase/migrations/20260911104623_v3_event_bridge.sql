create function public.configure_public_github(p_company uuid,p_repository text) returns void
language plpgsql security invoker set search_path='' as $$
declare c public.connections;
begin
 if not exists(select 1 from public.companies where id=p_company and user_id=auth.uid()) then raise exception 'Company not found'; end if;
 if p_repository !~ '^[a-zA-Z0-9-]{1,39}/[a-zA-Z0-9_.-]{1,100}$' or position('..' in p_repository)>0 then raise exception 'Invalid repository'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text,0));
 select * into c from public.connections where company_id=p_company and provider='github' for update;
 if found and c.status='syncing' and c.updated_at>now()-interval '5 minutes' then raise exception 'Sync in progress. Wait before changing repositories.'; end if;
 insert into public.connections(company_id,user_id,provider,display_name,status,connection_type,permissions,metadata) values(p_company,auth.uid(),'github',p_repository,'error','public_read','["read"]',jsonb_build_object('repository',p_repository))
 on conflict(company_id,provider) do update set display_name=p_repository,status='error',metadata=excluded.metadata,last_sync_at=null,updated_at=now();
end $$;
revoke all on function public.configure_public_github(uuid,text) from public,anon;
grant execute on function public.configure_public_github(uuid,text) to authenticated;

-- Existing V2 changes enter the same event stream, transactionally with the source row.
create function public.capture_company_change() returns trigger
language plpgsql security invoker set search_path='' as $$
declare event_kind text; note text;
begin
 if auth.uid() is null then return new; end if;
 if tg_table_name='tasks' then
   if new.status <> 'completed' or old.status='completed' then return new; end if;
   event_kind:='task_completed'; note:='Task marked complete by the founder. Business impact is not yet measured.';
 elsif tg_table_name='decisions' then
   event_kind:='decision_created'; note:=coalesce(new.reasoning,'Decision recorded without reasoning.');
 elsif tg_table_name='memories' then
   if new.kind <> 'customer_signal' then return new; end if;
   event_kind:='customer_signal'; note:=new.content;
 end if;
 insert into public.company_events(company_id,user_id,source,external_id,event_type,title,description,payload)
 values(new.company_id,new.user_id,'internal',event_kind||':'||new.id||':'||clock_timestamp(),event_kind,new.title,left(note,2000),jsonb_build_object('record_id',new.id));
 if tg_table_name<>'memories' then
 insert into public.memories(company_id,user_id,kind,title,content,source) values(new.company_id,new.user_id,case when tg_table_name='decisions' then 'decision' else 'learning' end,new.title,left(note,2000),'ai');
 end if;
 return new;
end $$;
create trigger v3_task_completed after update of status on public.tasks for each row execute function public.capture_company_change();
create trigger v3_decision_created after insert on public.decisions for each row execute function public.capture_company_change();
create trigger v3_customer_signal after insert on public.memories for each row execute function public.capture_company_change();
revoke all on function public.capture_company_change() from public,anon;
