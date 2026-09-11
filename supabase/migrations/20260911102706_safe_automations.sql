-- Only an owner-enabled, low-risk internal task automation is currently supported.
-- It runs on explicit refresh/sync, not an imaginary background scheduler.
create function public.run_insight_automation(p_company uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare auto public.automations; ins public.company_insights; run_id uuid; action_id uuid; outcome jsonb; executed integer := 0;
begin
 select * into auto from public.automations where company_id=p_company and user_id=auth.uid() and name='Create follow-up tasks from insights' and enabled=true for update;
 if not found then return 0; end if;
 if auto.risk_level <> 'low' or auto.action_config->>'type' <> 'create_task' then raise exception 'Unsupported automation'; end if;
 for ins in select * from public.company_insights where company_id=p_company and user_id=auth.uid() and status='new' order by created_at limit 20 loop
  run_id := null;
  insert into public.automation_runs(company_id,user_id,automation_id,trigger_key,status) values(p_company,auth.uid(),auto.id,ins.id::text,'running') on conflict do nothing returning id into run_id;
  if run_id is null then continue; end if;
  insert into public.ai_actions(company_id,user_id,idempotency_key,action_type,title,description,requires_approval) values(p_company,auth.uid(),'insight-task:'||ins.id,'create_task',left(coalesce(ins.recommended_action,ins.title),200),'Follow up insight '||ins.id||'. '||ins.description,true) on conflict(company_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into action_id;
  outcome := public.execute_internal_action(action_id,true);
  update public.automation_runs set status=case when outcome ? 'error' then 'failed' else 'completed' end,result=outcome,completed_at=now() where id=run_id;
  if not (outcome ? 'error') then executed := executed+1; end if;
 end loop;
 update public.automations set last_run_at=now(),updated_at=now() where id=auto.id;
 return executed;
end $$;
revoke all on function public.run_insight_automation(uuid) from public,anon;
grant execute on function public.run_insight_automation(uuid) to authenticated;
