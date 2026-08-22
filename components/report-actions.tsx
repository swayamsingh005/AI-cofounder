"use client";

import { useState } from "react";

export default function ReportActions({ plan, mode = "both" }: { plan: string[]; mode?: "both" | "export" | "plan" }) {
  const [open, setOpen] = useState(false);
  return <>
    {mode !== "plan" && <button className="report-export" onClick={() => window.print()}>Download / print report <span>↓</span></button>}
    {mode !== "export" && <button className="plan-open" onClick={() => setOpen(true)}>Open 7-day plan <span>→</span></button>}
    {open && <div className="plan-modal" role="dialog" aria-modal="true" aria-labelledby="plan-title" onMouseDown={() => setOpen(false)}>
      <section onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close 7-day plan">×</button>
        <span>EXECUTION SPRINT</span><h2 id="plan-title">Your next 7 days.</h2>
        <p>Move from a promising insight to real founder evidence.</p>
        <ol>{plan.map((item, index) => <li key={item}><b>DAY {index + 1}</b><span>{item}</span></li>)}</ol>
        <button className="modal-done" onClick={() => setOpen(false)}>I&rsquo;ll start this today</button>
      </section>
    </div>}
  </>;
}
