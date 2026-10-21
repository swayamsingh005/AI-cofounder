import { createClient, hasSupabaseConfig } from '../../../../lib/supabase/server';
import { checked, investigate, refreshIntelligence, syncGitHub } from '../../../../lib/intelligence/engine';
import { repositoryName } from '../../../../lib/connectors/base';
import { deleteConnectorCredential, deleteGitHubToken, readGitHubToken } from '../../../../lib/connectors/credentials';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createGitHubBranchDeployment, findGitHubPreviewDeployment, findGitHubValidationChecks, validateGitHubFileChange } from '../../../../lib/connectors/github-write';
import { stopSandboxPreview } from '../../../../lib/agents/sandbox-validation';
import { codingAgentWorkflow } from '../../../../lib/agents/coding-workflow';
import { resumeHook, start } from 'workflow/api';
import { generateDailyBrief } from '../../../../lib/daily-brief';

export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  if (!hasSupabaseConfig()) return Response.json({error:'Database is not configured.'},{status:503});
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({error:'Cross-origin request rejected.'},{status:403});
  const text = await request.text();
  if (text.length > 12000) return Response.json({error:'Request is too large.'},{status:413});
  let body: Record<string,unknown>;
  try { body=JSON.parse(text); if(!body || Array.isArray(body)) throw new Error(); } catch { return Response.json({error:'Invalid request.'},{status:400}); }
  const { companyId, op } = body;
  if(typeof companyId!=='string' || !UUID.test(companyId)) return Response.json({error:'A valid company is required.'},{status:400});
  const db=await createClient();
  const {data:claims}=await db.auth.getClaims();
  const userId=claims?.claims?.sub;
  if(!userId) return Response.json({error:'Sign in first.'},{status:401});
  const {data:company}=await db.from('companies').select('id').eq('id',companyId).eq('user_id',userId).maybeSingle();
  if(!company) return Response.json({error:'Company not found.'},{status:404});
  console.info('[company/intelligence] operation started', { companyId, op });
  try {
    const recordId = typeof body.id==='string' && UUID.test(body.id) ? body.id : '';
    if (op === 'agent_status') {
      checked(await createAdminClient().rpc('agent_workflow', { p_company: companyId, p_user: userId, p_key: crypto.randomUUID(), p_op: 'recover', p_data: {} }));
    } else if(op==='answer_coding_clarification' && recordId) {
      const answer=typeof body.answer==='string'?body.answer.trim():'';
      if(!answer||answer.length>2000) throw new Error('Provide a clarification of up to 2,000 characters.');
      const action=checked(await db.from('ai_actions').select('id,status,input_payload').eq('company_id',companyId).eq('id',recordId).eq('provider','github').eq('action_type','github.create_pull_request').eq('status','draft').single());
      if(!action||action.input_payload?.workflow_progress?.phase!=='awaiting_clarification') throw new Error('This Coding Agent run is not waiting for clarification.');
      await resumeHook(`coding-clarification-${recordId}`,{answer});
      return Response.json({ok:true,result:{actionId:recordId,status:'resumed'}},{status:202});
    } else if(op==='connect') {
      if(typeof body.repository!=='string') throw new Error('Enter owner/repository.');
      const repository=repositoryName(body.repository);
      checked(await db.rpc('configure_public_github',{p_company:companyId,p_repository:repository}));
      await syncGitHub(db,companyId,userId);
    } else if(op==='select_github_repository') {
      if(typeof body.repository!=='string') throw new Error('Choose a repository.');
      const repository=repositoryName(body.repository);
      const connection=checked(await db.from('connections').select('id,connection_type,metadata').eq('company_id',companyId).eq('provider','github').single());
      if(!connection) throw new Error('Connect your GitHub account first.');
      if(connection.connection_type!=='oauth') throw new Error('Connect your GitHub account first.');
      const token=await readGitHubToken(connection.id,userId);
      if(!token) throw new Error('Reconnect GitHub to continue.');
      checked(await db.from('connections').update({status:'error',display_name:repository,metadata:{...(connection.metadata??{}),repository},updated_at:new Date().toISOString()}).eq('id',connection.id));
      await syncGitHub(db,companyId,userId,token);
    } else if(op==='sync') {
      const connection=checked(await db.from('connections').select('id,connection_type').eq('company_id',companyId).eq('provider','github').single());
      if(!connection) throw new Error('Connect GitHub first.');
      const token=connection.connection_type==='oauth'?await readGitHubToken(connection.id,userId):undefined;
      if(connection.connection_type==='oauth'&&!token) throw new Error('Reconnect GitHub to continue.');
      await syncGitHub(db,companyId,userId,token??undefined);
    } else if(op==='disconnect') {
      const connection=checked(await db.from('connections').select('id,connection_type').eq('company_id',companyId).eq('provider','github').single());
      if(!connection) throw new Error('GitHub is not connected.');
      if(connection.connection_type==='oauth') await deleteGitHubToken(connection.id,userId);
      checked(await db.from('connections').update({status:'disconnected',connection_type:'public_read',metadata:{},updated_at:new Date().toISOString()}).eq('id',connection.id));
    } else if(op==='select_connector_project') {
      const provider=String(body.provider),projectId=String(body.projectId??'').trim(),projectName=String(body.projectName??'').trim();
      if(!['vercel','supabase'].includes(provider)||!projectId||projectId.length>160||!projectName||projectName.length>200)throw new Error('Choose a valid connected project.');
      const connection=checked(await db.from('connections').select('id,connection_type,metadata').eq('company_id',companyId).eq('provider',provider).eq('status','connected').single());
      if(!connection||connection.connection_type!=='oauth')throw new Error(`Connect ${provider} first.`);
      checked(await db.from('connections').update({metadata:{...(connection.metadata??{}),project_id:projectId,project_name:projectName},updated_at:new Date().toISOString()}).eq('id',connection.id).select('id').single());
    } else if(op==='disconnect_connector') {
      const provider=String(body.provider) as 'vercel'|'supabase';if(!['vercel','supabase'].includes(provider))throw new Error('Unsupported connector.');
      const connection=checked(await db.from('connections').select('id').eq('company_id',companyId).eq('provider',provider).single());if(!connection)throw new Error(`${provider} is not connected.`);
      await deleteConnectorCredential(connection.id,userId,provider);
      checked(await db.from('connections').update({status:'disconnected',metadata:{},updated_at:new Date().toISOString()}).eq('id',connection.id).select('id').single());
    }
    else if(op==='draft_github_change') {
      const issueNumber=Number(body.issueNumber), key=typeof body.key==='string'&&UUID.test(body.key)?body.key:crypto.randomUUID();
      if(!Number.isInteger(issueNumber)||issueNumber<1||issueNumber>100000000) throw new Error('Enter a valid GitHub issue number.');
      const connection=checked(await db.from('connections').select('id,connection_type,metadata').eq('company_id',companyId).eq('provider','github').eq('status','connected').single());
      if(!connection||connection.connection_type!=='oauth') throw new Error('Reconnect GitHub with repository access first.');
      const token=await readGitHubToken(connection.id,userId); if(!token) throw new Error('Reconnect GitHub before preparing a change.');
      const repository=repositoryName(String(connection.metadata?.repository??''));
      const action=checked(await db.from('ai_actions').insert({company_id:companyId,user_id:userId,idempotency_key:`github-draft:${key}`,provider:'github',action_type:'github.create_pull_request',title:`Building GitHub issue #${issueNumber}`,description:'The Coding Agent is working in a durable background run.',risk_level:'medium',status:'draft',requires_approval:true,input_payload:{repository,issue_number:issueNumber,workflow_progress:{phase:'queued',percent:0,detail:'Build queued.',updated_at:new Date().toISOString()}}}).select('id,input_payload').single());
      if(!action) throw new Error('The durable coding run could not be created.');
      const workflow=await start(codingAgentWorkflow,[{actionId:action.id,companyId,userId,mode:'issue',issueNumber}]);
      const latest=checked(await db.from('ai_actions').select('input_payload').eq('id',action.id).single());
      if(!latest) throw new Error('The durable coding run could not be updated.');
      checked(await db.from('ai_actions').update({input_payload:{...latest.input_payload,workflow_run_id:workflow.runId}}).eq('id',action.id).select('id').single());
      return Response.json({ok:true,result:{actionId:action.id,runId:workflow.runId,status:'queued'}} ,{status:202});
    }
    else if(op==='draft_github_objective') {
      const objective=typeof body.objective==='string'?body.objective.trim():'', key=typeof body.key==='string'&&UUID.test(body.key)?body.key:crypto.randomUUID();
      const connection=checked(await db.from('connections').select('id,connection_type,metadata').eq('company_id',companyId).eq('provider','github').eq('status','connected').single());
      if(!connection||connection.connection_type!=='oauth') throw new Error('Reconnect GitHub with repository access first.');
      const token=await readGitHubToken(connection.id,userId); if(!token) throw new Error('Reconnect GitHub before preparing a workspace change.');
      const repository=repositoryName(String(connection.metadata?.repository??''));
      if(!objective||objective.length>1000) throw new Error('Describe a software objective of up to 1,000 characters.');
      const action=checked(await db.from('ai_actions').insert({company_id:companyId,user_id:userId,idempotency_key:`github-objective:${key}`,provider:'github',action_type:'github.create_pull_request',title:'Coding Agent build in progress',description:objective,risk_level:'medium',status:'draft',requires_approval:true,input_payload:{repository,objective,workflow_progress:{phase:'queued',percent:0,detail:'Build queued.',updated_at:new Date().toISOString()}}}).select('id,input_payload').single());
      if(!action) throw new Error('The durable coding run could not be created.');
      const workflow=await start(codingAgentWorkflow,[{actionId:action.id,companyId,userId,mode:'create',objective}]);
      const latest=checked(await db.from('ai_actions').select('input_payload').eq('id',action.id).single());
      if(!latest) throw new Error('The durable coding run could not be updated.');
      checked(await db.from('ai_actions').update({input_payload:{...latest.input_payload,workflow_run_id:workflow.runId}}).eq('id',action.id).select('id').single());
      return Response.json({ok:true,result:{actionId:action.id,runId:workflow.runId,status:'queued'}},{status:202});
    }
    else if(op==='revise_github_action' && recordId) {
      const instruction=typeof body.instruction==='string'?body.instruction.trim():'';
      if(!instruction||instruction.length>2000) throw new Error('Describe one revision of up to 2,000 characters.');
      const action=checked(await db.from('ai_actions').select('*').eq('company_id',companyId).eq('id',recordId).eq('provider','github').eq('action_type','github.create_pull_request').eq('status','awaiting_approval').single());
      if(!action) throw new Error('Pending Coding Agent workspace not found.');
      const connection=checked(await db.from('connections').select('id,connection_type').eq('company_id',companyId).eq('provider','github').eq('status','connected').single());
      if(!connection||connection.connection_type!=='oauth'||!await readGitHubToken(connection.id,userId)) throw new Error('Reconnect GitHub before revising this workspace.');
      const payload=action.input_payload as Record<string,unknown>;
      checked(await db.from('ai_actions').update({status:'draft',error_message:null,input_payload:{...payload,workflow_progress:{phase:'queued',percent:0,detail:'Revision queued.',updated_at:new Date().toISOString()}}}).eq('id',recordId).eq('status','awaiting_approval').select('id').single());
      const workflow=await start(codingAgentWorkflow,[{actionId:recordId,companyId,userId,mode:'revise',instruction}]);
      checked(await db.from('ai_actions').update({input_payload:{...payload,workflow_run_id:workflow.runId,workflow_progress:{phase:'queued',percent:0,detail:'Revision queued.',updated_at:new Date().toISOString()}}}).eq('id',recordId).select('id').single());
      return Response.json({ok:true,result:{actionId:recordId,runId:workflow.runId,status:'queued'}},{status:202});
    }
    else if(op==='refresh_preview' && recordId) {
      const action=checked(await db.from('ai_actions').select('*').eq('company_id',companyId).eq('id',recordId).eq('provider','github').eq('action_type','github.create_pull_request').eq('status','completed').single());
      if(!action) throw new Error('Completed GitHub action not found.');
      const connection=checked(await db.from('connections').select('id,connection_type').eq('company_id',companyId).eq('provider','github').eq('status','connected').single());
      if(!connection||connection.connection_type!=='oauth') throw new Error('Reconnect GitHub to read preview status.');
      const token=await readGitHubToken(connection.id,userId); if(!token) throw new Error('Reconnect GitHub to read preview status.');
      const repository=String(action.output_payload?.repository??action.input_payload?.repository??''), branch=String(action.output_payload?.branch??action.input_payload?.branch??'');
      const [preview,validation]=await Promise.all([findGitHubPreviewDeployment(token,repository,branch,Number(action.output_payload?.pull_request_number??0)),findGitHubValidationChecks(token,repository,branch)]);
      checked(await db.from('ai_actions').update({output_payload:{...(action.output_payload??{}),preview,validation}}).eq('id',recordId).select('id').single());
      return Response.json({ok:true,result:{preview,validation}});
    }
    else if(op==='investigate' && recordId) return Response.json({result:await investigate(db,companyId,userId,recordId)});
    else if(op==='dismiss' && recordId) checked(await db.from('company_insights').update({status:'dismissed',resolved_at:new Date().toISOString()}).eq('company_id',companyId).eq('id',recordId).select('id').single());
    else if(op==='propose') {
      const type = String(body.actionType ?? 'create_task');
      if(!['create_task','create_mission','record_decision','update_memory','update_task','github.create_pull_request'].includes(type)) throw new Error('This action is not supported. No external action was performed.');
      let title=String(body.title ?? '').trim().slice(0,200), description=String(body.description ?? '').slice(0,3000), key=String(body.key ?? '');
      let investigationId: string | null=null;
      if(recordId) {
        const table=body.source==='investigation' ? 'investigations' : 'company_insights';
        const source=checked(await db.from(table).select('*').eq('company_id',companyId).eq('id',recordId).single());
        title=String(source.recommended_action || source.title).slice(0,200); description=`Follow up ${table} ${recordId}. ${source.conclusion ?? source.description}`.slice(0,3000);
        investigationId=table==='investigations' ? recordId : null;
        key=table==='company_insights' ? `insight-task:${recordId}` : `investigation-task:${recordId}`;
      }
      if(!title || !key || key.length>150) throw new Error('A title and request key are required.');
      let taskId:string|null=null;
      let provider='internal', riskLevel='low', inputPayload:Record<string,unknown>=taskId?{status:body.status}:{};
      if(type==='github.create_pull_request') {
        if(typeof body.path!=='string' || typeof body.content!=='string') throw new Error('A file path and complete file content are required.');
        const connection=checked(await db.from('connections').select('id,connection_type,metadata').eq('company_id',companyId).eq('provider','github').eq('status','connected').single());
        if(!connection) throw new Error('Connect GitHub first.');
        if(connection.connection_type!=='oauth') throw new Error('Reconnect GitHub with repository access first.');
        const repository=repositoryName(String(connection.metadata?.repository??''));
        const branch=`ai-cofounder/${key.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)}`;
        inputPayload=validateGitHubFileChange({repository,branch,path:body.path,content:body.content,title,body:description});
        provider='github'; riskLevel='medium';
      }
      if(type==='update_task') {
        if(typeof body.taskId!=='string' || !UUID.test(body.taskId) || !['todo','in_progress','blocked','completed'].includes(String(body.status))) throw new Error('Invalid task update.');
        const task=checked(await db.from('tasks').select('id').eq('company_id',companyId).eq('id',body.taskId).single()); if(!task) throw new Error('Task not found.'); taskId=task.id; inputPayload={status:body.status};
      }
      checked(await db.from('ai_actions').upsert({company_id:companyId,user_id:userId,investigation_id:investigationId,task_id:taskId,idempotency_key:key,provider,action_type:type,title,description,risk_level:riskLevel,status:'awaiting_approval',requires_approval:true,input_payload:inputPayload},{onConflict:'company_id,idempotency_key',ignoreDuplicates:true}));
    } else if(op==='approve' && recordId) {
      const action=checked(await db.from('ai_actions').select('*').eq('company_id',companyId).eq('id',recordId).single());
      if(action.provider==='github' && action.action_type==='github.create_pull_request') {
        if(action.status==='completed') return Response.json({ok:true,result:action.output_payload});
        if(action.status!=='awaiting_approval') throw new Error('Action is not awaiting approval.');
        if(action.input_payload?.validation?.status==='failed') throw new Error('This build failed isolated validation. Ask the Coding Agent to revise it before deployment.');
        const [connection,vercel]=await Promise.all([
          db.from('connections').select('id,connection_type').eq('company_id',companyId).eq('provider','github').eq('status','connected').single(),
          db.from('connections').select('id,metadata').eq('company_id',companyId).eq('provider','vercel').eq('status','connected').maybeSingle(),
        ]).then(([githubResult,vercelResult])=>[checked(githubResult),checked(vercelResult)] as const);
        if(!connection) throw new Error('Connect GitHub first.');
        if(connection.connection_type!=='oauth') throw new Error('Reconnect GitHub before approving this action.');
        if(!vercel||typeof vercel.metadata?.project_id!=='string'||!vercel.metadata.project_id) throw new Error('Connect Vercel and choose the deployment project before approving this build.');
        const token=await readGitHubToken(connection.id,userId); if(!token) throw new Error('Reconnect GitHub before approving this action.');
        await stopSandboxPreview(action.input_payload?.validation);
        checked(await db.from('ai_actions').update({status:'executing',approved_by:userId,approved_at:new Date().toISOString()}).eq('id',recordId).eq('status','awaiting_approval').select('id').single());
        try {
          const result=await createGitHubBranchDeployment(token,action.input_payload as Parameters<typeof createGitHubBranchDeployment>[1]);
          let preview=await findGitHubPreviewDeployment(token,result.repository,result.branch);
          for(let attempt=0;attempt<3&&!preview.url;attempt+=1){await new Promise(resolve=>setTimeout(resolve,2500));preview=await findGitHubPreviewDeployment(token,result.repository,result.branch);}
          checked(await db.from('ai_actions').update({status:'completed',executed_at:new Date().toISOString(),output_payload:{...result,preview,vercel_project_id:vercel.metadata.project_id},error_message:null}).eq('id',recordId).select('id').single());
        } catch(error) {
          checked(await db.from('ai_actions').update({status:'failed',executed_at:new Date().toISOString(),error_message:error instanceof Error?error.message:'GitHub action failed.'}).eq('id',recordId).select('id').single());
          throw error;
        }
      } else {
        const result=checked(await db.rpc('execute_internal_action',{p_action:recordId,p_approve:true}));
        if(result?.error) throw new Error(result.error);
      }
    } else if(op==='reject' && recordId) {
      const action=checked(await db.from('ai_actions').select('input_payload').eq('company_id',companyId).eq('id',recordId).eq('status','awaiting_approval').single());
      await stopSandboxPreview(action?.input_payload?.validation);
      checked(await db.from('ai_actions').update({status:'cancelled'}).eq('company_id',companyId).eq('id',recordId).eq('status','awaiting_approval').select('id').single());
    }
    else if(op==='modify' && recordId) {
      if(typeof body.title!=='string' || !body.title.trim()) throw new Error('A title is required.');
      checked(await db.from('ai_actions').update({title:body.title.trim().slice(0,200),description:String(body.description??'').slice(0,3000)}).eq('company_id',companyId).eq('id',recordId).eq('status','awaiting_approval').select('id').single());
    } else if(op==='automation') {
      if(typeof body.enabled!=='boolean') throw new Error('Choose an automation state.');
      checked(await db.from('automations').upsert({company_id:companyId,user_id:userId,name:'Create follow-up tasks from insights',description:'When you refresh intelligence or sync GitHub, create one internal follow-up task per new insight. No external changes. No background schedule.',trigger_type:'event',trigger_config:{event:'intelligence_refreshed'},action_config:{type:'create_task'},risk_level:'low',enabled:body.enabled,updated_at:new Date().toISOString()},{onConflict:'company_id,name'}));
    } else if(op==='assumption' && recordId) {
      if(!['unvalidated','testing','supported','rejected'].includes(String(body.status))) throw new Error('Invalid assumption status.');
      checked(await db.from('memories').update({assumption_status:body.status}).eq('company_id',companyId).eq('id',recordId).eq('kind','assumption').select('id').single());
    } else if(op!=='refresh') throw new Error('Unknown operation.');
    if(['refresh','sync','connect','select_github_repository','approve'].includes(String(op))) {
      await refreshIntelligence(db,companyId,userId);
      if (op === 'refresh') await generateDailyBrief(db,companyId,userId);
      checked(await db.rpc('run_insight_automation',{p_company:companyId}));
    }
    console.info('[company/intelligence] operation completed', { companyId, op });
    return Response.json({ok:true});
  } catch(error) {
    console.error('[company/intelligence] operation failed', { companyId, op, message:error instanceof Error ? error.message : 'Unknown error' });
    return Response.json({error:error instanceof Error ? error.message : 'Operation failed. Please retry.'},{status:400});
  }
}
