const assert=require('node:assert/strict');
const {validateGitHubFileChange,createGitHubFilePullRequest}=require('../.v3-test-build/connectors/github-write.js');

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
createGitHubFilePullRequest('secret-token',valid).then(result=>{
  assert.equal(result.pull_request_number,2); assert.equal(result.merged,false); assert.equal(result.deployed,false);
  assert.equal(calls.some(([,init])=>String(init.headers.Authorization).includes('secret-token')),true);
  assert.equal(calls.some(([url])=>String(url).endsWith('/pulls')),true);
  console.log('PASS approved GitHub branch, commit and pull-request connector');
}).catch(error=>{console.error(error);process.exitCode=1});
