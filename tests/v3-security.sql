-- Run against the project as an administrative SQL test. All fixture changes roll back.
begin;
select set_config('test.owner',(select user_id::text from public.companies limit 1),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
set local role authenticated;
with c as (insert into public.companies(user_id,name,stage) values(auth.uid(),'V3 rollback-only security test','validation') returning id) select set_config('test.company',id::text,true) from c;
do $$
declare cid uuid:=current_setting('test.company')::uuid; aid uuid; out1 jsonb; out2 jsonb; total integer; blocked boolean:=false;
begin
 insert into public.ai_actions(company_id,user_id,idempotency_key,action_type,title) values(cid,auth.uid(),'retry-test','create_task','Approval retry test') returning id into aid;
 begin perform public.execute_internal_action(aid,false); exception when others then blocked:=true; end;
 if not blocked then raise exception 'FAIL: action executed without approval'; end if;
 out1:=public.execute_internal_action(aid,true);out2:=public.execute_internal_action(aid,true);
 if out1<>out2 or out1 ? 'error' then raise exception 'FAIL: idempotent execution'; end if;
 select count(*) into total from public.tasks where company_id=cid and title='Approval retry test';
 if total<>1 then raise exception 'FAIL: duplicate task'; end if;
 insert into public.ai_actions(company_id,user_id,idempotency_key,provider,action_type,title,risk_level) values(cid,auth.uid(),'unsafe','github','deploy','Must never deploy','high') returning id into aid;
 blocked:=false;
 begin perform public.execute_internal_action(aid,true); exception when others then blocked:=true; end;
 if not blocked then raise exception 'FAIL: unsupported external action executed'; end if;
 insert into public.company_events(company_id,user_id,source,external_id,event_type,title) values(cid,auth.uid(),'github','same','issue_opened','Test') on conflict do nothing;
 insert into public.company_events(company_id,user_id,source,external_id,event_type,title) values(cid,auth.uid(),'github','same','issue_opened','Test') on conflict do nothing;
 select count(*) into total from public.company_events where company_id=cid and external_id='same';
 if total<>1 then raise exception 'FAIL: duplicate event'; end if;
 insert into public.company_insights(company_id,user_id,dedupe_key,type,title,description) values(cid,auth.uid(),'test','execution','Test insight','Recorded test');
 insert into public.automations(company_id,user_id,name,enabled,action_config) values(cid,auth.uid(),'Create follow-up tasks from insights',true,'{"type":"create_task"}');
 perform public.run_insight_automation(cid); perform public.run_insight_automation(cid);
 select count(*) into total from public.automation_runs where company_id=cid;
 if total<>1 then raise exception 'FAIL: duplicate automation run'; end if;
 select count(*) into total from public.memories where company_id=cid and kind='execution_result';
 if total<>2 then raise exception 'FAIL: execution memories missing or duplicated'; end if;
 insert into public.ai_actions(company_id,user_id,idempotency_key,action_type,title,description) values(cid,auth.uid(),'mission','create_mission','Test mission','Rollback fixture') returning id into aid;
 out1:=public.execute_internal_action(aid,true); if out1 ? 'error' then raise exception 'FAIL: create mission'; end if;
 insert into public.ai_actions(company_id,user_id,idempotency_key,action_type,title,description) values(cid,auth.uid(),'decision','record_decision','Test decision','Rollback fixture') returning id into aid;
 out1:=public.execute_internal_action(aid,true); if out1 ? 'error' then raise exception 'FAIL: record decision'; end if;
 insert into public.ai_actions(company_id,user_id,idempotency_key,action_type,title,description) values(cid,auth.uid(),'memory','update_memory','Test learning','Rollback fixture') returning id into aid;
 out1:=public.execute_internal_action(aid,true); if out1 ? 'error' then raise exception 'FAIL: add memory'; end if;
 insert into public.ai_actions(company_id,user_id,idempotency_key,action_type,title,task_id,input_payload) values(cid,auth.uid(),'update','update_task','Mark task complete',(select id from public.tasks where company_id=cid and title='Approval retry test'),'{"status":"completed"}') returning id into aid;
 out1:=public.execute_internal_action(aid,true); if out1 ? 'error' then raise exception 'FAIL: update task'; end if;
 select count(*) into total from public.company_events where company_id=cid and event_type='task_completed';
 if total<>1 then raise exception 'FAIL: V2 task event bridge'; end if;
 insert into public.ai_actions(company_id,user_id,idempotency_key,action_type,title) values(cid,auth.uid(),'invalid','create_task',repeat('x',201)) returning id into aid;
 out1:=public.execute_internal_action(aid,true); if not (out1 ? 'error') then raise exception 'FAIL: malformed action not rejected'; end if;
 select count(*) into total from public.tasks where company_id=cid and title=repeat('x',201);
 if total<>0 then raise exception 'FAIL: partial write survived'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare cid uuid:=current_setting('test.company')::uuid; t text; n integer; denied boolean:=false; begin
 foreach t in array array['connections','company_events','company_pulse_snapshots','company_insights','investigations','ai_actions','automations','automation_runs','connector_sync_logs'] loop
 execute format('select count(*) from public.%I where company_id=$1',t) into n using cid;
 if n<>0 then raise exception 'FAIL: cross-user read on %',t; end if;
 end loop;
 begin insert into public.connections(company_id,user_id,provider,display_name) values(cid,auth.uid(),'github','Unauthorized'); exception when others then denied:=true; end;
 if not denied then raise exception 'FAIL: cross-user write'; end if;
end $$;
reset role;
select 'PASS: approval gate, retry idempotency, unsupported action denial, event dedupe, automation dedupe, memory audit, cross-user read/write protection' as result;
rollback;
