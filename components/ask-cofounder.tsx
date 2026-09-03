"use client";

import { useState } from "react";

type Exchange = { question: string; answer: string };
type Block = { heading: string | null; paragraphs: string[]; bullets: string[] };

const KNOWN_HEADINGS = ["OBSERVATION", "WHY IT MATTERS", "RECOMMENDATION", "NEXT ACTION"];

/** Turns the Co-Founder's plain-text answer into structured blocks for real rendering — headings
 * and bullet lists, not a wall of preformatted text. Defensively strips stray markdown (**, #, `)
 * in case the model ignores the "no markdown" instruction, and treats "1. " / "- " / "• " prefixed
 * lines as bullets under whichever heading (or the unlabeled intro) they fall under. */
function parseAnswer(raw: string): Block[] {
  const clean = raw.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#+\s*/gm, "").replace(/`/g, "");
  const lines = clean.split("\n").map(line => line.trim()).filter(line => line.length > 0);
  const blocks: Block[] = [{ heading: null, paragraphs: [], bullets: [] }];

  for (const line of lines) {
    const headingMatch = KNOWN_HEADINGS.find(h => new RegExp(`^${h}\\s*:?\\s*$`, "i").test(line) || new RegExp(`^${h}\\s*:\\s*\\S`, "i").test(line));
    if (headingMatch) {
      const rest = line.replace(new RegExp(`^${headingMatch}\\s*:?\\s*`, "i"), "").trim();
      blocks.push({ heading: headingMatch, paragraphs: rest ? [rest] : [], bullets: [] });
      continue;
    }
    const bulletMatch = line.match(/^(?:[-•]|\d+\.)\s+(.*)$/);
    const current = blocks[blocks.length - 1];
    if (bulletMatch) current.bullets.push(bulletMatch[1]);
    else current.paragraphs.push(line);
  }
  return blocks.filter(block => block.paragraphs.length || block.bullets.length);
}

function AnswerBody({ answer }: { answer: string }) {
  const blocks = parseAnswer(answer);
  return (
    <div className="cofounder-answer-body">
      {blocks.map((block, index) => (
        <div className="cofounder-block" key={index}>
          {block.heading && <b>{block.heading}</b>}
          {block.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          {block.bullets.length > 0 && <ul>{block.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        </div>
      ))}
    </div>
  );
}

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
            <AnswerBody answer={exchange.answer} />
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
