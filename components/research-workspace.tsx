'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import LocalTime from './local-time';
import type { AgentRun } from '../lib/agents/runtime';

export default function ResearchWorkspace({companyId,runs}:{companyId:string;runs:AgentRun[]}){
  const router=useRouter();
  const key=useRef('');
  const [question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const researchRuns=runs.filter(run=>run.agent_id==='research');
  async function submit(event:React.FormEvent){
    event.preventDefault(); const objective=question.trim(); if(!objective||busy)return;
    setBusy(true);setError('');key.current=crypto.randomUUID();
    try{
      const response=await fetch('/api/company/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId,question:`Research only: ${objective}`,mode:'agents',requestKey:key.current})});
      const data=await response.json(); if(!response.ok)throw new Error(data.error??'Research could not be completed.');
      setQuestion('');router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:'Research could not be completed.');}
    finally{setBusy(false);}
  }
  return <section className="agent-chat-page">
    <header className="agent-chat-header"><div><span className="agent-avatar research">⌕</span><div><span className="v3-eyebrow">RESEARCH AGENT</span><h1>Research workspace</h1><p>Ask about your market, customers, competitors, or product. Findings include the sources used.</p></div></div><a href="#research-tools">Web research connected</a></header>
    <div className="agent-thread">
      {!researchRuns.length&&<div className="agent-empty"><span>⌕</span><h2>What do you want to understand?</h2><p>I’ll research the question, separate evidence from assumptions, and save grounded findings to company memory.</p><div className="prompt-chips"><button onClick={()=>setQuestion('Compare our product with the three strongest competitors and identify gaps.')}>Compare competitors</button><button onClick={()=>setQuestion('Find evidence of demand from our target customers.')}>Validate demand</button><button onClick={()=>setQuestion('Research recent market changes that could affect our product.')}>Watch the market</button></div></div>}
      {researchRuns.map(run=><article className="agent-message-card" key={run.id}><div className="agent-message-user"><b>You</b><p>{run.objective.replace(/^Research only:\s*/i,'')}</p></div><div className="agent-message-ai"><b>Research Agent</b><span className="agent-state">{run.status.replaceAll('_',' ')}</span>{run.output?<><p className="agent-summary">{run.output.summary}</p>{run.output.findings.map((finding,index)=><div className="research-finding" key={index}><small>{finding.kind}</small><p>{finding.content}</p></div>)}{!!run.output.unknowns.length&&<details><summary>What is still unknown</summary><ul>{run.output.unknowns.map((item,index)=><li key={index}>{item}</li>)}</ul></details>}{!!run.output.sources?.length&&<div className="research-sources"><h3>Sources</h3>{run.output.sources.map(source=><a href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.title}<small>{source.domain}</small></a>)}</div>}</>:<p>{run.error_message??'Research is being prepared.'}</p>}<small><LocalTime iso={run.created_at}/></small></div></article>)}
    </div>
    <form className="agent-composer" onSubmit={submit}><textarea aria-label="Research request" required minLength={10} maxLength={450} value={question} onChange={event=>setQuestion(event.target.value)} placeholder="Ask the Research Agent to investigate something…"/><button className="v3-primary" disabled={busy}>{busy?'Researching…':'Send'}</button>{error&&<p role="alert" className="v3-error">{error}</p>}</form>
    <aside className="agent-tool-strip" id="research-tools"><b>Used by this agent</b><span>✓ Company memory</span><span>✓ Live web sources</span><span className="muted">Notion · not connected</span><span className="muted">Drive · not connected</span></aside>
  </section>;
}
