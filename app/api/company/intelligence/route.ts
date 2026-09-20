import { createClient, hasSupabaseConfig } from '../../../../lib/supabase/server';
import { checked, investigate, refreshIntelligence, syncGitHub } from '../../../../lib/intelligence/engine';
import { repositoryName } from '../../../../lib/connectors/base';
import { deleteGitHubToken, readGitHubToken } from '../../../../lib/connectors/credentials';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const maxDuration = 60;
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
  try {
    const recordId = typeof body.id==='string' && UUID.test(body.id) ? body.id : '';
    if (op === 'agent_status') {
      checked(await createAdminClient().rpc('agent_workflow', { p_company: companyId, p_user: userId, p_key: crypto.randomUUID(), p_op: 'recover', p_data: {} }));
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
    }
    else if(op==='investigate' && recordId) return Response.json({result:await investigate(db,companyId,userId,recordId)});
    else if(op==='dismiss' && recordId) checked(await db.from('company_insights').update({status:'dismissed',resolved_at:new Date().toISOString()}).eq('company_id',companyId).eq('id',recordId).select('id').single());
    else if(op==='propose') {
      const type = String(body.actionType ?? 'create_task');
      if(!['create_task','create_mission','record_decision','update_memory','update_task'].includes(type)) throw new Error('This action is not supported. No external action was performed.');
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
      let taskId=null;
      if(type==='update_task') {
        if(typeof body.taskId!=='string' || !UUID.test(body.taskId) || !['todo','in_progress','blocked','completed'].includes(String(body.status))) throw new Error('Invalid task update.');
        const task=checked(await db.from('tasks').select('id').eq('company_id',companyId).eq('id',body.taskId).single()); if(!task) throw new Error('Task not found.'); taskId=task.id;
      }
      checked(await db.from('ai_actions').upsert({company_id:companyId,user_id:userId,investigation_id:investigationId,task_id:taskId,idempotency_key:key,provider:'internal',action_type:type,title,description,risk_level:'low',status:'awaiting_approval',requires_approval:true,input_payload:taskId?{status:body.status}:{}},{onConflict:'company_id,idempotency_key',ignoreDuplicates:true}));
    } else if(op==='approve' && recordId) {
      checked(await db.from('ai_actions').select('id').eq('company_id',companyId).eq('id',recordId).single());
      const result=checked(await db.rpc('execute_internal_action',{p_action:recordId,p_approve:true}));
      if(result?.error) throw new Error(result.error);
    } else if(op==='reject' && recordId) checked(await db.from('ai_actions').update({status:'cancelled'}).eq('company_id',companyId).eq('id',recordId).eq('status','awaiting_approval').select('id').single());
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
      checked(await db.rpc('run_insight_automation',{p_company:companyId}));
    }
    return Response.json({ok:true});
  } catch(error) {
    return Response.json({error:error instanceof Error ? error.message : 'Operation failed. Please retry.'},{status:400});
  }
}
