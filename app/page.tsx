"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../components/theme-toggle";

const agents = [
  ["01", "Mira — Market Scout", "Demand, trends & market shape"],
  ["02", "Asha — Customer Advocate", "Jobs, motivation & objections"],
  ["03", "Theo — Competitive Strategist", "Alternatives, pricing & gaps"],
  ["04", "Owen — Business Modeler", "Economics & monetization"],
  ["05", "Rhea — Risk Analyst", "What could stop this"],
  ["06", "Nova — MVP Architect", "The smallest path to signal"]
];

function FounderCharacter({ className, face, label, role }: { className: string; face: string; label: string; role: string }) {
  return <div className={`founder ${className}`}><div className="head"><i></i><b>{face}</b><i></i></div><div className="body"><span></span></div><div className="character-label"><b>{label}</b><small>{role}</small></div></div>;
}

export default function Home() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [prompt, setPrompt] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!idea.trim()) { setPrompt("Start with one sentence about the business you want to build."); return; }
    router.push(`/new?idea=${encodeURIComponent(idea.trim())}`);
  }
  return <main>
    <nav><a className="brand" href="/"><img src="/logo-mark.png" alt="" className="brand-mark" /> AI Co-Founder</a><div className="nav-links"><a href="#team">Meet the team</a><a href="/pricing">Pricing</a><a href="/reports">My reports</a><ThemeToggle/><button className="signin" onClick={() => router.push("/auth")}>Sign in <span>↗</span></button></div></nav>
    <section className="hero 4d-room" onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty("--pointer-x", `${((event.clientX - rect.left) / rect.width - .5) * 2}`); event.currentTarget.style.setProperty("--pointer-y", `${((event.clientY - rect.top) / rect.height - .5) * 2}`); }}>
      <div className="ambient orb-one"></div><div className="ambient orb-two"></div><div className="grid-glow"></div>
      <div className="hero-copy"><div className="eyebrow"><span></span> THE INTELLIGENCE ROOM IS OPEN</div><h1>Meet the team<br/>behind your <em>next move.</em></h1><p className="lead">Give your idea to a room of AI co-founders. They debate the market, challenge your assumptions, and leave you with a practical way forward.</p><div className="how-to"><span className="step-dot">1</span><p><b>Start with a rough idea.</b> A sentence is enough. We’ll do the structured thinking together.</p></div></div>
      <div className="character-stage"><div className="holo-ring ring-one"></div><div className="holo-ring ring-two"></div><div className="star star-a">✦</div><div className="star star-b">✦</div><div className="star star-c">✦</div><div className="holo-panel"><span>LIVE SIGNAL</span><b>74</b><small>TEST FIRST</small><i></i></div><div className="speech speech-top"><span className="live-dot"></span> I&rsquo;ll find the market signal.</div><FounderCharacter className="sage" face="⌁" label="Mira" role="Market"/><FounderCharacter className="core" face="●" label="Nova" role="Your AI co-founder"/><FounderCharacter className="spark" face="◒" label="Theo" role="Strategy"/><div className="speech speech-bottom">What if we tested this first? <b>↗</b></div><div className="floor"><span>THE CO-FOUNDER ROOM</span></div></div>
      <form onSubmit={submit} className={prompt ? "idea-box idea-cockpit needs-idea" : "idea-box idea-cockpit"}>
        <div className="cockpit-label"><span>01</span><b>IDEA CONSOLE</b><small>YOUR BRIEF STARTS HERE</small></div>
        <div className="cockpit-core"><div className="idea-icon">✦</div><div className="idea-content"><label htmlFor="idea">Tell the room what you&rsquo;re thinking of building</label><textarea id="idea" value={idea} onChange={(e) => { setIdea(e.target.value); setPrompt(""); }} placeholder="A rough idea is perfect. Try: ‘a tool that helps…’"/></div></div>
        <div className="cockpit-side"><small>READY FOR REVIEW</small><button type="submit"><span>Start the conversation</span> <b>→</b></button><em>Market · Customer · Risk · MVP</em></div>
        {prompt && <p className="idea-warning">{prompt}</p>}
      </form>
      <div className="trust"><div className="avatars"><i>M</i><i>N</i><i>T</i></div><span>6 specialist perspectives · One candid recommendation</span></div>
    </section>
    <section id="team" className="agent-section"><div className="section-kicker">MEET YOUR AI CO-FOUNDERS</div><div className="section-head"><h2>Different minds.<br/><em>One clear answer.</em></h2><p>Every perspective has a job. Their conclusions are combined only after they challenge each other.</p></div><div className="agent-grid">{agents.map(([n,t,d], index) => <article key={n} className={`agent-card card-${index}`}><div className="mini-orb"><i></i></div><span>{n}</span><h3>{t}</h3><p>{d}</p><b>↗</b></article>)}</div></section>
    <section id="how" className="proof"><div><div className="section-kicker">WHAT HAPPENS NEXT</div><h2>From a thought<br/>to a <em>way forward.</em></h2><p>Your report is a decision tool, not a flattering pitch deck. It shows what is known, what is estimated and what must be tested.</p><div className="process"><span>01 <b>Tell us the idea</b></span><span>02 <b>Watch the team investigate</b></span><span>03 <b>Get the honest verdict</b></span></div></div><div className="proof-card"><div className="card-halo"></div><div className="mini-head"><span>LIVE DECISION PREVIEW</span><b>74</b></div><div className="mini-verdict"><i></i> TEST FIRST</div><p>“There is a real customer pain here. Now earn the right to build with ten conversations.”</p><div className="legend"><span><i className="verified"></i> Verified</span><span><i className="estimate"></i> AI estimate</span><span><i className="assume"></i> Assumption</span></div></div></section>
    <footer><span>© 2026 AI Co-Founder</span><span>Built for the messy early days.</span></footer>
  </main>;
}
