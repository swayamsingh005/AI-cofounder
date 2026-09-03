"use client";

import { useState } from "react";

type Decision = { id: string; title: string; reasoning: string | null; status: string };

export default function DecisionPanel({ companyId, initialDecisions }: { companyId: string; initialDecisions: Decision[] }) {
  const [decisions, setDecisions] = useState<Decision[]>(initialDecisions);
  const [title, setTitle] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function record(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || working) return;
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/company/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, title: title.trim(), reasoning: reasoning.trim() }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Could not record the decision."); setWorking(false); return; }
      setDecisions(prev => [data.decision, ...prev]);
      setTitle(""); setReasoning(""); setOpen(false);
    } catch {
      setError("Could not reach the server.");
    }
    setWorking(false);
  }

  async function setStatus(decisionId: string, status: "reconsidered" | "reversed" | "active") {
    setDecisions(prev => prev.map(d => d.id === decisionId ? { ...d, status } : d));
    try {
      await fetch("/api/company/decisions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisionId, status }) });
    } catch { /* optimistic — a failed status flip just won't persist, not worth blocking the UI over */ }
  }

  return (
    <div className="decision-panel-body">
      {decisions.length ? (
        <ul>{decisions.map(d => (
          <li key={d.id} className={d.status !== "active" ? "decision-inactive" : ""}>
            <div><b>{d.title}</b>{d.status !== "active" && <em> ({d.status})</em>}</div>
            {d.reasoning && <p>{d.reasoning}</p>}
            {d.status === "active" && (
              <div className="decision-actions">
                <button type="button" onClick={() => setStatus(d.id, "reconsidered")}>Reconsider</button>
                <button type="button" onClick={() => setStatus(d.id, "reversed")}>Reverse</button>
              </div>
            )}
          </li>
        ))}</ul>
      ) : (
        <p className="company-empty-inline">No decisions recorded yet.</p>
      )}

      {open ? (
        <form onSubmit={record} className="decision-form">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What did you decide?" required />
          <textarea value={reasoning} onChange={e => setReasoning(e.target.value)} placeholder="Why? (optional)" rows={2} />
          {error && <small className="cofounder-error">{error}</small>}
          <div className="decision-form-actions">
            <button type="submit" disabled={working || !title.trim()}>{working ? "Saving…" : "Record decision"}</button>
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="decision-add" onClick={() => setOpen(true)}>+ Record a decision</button>
      )}
    </div>
  );
}
