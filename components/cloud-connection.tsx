'use client';
import { useEffect, useState } from 'react';
import { useIntelligence } from './v3-controls';

type Provider='vercel'|'supabase';
export default function CloudConnection({companyId,provider,connected,projectId,projectName}:{companyId:string;provider:Provider;connected:boolean;projectId?:string;projectName?:string}) {
  const {run,busy,activeOp,message,failed}=useIntelligence(companyId);
  const [projects,setProjects]=useState<{id:string;name?:string;region?:string;framework?:string}[]>([]),[selected,setSelected]=useState(projectId??''),[loading,setLoading]=useState(connected),[loadError,setLoadError]=useState('');
  useEffect(()=>{if(!connected)return;fetch(`/api/connectors/${provider}/projects?companyId=${encodeURIComponent(companyId)}`).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setProjects(data.projects??[]);}).catch(error=>setLoadError(error instanceof Error?error.message:'Projects could not be loaded.')).finally(()=>setLoading(false));},[companyId,connected,provider]);
  if(!connected)return <a className="v3-button v3-primary" href={`/api/connectors/${provider}/start?companyId=${encodeURIComponent(companyId)}`}>Connect {provider==='vercel'?'Vercel':'Supabase'}</a>;
  const chosen=projects.find(project=>project.id===selected);
  return <div className="v3-form"><label>Project<select value={selected} disabled={loading||busy} onChange={event=>setSelected(event.target.value)}><option value="">{loading?'Loading projects…':'Choose a project'}</option>{projects.map(project=><option value={project.id} key={project.id}>{project.name??project.id}{project.region?` · ${project.region}`:project.framework?` · ${project.framework}`:''}</option>)}</select></label>{projectName&&<small>Selected: {projectName}</small>}{loadError&&<small className="v3-error" role="alert">{loadError}</small>}<div className="v3-button-row"><button type="button" className="v3-primary" disabled={!selected||busy} onClick={()=>run({op:'select_connector_project',provider,projectId:selected,projectName:chosen?.name??selected})}>{activeOp==='select_connector_project'?'Saving…':'Save project'}</button><a className="v3-button" href={`/api/connectors/${provider}/start?companyId=${encodeURIComponent(companyId)}`}>Reconnect</a><button type="button" disabled={busy} onClick={()=>run({op:'disconnect_connector',provider})}>{activeOp==='disconnect_connector'?'Disconnecting…':'Disconnect'}</button></div>{message&&<small className={failed?'v3-error':'v3-feedback'} role={failed?'alert':'status'}>{message}</small>}</div>;
}
