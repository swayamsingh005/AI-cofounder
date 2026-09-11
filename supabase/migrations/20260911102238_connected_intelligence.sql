-- V3 additive migration. Existing V2 records and policies are preserved.
create table public.connections (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id), provider text not null check(provider in ('github','posthog','stripe','notion')),
 display_name text not null, status text not null default 'disconnected' check(status in ('connected','disconnected','error','syncing')),
 connection_type text not null default 'public_read' check(connection_type in ('public_read','oauth','demo')),
 permissions jsonb not null default '["read"]', metadata jsonb not null default '{}', last_sync_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,provider), unique(company_id,id)
);
create table public.company_events (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id), source text not null, external_id text not null, event_type text not null,
 title text not null, description text, severity text not null default 'info', payload jsonb not null default '{}',
 occurred_at timestamptz not null default now(), processed boolean not null default false, created_at timestamptz not null default now(),
 unique(company_id,source,external_id), unique(company_id,id)
);
create table public.company_pulse_snapshots (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id), overall_score integer check(overall_score between 0 and 100),
 product_score integer check(product_score between 0 and 100), validation_score integer check(validation_score between 0 and 100),
 growth_score integer check(growth_score between 0 and 100), revenue_score integer check(revenue_score between 0 and 100),
 execution_score integer check(execution_score between 0 and 100), reasoning jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.company_insights (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id), dedupe_key text not null, type text not null, title text not null, description text not null,
 severity text not null default 'medium', confidence numeric check(confidence between 0 and 1), source_events jsonb not null default '[]',
 evidence jsonb not null default '[]', recommended_action text, status text not null default 'new' check(status in ('new','reviewed','investigating','resolved','dismissed')),
 created_at timestamptz not null default now(), resolved_at timestamptz, unique(company_id,dedupe_key), unique(company_id,id)
);
create table public.investigations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id), insight_id uuid, title text not null, question text not null,
 status text not null default 'queued' check(status in ('queued','running','completed','failed')), hypothesis text,
 evidence jsonb not null default '[]', confidence numeric check(confidence between 0 and 1), conclusion text, recommended_action text,
 created_at timestamptz not null default now(), completed_at timestamptz, unique(company_id,id),
 foreign key(company_id,insight_id) references public.company_insights(company_id,id)
);
create unique index one_active_investigation on public.investigations(company_id,insight_id) where status in ('queued','running','completed');
create table public.ai_actions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id), investigation_id uuid, task_id uuid references public.tasks(id) on delete set null,
 idempotency_key text not null, provider text not null default 'internal', action_type text not null, title text not null, description text,
 risk_level text not null default 'low' check(risk_level in ('low','medium','high','critical')),
 status text not null default 'awaiting_approval' check(status in ('draft','awaiting_approval','approved','executing','completed','failed','cancelled')),
 input_payload jsonb not null default '{}', output_payload jsonb not null default '{}', requires_approval boolean not null default true,
 approved_by uuid references auth.users(id), approved_at timestamptz, executed_at timestamptz, error_message text,
 created_at timestamptz not null default now(), unique(company_id,idempotency_key), unique(company_id,id),
 foreign key(company_id,investigation_id) references public.investigations(company_id,id)
);
create table public.automations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id), name text not null, description text, trigger_type text not null default 'manual',
 trigger_config jsonb not null default '{}', action_config jsonb not null default '{}', risk_level text not null default 'low',
 enabled boolean not null default false, last_run_at timestamptz, next_run_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,name), unique(company_id,id)
);
create table public.automation_runs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id), automation_id uuid not null, trigger_key text not null,
 status text not null, result jsonb not null default '{}', created_at timestamptz not null default now(), completed_at timestamptz,
 unique(automation_id,trigger_key), foreign key(company_id,automation_id) references public.automations(company_id,id)
);
create table public.connector_sync_logs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id), connection_id uuid not null, status text not null, event_count integer not null default 0,
 error_message text, created_at timestamptz not null default now(), completed_at timestamptz,
 foreign key(company_id,connection_id) references public.connections(company_id,id)
);
-- No credential column is exposed. OAuth credentials must live in a separate encrypted,
-- server-only vault when OAuth is implemented; metadata must contain no secrets.
do $$ declare t text; begin
 foreach t in array array['connections','company_events','company_pulse_snapshots','company_insights','investigations','ai_actions','automations','automation_runs','connector_sync_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select, insert, update, delete on public.%I to authenticated',t);
 execute format('create policy company_owner on public.%I for all to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.companies c where c.id = company_id and c.user_id = (select auth.uid()))) with check (user_id = (select auth.uid()) and exists (select 1 from public.companies c where c.id = company_id and c.user_id = (select auth.uid())))',t);
 execute format('create index on public.%I (company_id, created_at desc)',t);
 end loop;
end $$;
alter table public.memories drop constraint if exists memories_kind_check;
alter table public.memories add constraint memories_kind_check check(kind in ('fact','assumption','decision','learning','customer_insight','risk','strategy','experiment','event','customer_signal','execution_result'));
alter table public.memories add column assumption_status text check(assumption_status in ('unvalidated','testing','supported','rejected')) default 'unvalidated';
alter table public.memories add column evidence jsonb not null default '[]';

-- A single transaction locks each action and records its actual effects. Retries return
-- the original result; unsupported providers never execute. Invoker retains RLS.
create function public.execute_internal_action(p_action uuid, p_approve boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.ai_actions; result_id uuid; out_data jsonb; task_row public.tasks;
begin
 select * into a from public.ai_actions where id=p_action and user_id=auth.uid() for update;
 if not found then raise exception 'Action not found'; end if;
 if a.status='completed' then return a.output_payload; end if;
 if a.status not in ('awaiting_approval','approved') then raise exception 'Action is not executable'; end if;
 if a.provider <> 'internal' or a.risk_level <> 'low' or a.action_type not in ('create_task','create_mission','record_decision','update_memory','update_task') then raise exception 'Unsupported action: no work performed'; end if;
 if not p_approve then raise exception 'Explicit approval required'; end if;
 update public.ai_actions set status='executing',approved_by=auth.uid(),approved_at=now() where id=a.id;
 begin
 if length(trim(a.title))=0 or length(a.title)>200 then raise exception 'Invalid title'; end if;
 case a.action_type
 when 'create_task' then
 insert into public.tasks(company_id,user_id,title,description,status,priority,source) values(a.company_id,auth.uid(),a.title,a.description,'todo','medium','ai') returning id into result_id;
 when 'create_mission' then
 insert into public.missions(company_id,user_id,objective,why_it_matters,status,progress,is_primary) values(a.company_id,auth.uid(),a.title,a.description,'active',0,false) returning id into result_id;
 when 'record_decision' then
 insert into public.decisions(company_id,user_id,title,reasoning,status) values(a.company_id,auth.uid(),a.title,a.description,'active') returning id into result_id;
 when 'update_memory' then
 insert into public.memories(company_id,user_id,kind,title,content,source) values(a.company_id,auth.uid(),'learning',a.title,coalesce(a.description,a.title),'ai') returning id into result_id;
 when 'update_task' then
 select * into task_row from public.tasks where id=a.task_id and company_id=a.company_id and user_id=auth.uid() for update;
 if not found or (a.input_payload->>'status') is null or (a.input_payload->>'status') not in ('todo','in_progress','blocked','completed') then raise exception 'Invalid task or status'; end if;
 update public.tasks set status=a.input_payload->>'status',updated_at=now() where id=task_row.id returning id into result_id;
 update public.missions m set progress=(select coalesce(round(100.0*count(*) filter(where status='completed')/nullif(count(*),0)),0) from public.tasks where mission_id=m.id),updated_at=now() where m.id=task_row.mission_id and m.company_id=a.company_id;
 update public.goals g set progress=(select coalesce(round(100.0*count(*) filter(where status='completed')/nullif(count(*),0)),0) from public.tasks where goal_id=g.id),updated_at=now() where g.id=task_row.goal_id and g.company_id=a.company_id;
 end case;
 out_data=jsonb_build_object('record_id',result_id,'action_type',a.action_type,'message','Internal record saved. No external deployment or communication occurred.');
 insert into public.memories(company_id,user_id,kind,title,content,source) values(a.company_id,auth.uid(),'execution_result',a.title,'Executed '||a.action_type||'. Record: '||result_id||'. Business impact has not been measured.','ai');
 insert into public.activity_events(company_id,user_id,kind,title,detail) values(a.company_id,auth.uid(),'ai_execution',a.title,out_data::text);
 insert into public.company_events(company_id,user_id,source,external_id,event_type,title,payload) values(a.company_id,auth.uid(),'internal',a.id::text,'action_completed',a.title,out_data) on conflict do nothing;
 update public.ai_actions set status='completed',executed_at=now(),output_payload=out_data,error_message=null where id=a.id;
 return out_data;
 exception when others then
 update public.ai_actions set status='failed',error_message='Internal action failed; all effects were rolled back. Review the input and create a corrected action.' where id=a.id;
 return jsonb_build_object('error','Action failed. No partial work was saved.');
 end;
end $$;
revoke all on function public.execute_internal_action(uuid,boolean) from public,anon;
grant execute on function public.execute_internal_action(uuid,boolean) to authenticated;
