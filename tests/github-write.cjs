const assert=require('node:assert/strict');
const {validateGitHubFileChange,validateGitHubWorkspaceChange,createGitHubFilePullRequest,draftGitHubIssueChange,draftGitHubObjectiveChange,findGitHubPreviewDeployment,findGitHubValidationChecks}=require('../.v3-test-build/connectors/github-write.js');

const valid={repository:'owner/repo',branch:'ai-cofounder/update-readme',path:'README.md',content:'# Product',title:'Update README',body:'Closes #1'};
assert.equal(validateGitHubFileChange(valid).path,'README.md');
assert.throws(()=>validateGitHubFileChange({...valid,path:'../secret'}),/Invalid or protected repository file path/);
assert.throws(()=>validateGitHubFileChange({...valid,path:'.github/workflows/deploy.yml'}),/protected/);
assert.throws(()=>validateGitHubFileChange({...valid,path:'.env.local'}),/protected/);
assert.throws(()=>validateGitHubFileChange({...valid,branch:'main'}),/Invalid AI Co-Founder branch/);
const workspace={repository:'owner/repo',branch:'ai-cofounder/build-feature',files:[{path:'src/feature.ts',content:'export const ready = true;'},{path:'src/feature.test.ts',content:'// meaningful repository test'}],title:'Build feature',body:'Closes #2'};
assert.equal(validateGitHubWorkspaceChange(workspace).files.length,2);
assert.throws(()=>validateGitHubWorkspaceChange({...workspace,files:Array(6).fill(workspace.files[0])}),/1 to 5 files/);
assert.throws(()=>validateGitHubWorkspaceChange({...workspace,files:[workspace.files[0],workspace.files[0]]}),/duplicate/);

const replies=[
  [200,{default_branch:'main'}],[200,{object:{sha:'a'.repeat(40)}}],[201,{}],
  [201,{sha:'b'.repeat(40)}],[201,{sha:'c'.repeat(40)}],[201,{sha:'d'.repeat(40)}],[200,{}],[200,[]],[201,{html_url:'https://github.com/owner/repo/pull/2',number:2}],
];
const calls=[];
global.fetch=async(url,init)=>{calls.push([url,init]);const [status,body]=replies.shift();return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})};
createGitHubFilePullRequest('secret-token',valid).then(async result=>{
  assert.equal(result.pull_request_number,2); assert.equal(result.merged,false); assert.equal(result.deployed,false);
  assert.equal(calls.some(([,init])=>String(init.headers.Authorization).includes('secret-token')),true);
  assert.equal(calls.some(([url])=>String(url).endsWith('/pulls')),true);
  replies.push([200,{default_branch:'main'}],[200,{number:1,title:'Replace README',body:'Add product setup instructions.'}],[200,{tree:[{type:'blob',path:'README.md',size:20}]}],[200,{encoding:'base64',content:Buffer.from('# Starter').toString('base64')}]);
  const draft=await draftGitHubIssueChange('secret-token','owner/repo',1,async(system,user)=>{
    assert.match(system,/bounded coding agent/); assert.match(user,/Replace README/);
    return JSON.stringify({files:[{path:'README.md',content:'# Product\n\nSetup instructions.'}],title:'Replace starter README',body:'Closes #1'});
  });
  assert.equal(draft.files[0].path,'README.md'); assert.match(draft.files[0].content,/Setup instructions/);
  replies.push([200,[{id:42,environment:'Preview'}]],[200,[{state:'success',environment_url:'https://launchai-preview.vercel.app',updated_at:'2026-09-20'}]]);
  const preview=await findGitHubPreviewDeployment('secret-token','owner/repo','ai-cofounder/update-readme');
  assert.equal(preview.provider,'vercel'); assert.equal(preview.status,'success'); assert.match(preview.url,/vercel\.app/);
  replies.push([200,[]],[200,{object:{sha:'c'.repeat(40)}}],[200,{statuses:[{context:'Vercel',state:'success',target_url:'https://vercel.com/team/project/deployment'}]}],[200,[{body:'| Actions |\n| [Preview](https://owner-project.vercel.app) |'}]]);
  const statusPreview=await findGitHubPreviewDeployment('secret-token','owner/repo','ai-cofounder/update-readme',3);
  assert.equal(statusPreview.status,'success'); assert.equal(statusPreview.url,'https://owner-project.vercel.app');
  replies.push([200,{object:{sha:'d'.repeat(40)}}],[200,{check_runs:[{name:'build',status:'completed',conclusion:'success',html_url:'https://github.com/owner/repo/actions/runs/1'},{name:'test',status:'completed',conclusion:'success',html_url:'https://github.com/owner/repo/actions/runs/2'}]}]);
  const validation=await findGitHubValidationChecks('secret-token','owner/repo','ai-cofounder/update-readme');
  assert.equal(validation.status,'passed'); assert.match(validation.summary,/All 2/);
  replies.push([200,{default_branch:'main'}],[200,{tree:[{type:'blob',path:'src/app.ts',size:30}]}],[200,{encoding:'base64',content:Buffer.from('export const app = true;').toString('base64')}]);
  const objectiveDraft=await draftGitHubObjectiveChange('secret-token','owner/repo','Add a protected dashboard',async(system,user)=>{
    assert.match(system,/controlled AI software builder/); assert.match(user,/protected dashboard/);
    return JSON.stringify({files:[{path:'src/app.ts',content:'export const dashboard = true;'},{path:'src/app.test.ts',content:'// dashboard access test'}],title:'Add protected dashboard',body:'Adds the focused dashboard slice and a test.'});
  });
  assert.equal(objectiveDraft.files.length,2); assert.equal(objectiveDraft.files[1].path,'src/app.test.ts');
  console.log('PASS approved GitHub branch, commit and pull-request connector');
}).catch(error=>{console.error(error);process.exitCode=1});
