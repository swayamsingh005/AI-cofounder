import { repositoryName } from './base';

type GitHubFileChange = { repository:string; branch:string; path:string; content:string; title:string; body:string };
const safeBranch=/^ai-cofounder\/[a-z0-9][a-z0-9-]{2,80}$/;
const safePath=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.\/-]{1,240}$/;

async function request(token:string,url:string,init:RequestInit={}) {
  const response=await fetch(`https://api.github.com${url}`,{...init,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'Content-Type':'application/json','User-Agent':'AI-Co-Founder',...(init.headers??{})},cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(typeof data?.message==='string'?`GitHub: ${data.message}`:`GitHub request failed (${response.status}).`);
  return data as Record<string,unknown>;
}

export function validateGitHubFileChange(value:GitHubFileChange) {
  const repository=repositoryName(value.repository), branch=value.branch.trim(), path=value.path.trim();
  if(!safeBranch.test(branch)) throw new Error('Invalid AI Co-Founder branch name.');
  if(!safePath.test(path)) throw new Error('Invalid repository file path.');
  if(!value.content || value.content.length>100000) throw new Error('File content must be between 1 and 100,000 characters.');
  if(!value.title.trim() || value.title.length>200 || value.body.length>5000) throw new Error('Invalid pull request title or description.');
  return {...value,repository,branch,path,title:value.title.trim(),body:value.body.trim()};
}

export async function createGitHubFilePullRequest(token:string,input:GitHubFileChange) {
  const change=validateGitHubFileChange(input), repo=encodeURIComponent(change.repository).replace('%2F','/');
  const repository=await request(token,`/repos/${repo}`), base=String(repository.default_branch??'main');
  const baseRef=await request(token,`/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
  const sha=String((baseRef.object as Record<string,unknown>)?.sha??'');
  if(!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('GitHub default branch could not be resolved.');
  try { await request(token,`/repos/${repo}/git/refs`,{method:'POST',body:JSON.stringify({ref:`refs/heads/${change.branch}`,sha})}); }
  catch(error) { if(!(error instanceof Error) || !/Reference already exists/i.test(error.message)) throw error; }
  const encodedPath=change.path.split('/').map(encodeURIComponent).join('/');
  let existingSha: string|undefined;
  try { const existing=await request(token,`/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(change.branch)}`); existingSha=typeof existing.sha==='string'?existing.sha:undefined; }
  catch(error) { if(!(error instanceof Error) || !/Not Found/i.test(error.message)) throw error; }
  await request(token,`/repos/${repo}/contents/${encodedPath}`,{method:'PUT',body:JSON.stringify({message:change.title,content:Buffer.from(change.content,'utf8').toString('base64'),branch:change.branch,...(existingSha?{sha:existingSha}:{})})});
  const pulls=await request(token,`/repos/${repo}/pulls?head=${encodeURIComponent(change.repository.split('/')[0]+':'+change.branch)}&state=open`);
  const existing=Array.isArray(pulls)?pulls[0] as Record<string,unknown>|undefined:undefined;
  const pull=existing??await request(token,`/repos/${repo}/pulls`,{method:'POST',body:JSON.stringify({title:change.title,body:change.body,head:change.branch,base})});
  return {repository:change.repository,branch:change.branch,path:change.path,pull_request_url:String(pull.html_url??''),pull_request_number:Number(pull.number??0),commit_created:true,merged:false,deployed:false};
}
