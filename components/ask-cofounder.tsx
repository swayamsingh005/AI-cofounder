"use client";

import { useState } from "react";

type Exchange = { question: string; answer: string };

export default function AskCofounder({ companyId }: { companyId: string }) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const q = question.trim();
    if (!q || working) return;
    setWorking(true); setError(""); setQuestion("");
    try {
      const response = await fetch("/api/company/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, question: q }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Could not reach the Co-Founder."); setWorking(false); return; }
      setExchanges(prev => [...prev, { question: q, answer: data.answer }]);
    } catch {
      setError("Could not reach the server.");
    }
    setWorking(false);
  }

  return (
    <div className="cofounder-box">
      <div className="cofounder-thread">
        {exchanges.length === 0 && !working && <p className="cofounder-empty">Ask what to work on today, what's blocking you, or challenge a decision — the Co-Founder answers from this company's actual context, not generic advice.</p>}
        {exchanges.map((exchange, index) => (
          <div className="cofounder-exchange" key={index}>
            <p className="cofounder-question">{exchange.question}</p>
            <p className="cofounder-answer">{exchange.answer}</p>
          </div>
        ))}
        {working && <p className="cofounder-thinking">Thinking…</p>}
      </div>
      {error && <p className="cofounder-error">{error}</p>}
      <form onSubmit={ask} className="cofounder-form">
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="What should I work on today?" disabled={working} />
        <button type="submit" disabled={working || !question.trim()}>Ask</button>
      </form>
    </div>
  );
}
