'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function useIntelligence(companyId: string, demo=false) {
  const router=useRouter();
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [failed,setFailed]=useState(false);
  const [activeOp,setActiveOp]=useState('');
  async function run(payload:Record<string,unknown>) {
    if(busy) return false;
    setBusy(true); setActiveOp(String(payload.op ?? '')); setMessage(''); setFailed(false);
    try {
      if(demo) { setMessage('Demo simulation only. No real accounts, records, or deployments were changed.'); return true; }
      const longBuild=['draft_github_objective','draft_github_change'].includes(String(payload.op??''));
      const response=await fetch('/api/company/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId,...payload}),signal:AbortSignal.timeout(longBuild?290000:55000)});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || 'Operation failed.');
      setMessage('Saved. The workspace has been refreshed.');router.refresh();return true;
    } catch(error) {setFailed(true);setMessage(error instanceof Error ? error.message : 'Request interrupted. Refresh before retrying to check whether it finished.');return false;}
    finally {setBusy(false);setActiveOp('');}
  }
  return {run,busy,activeOp,message,failed};
}
export function V3Button({companyId,op,id,children,extra={},demo=false}:{companyId:string;op:string;id?:string;children:React.ReactNode;extra?:Record<string,unknown>;demo?:boolean}) {
  const {run,busy,message,failed}=useIntelligence(companyId,demo);
  return <div className="v3-control"><button className="v3-button" disabled={busy} onClick={()=>run({op,id,...extra})}>{busy?'Working…':children}</button>{message&&<small role={failed?'alert':'status'} className={failed?'v3-error':'v3-feedback'}>{message}</small>}</div>;
}
