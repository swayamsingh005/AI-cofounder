"use client";

import { useState } from "react";

type Exchange = { question: string; answer: string; actionStatus?: string };
type Block = { heading: string | null; paragraphs: string[]; bullets: string[] };
type Action = "decision" | "task" | "memory";

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

const ACTION_LABEL: Record<Action, string> = { decision: "Save as Decision", task: "Create Task", memory: "Remember This" };
const ACTION_SUCCESS: Record<Action, string> = { decision: "Saved as a decision.", task: "Task created.", memory: "Remembered." };

export default function AskCofounder({ companyId }: { companyId: string }) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<{ index: number; action: Action } | null>(null);

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

  // Turns an AI response into a real company object. The task/decision endpoints already clean up
  // raw text into a proper one-line title server-side (the same polish used for command-bar input),
  // so the full raw answer can be sent as-is without duplicating that logic here.
  async function actOnExchange(index: number, action: Action) {
    const exchange = exchanges[index];
    if (!exchange || acting) return;
    setActing({ index, action });
    try {
      const endpoint = action === "decision" ? "/api/company/decisions" : action === "task" ? "/api/company/tasks" : "/api/company/memories";
      const body = action === "decision"
        ? { companyId, title: exchange.answer, reasoning: `From a conversation with the Co-Founder: "${exchange.question}"` }
        : action === "task"
        ? { companyId, title: exchange.answer }
        : { companyId, content: exchange.answer, kind: "learning" };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      const status = response.ok ? ACTION_SUCCESS[action] : (data.error || "Could not save that.");
      setExchanges(prev => prev.map((e, i) => i === index ? { ...e, actionStatus: status } : e));
    } catch {
      setExchanges(prev => prev.map((e, i) => i === index ? { ...e, actionStatus: "Could not reach the server." } : e));
    }
    setActing(null);
  }

  return (
    <div className="cofounder-box">
      <div className="cofounder-thread">
        {exchanges.length === 0 && !working && (
          <div className="cofounder-quick-prompts">
            <p className="cofounder-empty">Ask what to work on today, what's blocking you, or challenge a decision — the Co-Founder answers from this company's actual context, not generic advice.</p>
            <div className="quick-prompt-row">
              <button type="button" onClick={() => setQuestion("What should I work on today?")}>Ask a question</button>
              <button type="button" onClick={() => setQuestion("Analyze our current mission progress and what's blocking us.")}>Analyze something</button>
              <button type="button" onClick={() => setQuestion("Help me brainstorm ideas for ")}>Brainstorm ideas</button>
            </div>
          </div>
        )}
        {exchanges.map((exchange, index) => (
          <div className="cofounder-exchange" key={index}>
            <p className="cofounder-question">{exchange.question}</p>
            <AnswerBody answer={exchange.answer} />
            <div className="cofounder-actions">
              {(["decision", "task", "memory"] as Action[]).map(action => (
                <button key={action} type="button" onClick={() => actOnExchange(index, action)} disabled={!!acting}>
                  {acting?.index === index && acting.action === action ? "Saving…" : ACTION_LABEL[action]}
                </button>
              ))}
            </div>
            {exchange.actionStatus && <small className="cofounder-action-status">{exchange.actionStatus}</small>}
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
