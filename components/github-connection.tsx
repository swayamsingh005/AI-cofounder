'use client';
import { useEffect, useState } from 'react';
import { useIntelligence } from './v3-controls';

export default function GitHubConnection({companyId,connected,repository,oauth}:{companyId:string;connected:boolean;repository?:string;oauth:boolean}) {
  const {run,busy,message,failed}=useIntelligence(companyId);
  const [repos,setRepos]=useState<{name:string;private:boolean}[]>([]),[selected,setSelected]=useState(repository??''),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState('');
  useEffect(()=>{if(!oauth)return;setLoading(true);fetch(`/api/connectors/github/repositories?companyId=${encodeURIComponent(companyId)}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setRepos(d.repositories??[]);}).catch(e=>setLoadError(e instanceof Error?e.message:'Repositories could not be loaded.')).finally(()=>setLoading(false));},[companyId,oauth]);
  if(!oauth) return <a className="v3-button v3-primary" href={`/api/connectors/github/start?companyId=${encodeURIComponent(companyId)}`}>Connect GitHub</a>;
  return <div className="v3-form"><label>Repository<select value={selected} disabled={loading||busy} onChange={e=>setSelected(e.target.value)}><option value="">{loading?'Loading repositories…':'Choose a repository'}</option>{repos.map(r=><option value={r.name} key={r.name}>{r.name}{r.private?' (private)':''}</option>)}</select></label>{loadError&&<small className="v3-error" role="alert">{loadError}</small>}<div className="v3-button-row"><button className="v3-primary" disabled={!selected||busy} onClick={()=>run({op:'select_github_repository',repository:selected})}>{repository?'Save & sync':'Connect repository'}</button><button disabled={!connected||busy||!repository} onClick={()=>run({op:'sync'})}>Sync now</button><a className="v3-button" href={`/api/connectors/github/start?companyId=${encodeURIComponent(companyId)}`}>Reconnect</a><button disabled={busy} onClick={()=>run({op:'disconnect'})}>Disconnect</button></div>{message&&<small className={failed?'v3-error':'v3-feedback'}>{message}</small>}</div>;
}
