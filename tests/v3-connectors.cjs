const assert = require('node:assert/strict');
const path = require('node:path');
const {repositoryName} = require(path.resolve(process.argv[2], 'connectors/base.js'));
const {githubConnector} = require(path.resolve(process.argv[2], 'connectors/github.js'));
const {executionScore} = require(path.resolve(process.argv[2], 'intelligence/data.js'));
async function main() {
 assert.equal(repositoryName('https://github.com/octocat/Hello-World/'),'octocat/Hello-World');
 for(const input of ['http://localhost/x','owner/../../secret','https://evil.test/a/b','a/b?token=secret','a/b/c']) assert.throws(()=>repositoryName(input));
 assert.equal(executionScore([]),null);
 assert.equal(executionScore([{status:'completed'},{status:'todo'}]),50);
 assert.equal(executionScore(Array(1000).fill({status:'completed'})),null);
 const original=global.fetch;
 global.fetch=async()=>({ok:false,status:403});
 await assert.rejects(githubConnector.sync('octocat/Hello-World'),/rate limit/);
 global.fetch=async()=>({ok:false,status:404});
 await assert.rejects(githubConnector.sync('octocat/Hello-World'),/not found/);
 global.fetch=async()=>{throw new DOMException('timed out','TimeoutError');};
 await assert.rejects(githubConnector.sync('octocat/Hello-World'),/timed out/);
 global.fetch=async(url,opts)=>{
  assert.equal(new URL(url).hostname,'api.github.com');
  assert.equal(opts.headers.Authorization,undefined);
  assert.ok(opts.signal);
  return {ok:true,json:async()=>url.includes('/search/')?{total_count:7}:url.includes('/issues?')?[{number:1,state:'open',title:'A test issue',updated_at:'2026-09-11T10:00:00Z',html_url:'https://github.com/octocat/Hello-World/issues/1'},{number:2,pull_request:{}}]:{private:false}};
 };
 const snapshot=await githubConnector.sync('octocat/Hello-World');
 assert.equal(snapshot.events.length,1);assert.equal(snapshot.metadata.open_issues,7);
 const repeat=await githubConnector.sync('octocat/Hello-World');assert.equal(snapshot.events[0].external_id,repeat.events[0].external_id);
 global.fetch=original;
 if(process.argv.includes('--live')) {
   const live=await githubConnector.sync('octocat/Hello-World');
   assert.equal(typeof live.metadata.open_issues,'number');
   console.log('Live public GitHub sync PASS:',live.events.length,'sampled issues; open count:',live.metadata.open_issues);
 }
 console.log('PASS: repository validation, no-secret fixed-origin requests, timeout/error handling, PR filtering, stable event identifiers, evidence-only pulse');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
