const assert=require('node:assert/strict');
const {validateGitHubFileChange,createGitHubFilePullRequest,draftGitHubIssueChange,findGitHubPreviewDeployment}=require('../.v3-test-build/connectors/github-write.js');

const valid={repository:'owner/repo',branch:'ai-cofounder/update-readme',path:'README.md',content:'# Product',title:'Update README',body:'Closes #1'};
assert.equal(validateGitHubFileChange(valid).path,'README.md');
assert.throws(()=>validateGitHubFileChange({...valid,path:'../secret'}),/Invalid repository file path/);
assert.throws(()=>validateGitHubFileChange({...valid,branch:'main'}),/Invalid AI Co-Founder branch/);

const replies=[
  [200,{default_branch:'main'}],[200,{object:{sha:'a'.repeat(40)}}],[201,{}],[404,{message:'Not Found'}],
  [201,{content:{sha:'b'.repeat(40)}}],[200,[]],[201,{html_url:'https://github.com/owner/repo/pull/2',number:2}],
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
    return JSON.stringify({path:'README.md',content:'# Product\n\nSetup instructions.',title:'Replace starter README',body:'Closes #1'});
  });
  assert.equal(draft.path,'README.md'); assert.match(draft.content,/Setup instructions/);
  replies.push([200,[{id:42,environment:'Preview'}]],[200,[{state:'success',environment_url:'https://launchai-preview.vercel.app',updated_at:'2026-09-20'}]]);
  const preview=await findGitHubPreviewDeployment('secret-token','owner/repo','ai-cofounder/update-readme');
  assert.equal(preview.provider,'vercel'); assert.equal(preview.status,'success'); assert.match(preview.url,/vercel\.app/);
  console.log('PASS approved GitHub branch, commit and pull-request connector');
}).catch(error=>{console.error(error);process.exitCode=1});
