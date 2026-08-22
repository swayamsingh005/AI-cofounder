"use client";

import { useEffect, useState } from "react";

export default function Settings() {
  const [name, setName] = useState(""); const [market, setMarket] = useState(""); const [depth, setDepth] = useState("Directional"); const [saved, setSaved] = useState(false);
  useEffect(() => { setName(localStorage.getItem("founder-name") ?? ""); setMarket(localStorage.getItem("founder-market") ?? ""); setDepth(localStorage.getItem("research-depth") ?? "Directional"); }, []);
  function save() { localStorage.setItem("founder-name", name); localStorage.setItem("founder-market", market); localStorage.setItem("research-depth", depth); setSaved(true); }
  return <main className="app-shell"><header className="app-nav"><a className="brand" href="/"><span className="brand-mark">✦</span> AI Co-Founder</a><div><a href="/new">New idea</a><a href="/reports">My reports</a></div></header><section className="list-page settings"><div className="eyebrow"><span></span> WORKSPACE SETTINGS</div><h1>Make the room<br/>your own.</h1><div className="settings-card"><label>Founder name<input value={name} onChange={event => setName(event.target.value)} placeholder="Your name" /></label><label>Default market<input value={market} onChange={event => setMarket(event.target.value)} placeholder="e.g. India, United States, Global" /></label><label>Research depth<select value={depth} onChange={event => setDepth(event.target.value)}><option>Directional — fast first pass</option><option>Standard — balanced research</option><option>Deep — more sources and detail</option></select></label><button className="primary-action" onClick={save}>{saved ? "Preferences saved ✓" : "Save preferences"}</button></div></section></main>;
}
