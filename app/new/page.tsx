"use client";
import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ThemeToggle from "../../components/theme-toggle";

export const INTAKE_KEY = "cofounder-intake";

export default function NewIdea() { return <Suspense fallback={<main className="app-shell" />}><IntakeForm /></Suspense>; }

function IntakeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [idea, setIdea] = useState(params.get("idea") ?? "");
  const [customer, setCustomer] = useState("");
  const [geography, setGeography] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [constraints, setConstraints] = useState("");
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!idea.trim()) { setError("Start with one sentence about the business you want to build."); return; }
    const intake = { idea: idea.trim(), customer: customer.trim(), geography: geography.trim(), businessModel: businessModel.trim(), alternatives: alternatives.trim(), constraints: constraints.trim(), outcome: outcome.trim() };
    try { sessionStorage.setItem(INTAKE_KEY, JSON.stringify(intake)); } catch { /* sessionStorage unavailable */ }
    router.push(`/workspace?idea=${encodeURIComponent(intake.idea)}`);
  }

  return <main className="app-shell">
    <header className="app-nav"><Link className="brand" href="/"><img src="/logo-mark.png" alt="" className="brand-mark" /> AI Co-Founder</Link><div><Link href="/reports">My reports</Link><Link href="/settings">Settings</Link><ThemeToggle /></div></header>
    <section className="new-page intake-page">
      <div className="eyebrow"><span></span> START A CO-FOUNDER SESSION</div>
      <h1>What are you<br />considering?</h1>
      <p>One raw sentence produces a generic report. A few more details let the room give you a specific one — named alternatives, a customer who actually exists, and validation steps that fit your constraints. Every field except the idea is optional, but more detail earns a sharper brief.</p>
      <form onSubmit={submit} className="intake-form">
        <label className="intake-field wide"><span>Your idea <b>*</b></span><textarea value={idea} onChange={e => { setIdea(e.target.value); setError(""); }} placeholder="A rough idea is perfect. Try: 'a tool that helps…'" required /></label>
        <label className="intake-field"><span>Target customer</span><input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="e.g. solo dentists running their own front desk" /></label>
        <label className="intake-field"><span>Geography / market</span><input value={geography} onChange={e => setGeography(e.target.value)} placeholder="e.g. India, United States, Global" /></label>
        <label className="intake-field"><span>Business model in mind</span><input value={businessModel} onChange={e => setBusinessModel(e.target.value)} placeholder="e.g. monthly subscription, usage-based, one-time fee" /></label>
        <label className="intake-field"><span>Alternatives you already know about</span><input value={alternatives} onChange={e => setAlternatives(e.target.value)} placeholder="e.g. spreadsheets, Calendly, a local agency" /></label>
        <label className="intake-field"><span>Your constraints</span><input value={constraints} onChange={e => setConstraints(e.target.value)} placeholder="e.g. solo founder, 10 hrs/week, no code budget" /></label>
        <label className="intake-field wide"><span>What you want out of this pass</span><input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="e.g. decide whether to spend the next month on this" /></label>
        {error && <p className="idea-warning">{error}</p>}
        <button type="submit" className="large-start">Send the room your brief <b>→</b></button>
      </form>
      <small>Tip: the more specific the customer and geography, the more specific the verdict.</small>
    </section>
  </main>;
}
