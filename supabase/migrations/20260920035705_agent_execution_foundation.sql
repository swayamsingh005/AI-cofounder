-- Additive: reuse ai_actions, missions, tasks, memories and activity_events.
alter table public.missions add constraint missions_company_id_id_key unique(company_id,id);
alter table public.tasks add constraint tasks_company_id_id_key unique(company_id,id);
create table public.agent_runs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 user_id uuid not null references auth.users(id), request_key uuid not null, step_index integer not null check(step_index between 0 and 2),
 agent_id text not null check(agent_id in ('coding','research','marketing')), objective text not null check(length(objective) between 1 and 500),
 founder_goal text not null, mission_id uuid not null, task_id uuid not null,
 action_type text not null check(action_type in ('analyze_context','analyze_github_issues')),
 depends_on integer[] not null default '{}', status text not null default 'queued'
 check(status in ('queued','running','waiting_approval','completed','failed','cancelled')),
 output jsonb, error_message text, usage jsonb not null default '{}',
 started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(),
 unique(company_id,request_key,step_index), unique(company_id,id),
 foreign key(company_id,mission_id) references public.missions(company_id,id),
 foreign key(company_id,task_id) references public.tasks(company_id,id)
);
create index agent_runs_company_created on public.agent_runs(company_id,created_at desc);
alter table public.agent_runs enable row level security;
revoke all on public.agent_runs from public,anon,authenticated;
grant select on public.agent_runs to authenticated;
grant all on public.agent_runs to service_role;
create policy agent_runs_owner on public.agent_runs for select to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())));

alter table public.ai_actions add column agent_run_id uuid;
alter table public.ai_actions add column agent_id text;
alter table public.ai_actions add column permission_level text not null default 'APPROVAL_REQUIRED'
 check(permission_level in ('AUTO','APPROVAL_REQUIRED','RESTRICTED'));
alter table public.ai_actions add foreign key(company_id,agent_run_id) references public.agent_runs(company_id,id);
alter table public.memories add column source_agent text;
alter table public.memories add column source_run_id uuid;
alter table public.memories add column source_action_id uuid;
alter table public.memories add foreign key(company_id,source_run_id) references public.agent_runs(company_id,id);
alter table public.memories add foreign key(company_id,source_action_id) references public.ai_actions(company_id,id);
alter table public.activity_events add column agent_run_id uuid;
alter table public.activity_events add foreign key(company_id,agent_run_id) references public.agent_runs(company_id,id);

-- Browser clients cannot impersonate agents or fabricate their audit records.
create function public.guard_agent_records() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then
   if tg_op='DELETE' then return old; end if; return new;
 end if;
 if tg_table_name='ai_actions' then
   if tg_op='INSERT' and (new.agent_run_id is not null or new.agent_id is not null or new.permission_level<>'APPROVAL_REQUIRED') then raise exception 'Agent records are server managed'; end if;
   if tg_op='UPDATE' and (old.agent_run_id is not null or new.agent_run_id is not null or new.agent_id is not null or new.permission_level<>old.permission_level) then
     if old.agent_run_id is null or old.status<>'awaiting_approval' or new.status not in ('awaiting_approval','cancelled')
       or (to_jsonb(new)-array['title','description','status'])<>(to_jsonb(old)-array['title','description','status'])
       or length(new.title) not between 1 and 200 or length(coalesce(new.description,''))>3000
     then raise exception 'Only pending action edits or rejection are permitted'; end if;
   end if;
   if tg_op='DELETE' and old.agent_run_id is not null then raise exception 'Agent audit records cannot be deleted'; end if;
 elsif tg_table_name='memories' then
   if (tg_op<>'DELETE' and (new.source_run_id is not null or new.source_agent is not null or new.source_action_id is not null)) or (tg_op<>'INSERT' and old.source_run_id is not null) then raise exception 'Agent memory provenance is server managed'; end if;
 elsif tg_table_name='activity_events' then
   if (tg_op<>'DELETE' and new.agent_run_id is not null) or (tg_op<>'INSERT' and old.agent_run_id is not null) then raise exception 'Agent activity is append only'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger guard_agent_actions before insert or update or delete on public.ai_actions for each row execute function public.guard_agent_records();
create trigger guard_agent_memories before insert or update or delete on public.memories for each row execute function public.guard_agent_records();
create trigger guard_agent_activity before insert or update or delete on public.activity_events for each row execute function public.guard_agent_records();
revoke all on function public.guard_agent_records() from public,anon,authenticated;

-- The service endpoint authenticates the founder before calling this transaction boundary.
-- No LLM has a database client or the service credential.
create function public.agent_workflow(p_company uuid,p_user uuid,p_key uuid,p_op text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare mid uuid; tid uuid; rid uuid; aid uuid; item jsonb; idx integer:=0; r public.agent_runs;
 out_data jsonb; pending integer; next_status text;
begin
 if not exists(select 1 from public.companies where id=p_company and user_id=p_user) then raise exception 'Company not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text,23));
 if p_op='start' then
   if exists(select 1 from public.agent_runs where company_id=p_company and request_key=p_key) then
     if exists(select 1 from public.agent_runs where company_id=p_company and request_key=p_key and founder_goal<>p_data->>'goal') then raise exception 'Request key already used for another goal'; end if;
   else
     if exists(select 1 from public.agent_runs where company_id=p_company and status in ('queued','running')) then raise exception 'An agent workflow is already active. Refresh its status first.'; end if;
     if (select count(distinct request_key) from public.agent_runs where company_id=p_company and created_at>now()-interval '1 hour')>=20 then raise exception 'Hourly workflow limit reached'; end if;
     if jsonb_typeof(p_data->'steps')<>'array' or jsonb_array_length(p_data->'steps') not between 1 and 3 or length(p_data->>'goal') not between 1 and 500 then raise exception 'Invalid bounded plan'; end if;
     insert into public.missions(company_id,user_id,objective,why_it_matters,is_primary)
       values(p_company,p_user,left(p_data->>'goal',200),'Bounded agent analysis and drafts; no external execution.',false) returning id into mid;
     for item in select value from jsonb_array_elements(p_data->'steps') loop
       if exists(select 1 from public.agent_runs where company_id=p_company and request_key=p_key and agent_id=item->>'agentId') then raise exception 'Repeated agent'; end if;
       if item->>'actionType'='analyze_github_issues' and item->>'agentId'<>'coding' then raise exception 'Agent permission denied'; end if;
       if exists(select 1 from jsonb_array_elements_text(item->'dependsOn') d where d.value::integer<0 or d.value::integer>=idx) then raise exception 'Invalid dependency'; end if;
       insert into public.tasks(company_id,user_id,mission_id,title,description,status,source)
         values(p_company,p_user,mid,left((item->>'agentId')||': '||(item->>'objective'),200),item->>'objective','todo','ai') returning id into tid;
       insert into public.agent_runs(company_id,user_id,request_key,step_index,agent_id,objective,founder_goal,mission_id,task_id,action_type,depends_on)
         values(p_company,p_user,p_key,idx,item->>'agentId',item->>'objective',p_data->>'goal',mid,tid,item->>'actionType',array(select value::integer from jsonb_array_elements_text(item->'dependsOn'))) returning id into rid;
       insert into public.activity_events(company_id,user_id,kind,title,detail,agent_run_id)
         values(p_company,p_user,'agent_queued',(item->>'agentId')||' agent queued',item->>'objective',rid);
       idx:=idx+1;
     end loop;
   end if;
 elsif p_op='claim' then
   select * into r from public.agent_runs where company_id=p_company and request_key=p_key and id=(p_data->>'runId')::uuid for update;
   if not found or r.status<>'queued' then return 'null'; end if;
   if exists(select 1 from public.agent_runs d where d.company_id=p_company and d.request_key=p_key and d.step_index=any(r.depends_on) and (d.output is null or d.status not in ('completed','waiting_approval'))) then raise exception 'Dependency output is not ready'; end if;
   update public.agent_runs set status='running',started_at=now() where id=r.id;
   update public.tasks set status='in_progress',updated_at=now() where id=r.task_id and company_id=p_company;
   insert into public.ai_actions(company_id,user_id,idempotency_key,agent_run_id,agent_id,provider,action_type,title,description,status,requires_approval,permission_level)
     values(p_company,p_user,'agent:'||r.id||':analysis',r.id,r.agent_id,case when r.action_type='analyze_github_issues' then 'github' else 'internal' end,r.action_type,left(r.objective,200),'Analysis of saved company records only.','executing',false,'AUTO');
   insert into public.activity_events(company_id,user_id,kind,title,agent_run_id) values(p_company,p_user,'agent_started',r.agent_id||' agent started',r.id);
   return to_jsonb(r);
 elsif p_op='finish' then
   select * into r from public.agent_runs where company_id=p_company and request_key=p_key and id=(p_data->>'runId')::uuid for update;
   if not found or r.status<>'running' then raise exception 'Run is not executing'; end if;
   out_data:=p_data->'output';
   if jsonb_typeof(out_data)<>'object' or length(out_data->>'summary') not between 1 and 2500 or jsonb_typeof(out_data->'actions')<>'array' or jsonb_array_length(out_data->'actions')>2 then raise exception 'Invalid output'; end if;
   update public.ai_actions set status='completed',executed_at=now(),output_payload=out_data
     where agent_run_id=r.id and permission_level='AUTO' returning id into aid;
   insert into public.memories(company_id,user_id,kind,title,content,source,source_agent,source_run_id,source_action_id,evidence)
     values(p_company,p_user,'execution_result',left(r.objective,200),'AI analysis of saved evidence; not independent verification. '||(out_data->>'summary'),'ai',r.agent_id,r.id,aid,coalesce(out_data->'findings','[]'));
   for item in select value from jsonb_array_elements(out_data->'actions') loop
     if item->>'actionType'<>'create_task' or length(item->'parameters'->>'title') not between 1 and 200 then raise exception 'Unsupported agent action'; end if;
     insert into public.ai_actions(company_id,user_id,idempotency_key,agent_run_id,agent_id,provider,action_type,title,description,input_payload,status,requires_approval,permission_level)
       values(p_company,p_user,'agent:'||r.id||':task:'||idx,r.id,r.agent_id,'internal','create_task',item->'parameters'->>'title',left((item->>'reason')||E'\n'||(item->'parameters'->>'description'),3000),jsonb_build_object('mission_id',r.mission_id),'awaiting_approval',true,'APPROVAL_REQUIRED');
     idx:=idx+1;
   end loop;
   update public.agent_runs set output=out_data,status=case when idx>0 then 'waiting_approval' else 'completed' end,usage=p_data->'usage',completed_at=case when idx=0 then now() else null end where id=r.id;
   update public.tasks set status='completed',updated_at=now() where id=r.task_id and company_id=p_company;
   insert into public.activity_events(company_id,user_id,kind,title,detail,agent_run_id)
     values(p_company,p_user,'agent_result',r.agent_id||' agent finished analysis',case when idx>0 then 'Draft tasks are awaiting founder approval. ' else '' end||(out_data->>'summary'),r.id);
 elsif p_op in ('fail','recover') then
   for r in select * from public.agent_runs where company_id=p_company and
     ((p_op='fail' and request_key=p_key and status in ('queued','running')) or
      (p_op='recover' and status in ('queued','running') and created_at<now()-interval '2 minutes')) for update loop
     update public.agent_runs set status=case when r.status='queued' then 'cancelled' else 'failed' end,
       error_message=case when p_op='recover' then 'Request interrupted or timed out. Start a new workflow to retry.' else left(coalesce(p_data->>'error','Agent failed.'),500) end,completed_at=now() where id=r.id;
     update public.ai_actions set status='failed',error_message='Agent failed; no output was saved.',executed_at=now() where agent_run_id=r.id and status='executing';
     update public.tasks set status='blocked',updated_at=now() where id=r.task_id and company_id=p_company;
     insert into public.activity_events(company_id,user_id,kind,title,detail,agent_run_id)
       values(p_company,p_user,'agent_failed',r.agent_id||' agent stopped','Failed or cancelled. No external changes occurred.',r.id);
   end loop;
 else raise exception 'Unknown workflow operation';
 end if;
 for mid in select distinct mission_id from public.agent_runs where company_id=p_company and request_key=p_key loop
   update public.missions m set progress=(select round(100.0*count(*) filter(where status='completed')/greatest(count(*),1)) from public.tasks where mission_id=m.id),
     status=case when not exists(select 1 from public.agent_runs where mission_id=m.id and status<>'completed') then 'completed' else 'active' end,updated_at=now() where m.id=mid;
 end loop;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.step_index),'[]') from public.agent_runs x where company_id=p_company and request_key=p_key);
end $$;
revoke all on function public.agent_workflow(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.agent_workflow(uuid,uuid,uuid,text,jsonb) to service_role;

-- Preserve the existing executor and approval interface. The wrapper checks provenance
-- and policy before entering the original row-locked, idempotent transaction.
alter function public.execute_internal_action(uuid,boolean) rename to execute_internal_action_v2;
revoke all on function public.execute_internal_action_v2(uuid,boolean) from public,anon,authenticated;
create function public.execute_internal_action(p_action uuid,p_approve boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.ai_actions; r public.agent_runs; result jsonb;
begin
 select * into a from public.ai_actions where id=p_action and user_id=auth.uid() for update;
 if not found or not exists(select 1 from public.companies where id=a.company_id and user_id=auth.uid()) then raise exception 'Action not found'; end if;
 if a.permission_level='RESTRICTED' then raise exception 'Restricted action'; end if;
 if a.agent_run_id is not null then
   select * into r from public.agent_runs where id=a.agent_run_id and company_id=a.company_id and user_id=auth.uid();
   if not found or r.agent_id<>a.agent_id or a.action_type<>'create_task' or a.provider<>'internal' or a.permission_level<>'APPROVAL_REQUIRED' or not a.requires_approval then raise exception 'Agent permission denied'; end if;
 end if;
 result:=public.execute_internal_action_v2(p_action,p_approve);
 if a.agent_run_id is not null and not (result ? 'error') then
   update public.tasks set mission_id=r.mission_id where id=(result->>'record_id')::uuid and company_id=a.company_id;
   update public.missions set status='active',progress=(select round(100.0*count(*) filter(where status='completed')/greatest(count(*),1)) from public.tasks where mission_id=r.mission_id) where id=r.mission_id;
 end if;
 return result;
end $$;
revoke all on function public.execute_internal_action(uuid,boolean) from public,anon;
grant execute on function public.execute_internal_action(uuid,boolean) to authenticated;

create function public.settle_agent_approval() returns trigger language plpgsql security definer set search_path='' as $$
declare state text;
begin
 if new.agent_run_id is null or new.permission_level<>'APPROVAL_REQUIRED' or new.status not in ('completed','cancelled','failed') then return new; end if;
 if exists(select 1 from public.ai_actions where agent_run_id=new.agent_run_id and permission_level='APPROVAL_REQUIRED' and status not in ('completed','cancelled','failed')) then return new; end if;
 state:=case when exists(select 1 from public.ai_actions where agent_run_id=new.agent_run_id and status='failed') then 'failed'
   when exists(select 1 from public.ai_actions where agent_run_id=new.agent_run_id and status='cancelled') then 'cancelled' else 'completed' end;
 update public.agent_runs set status=state,completed_at=now() where id=new.agent_run_id;
 insert into public.activity_events(company_id,user_id,kind,title,agent_run_id)
 values(new.company_id,new.user_id,'agent_approval',new.agent_id||' agent approvals resolved: '||state,new.agent_run_id);
 return new;
end $$;
create trigger settle_agent_approval after update of status on public.ai_actions for each row when(old.status is distinct from new.status) execute function public.settle_agent_approval();
revoke all on function public.settle_agent_approval() from public,anon,authenticated;

;
