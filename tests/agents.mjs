import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, actionPolicy } from '../.v3-test-build/agents/registry.js';
import { planGoal } from '../.v3-test-build/agents/planner.js';
import { parseOutput, parsePlan } from '../.v3-test-build/agents/schema.js';
import { executeAnalysis, redact } from '../.v3-test-build/agents/execution.js';
import { connectorStatus } from '../.v3-test-build/connectors/registry.js';

const output = { summary: 'Analyze the recorded onboarding signal before changing positioning.', findings: [{ content: 'Onboarding was recorded as difficult.', kind: 'observation', evidenceIds: ['m1'] }], drafts: ['Try a shorter onboarding message.'], unknowns: ['Competitor conversion is not recorded.'], actions: [{ actionType: 'create_task', parameters: { title: 'Validate onboarding', description: 'Interview three customers.' }, reason: 'Test the recorded concern.' }] };
test('exactly three agents and backend policies reject forbidden actions', () => {
  assert.deepEqual(Object.keys(AGENTS).sort(), ['coding','marketing','research']);
  for (const agent of Object.keys(AGENTS)) {
    assert.equal(actionPolicy(agent,'analyze_context').permission,'AUTO');
    assert.equal(actionPolicy(agent,'create_task').permission,'APPROVAL_REQUIRED');
    for (const action of ['finance.transfer','supabase.delete_data','__proto__','fetch','gmail.send_email','instagram.publish','vercel.production_deploy','github.merge_pull_request']) assert.throws(()=>actionPolicy(agent,action));
  }
  assert.throws(()=>actionPolicy('research','analyze_github_issues'));
});
test('four requested workflows route and pass structured dependencies', async () => {
  const cases = [
    ['Research competitors for AI Co-Founder.', ['research']],
    ['Analyze our GitHub issues and tell me what we should work on next.', ['coding']],
    ['Prepare a marketing campaign for our product.', ['marketing']],
    ['Research our competitors and use the findings to prepare a better launch strategy.', ['research','marketing']],
  ];
  for (const [goal, expected] of cases) {
    const plan = planGoal(goal); assert.deepEqual(plan.map(s=>s.agentId), expected);
    const finished = [];
    for (const step of plan) {
      const dependencies = step.dependsOn.map(i=>finished[i]);
      const result = await executeAnalysis(step.agentId,step.actionType,{goal, context:'Company profile',evidence:[{id:'m1',category:step.agentId==='coding'?'github':'memory',content:'Onboarding concern'}], dependencies},async (system,user)=>{
        assert.match(system,/untrusted/);
        const input=JSON.parse(user);
        assert.deepEqual(input.dependencies,dependencies);
        return JSON.stringify(output);
      });
      finished.push({agentId:step.agentId,output:result});
    }
    assert.equal(finished.length,expected.length);
  }
  assert.deepEqual(planGoal('Launch our new feature.').map(s=>s.agentId), ['research','coding','marketing']);
  assert.throws(()=>planGoal('Launch our new feature.',2),/limit/);
});
test('malformed outputs, impersonation, permission downgrades and invented evidence fail', () => {
  for (const change of [{agentId:'coding'},{riskLevel:'low'},{approvalRequirement:'AUTO'}]) assert.throws(()=>parseOutput({...output,...change},'research',new Set(['m1'])));
  assert.throws(()=>parseOutput({...output,findings:[{...output.findings[0],evidenceIds:['other-company-id']}]},'research',new Set(['m1'])));
  assert.throws(()=>parseOutput({...output,actions:[{actionType:'create_task',parameters:{title:'x',description:'x',url:'https://evil.test'},reason:'x'}]},'research',new Set(['m1'])));
  assert.equal(parseOutput({...output,actions:Array(3).fill(output.actions[0])},'research',new Set(['m1'])).actions.length,2);
  assert.throws(()=>parsePlan({steps:[{agentId:'research',objective:'x',actionType:'analyze_context',dependsOn:[0]}]}));
});
test('missing evidence and model failures never return fake success', async () => {
  const input={goal:'Review issues',context:'',evidence:[],dependencies:[]};
  await assert.rejects(executeAnalysis('coding','analyze_github_issues',input,async()=>JSON.stringify(output)),/No saved GitHub/);
  await assert.rejects(executeAnalysis('research','analyze_context',input,async()=>{throw new Error('timeout');}),/timeout/);
  await assert.rejects(executeAnalysis('research','analyze_context',input,async()=>'{bad json'));
  assert.equal(connectorStatus('github',{status:'connected',connection_type:'public_read'}),'Public read only');
  assert.equal(connectorStatus('vercel',{status:'connected'}),'Coming soon');
  assert.equal(redact('ghp_'+'a'.repeat(25)),'[credential removed]');
});
test('model list overflow is safely bounded before strict validation', async () => {
  const crowded={...output,summary:'S'.repeat(3000),findings:[{...output.findings[0],content:'F'.repeat(1700)},...Array(6).fill(output.findings[0])],drafts:['D'.repeat(2200),...Array(6).fill('Draft')],unknowns:['U'.repeat(2200),...Array(6).fill('Unknown')],actions:Array(3).fill({...output.actions[0],reason:'R'.repeat(700)})};
  const result=await executeAnalysis('research','analyze_context',{goal:'Research positioning',context:'Company profile',evidence:[{id:'m1',category:'memory',content:'Recorded concern'}],dependencies:[]},async()=>JSON.stringify(crowded),2);
  assert.equal(result.summary.length,2500);
  assert.equal(result.findings.length,6);
  assert.equal(result.findings[0].content.length,1500);
  assert.equal(result.drafts.length,6);
  assert.equal(result.drafts[0].length,2000);
  assert.equal(result.unknowns.length,6);
  assert.equal(result.actions.length,2);
  assert.equal(result.actions[0].reason.length,500);
});
test('omitted model lists default to empty without weakening field validation', async () => {
  const result=await executeAnalysis('research','analyze_context',{goal:'Research positioning',context:'Company profile',evidence:[],dependencies:[]},async()=>JSON.stringify({summary:'No recorded evidence is available yet.'}),2);
  assert.deepEqual(result.findings,[]);
  assert.deepEqual(result.drafts,[]);
  assert.deepEqual(result.unknowns,[]);
  assert.deepEqual(result.actions,[]);
  await assert.rejects(executeAnalysis('research','analyze_context',{goal:'Research positioning',context:'Company profile',evidence:[],dependencies:[]},async()=>JSON.stringify({summary:'Valid',actions:[{actionType:'finance.transfer'}]}),2));
});

