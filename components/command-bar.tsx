"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type Mode = "list" | "ask" | "task" | "decision";

export default function CommandBar() {
  const router = useRouter();
  const pathname = usePathname();
  const companyId = pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  const [input, setInput] = useState("");
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false); setMode("list"); setInput(""); setResult(null); setWorking(false);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(prev => !prev);
      } else if (event.key === "Escape" && open) {
        close();
      }
    }
    function onOpenRequest() { setOpen(true); }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-bar", onOpenRequest);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("open-command-bar", onOpenRequest); };
  }, [open, close]);

  useEffect(() => {
    if (open && mode !== "list") inputRef.current?.focus();
  }, [open, mode]);

  async function submitAsk(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || !companyId || working) return;
    setWorking(true); setResult(null);
    try {
      const response = await fetch("/api/company/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, question: input.trim() }) });
      const data = await response.json();
      setResult(response.ok ? { ok: true, message: data.answer } : { ok: false, message: data.error || "Could not reach the Co-Founder." });
    } catch {
      setResult({ ok: false, message: "Could not reach the server." });
    }
    setWorking(false);
  }

  async function submitTask(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || !companyId || working) return;
    setWorking(true); setResult(null);
    try {
      const response = await fetch("/api/company/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, title: input.trim() }) });
      const data = await response.json();
      if (response.ok) { setResult({ ok: true, message: "Task added." }); router.refresh(); setTimeout(close, 700); }
      else setResult({ ok: false, message: data.error || "Could not create the task." });
    } catch {
      setResult({ ok: false, message: "Could not reach the server." });
    }
    setWorking(false);
  }

  async function submitDecision(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || !companyId || working) return;
    setWorking(true); setResult(null);
    try {
      const response = await fetch("/api/company/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, title: input.trim() }) });
      const data = await response.json();
      if (response.ok) { setResult({ ok: true, message: "Decision recorded." }); router.refresh(); setTimeout(close, 700); }
      else setResult({ ok: false, message: data.error || "Could not record the decision." });
    } catch {
      setResult({ ok: false, message: "Could not reach the server." });
    }
    setWorking(false);
  }

  function go(path: string) {
    router.push(path);
    close();
  }

  if (!open) return (
    <button className="command-trigger" onClick={() => setOpen(true)} aria-label="Open command bar">
      <span>⌘</span>K
    </button>
  );

  return (
    <div className="command-overlay" onClick={close}>
      <div className="command-bar" onClick={event => event.stopPropagation()}>
        {mode === "list" && (
          <div className="command-list">
            {companyId && <button onClick={() => setMode("ask")}>Ask Co-Founder…</button>}
            {companyId && <button onClick={() => setMode("task")}>Create task…</button>}
            {companyId && <button onClick={() => setMode("decision")}>Record decision…</button>}
            <button onClick={() => go("/companies")}>Go to my companies</button>
            <button onClick={() => go("/reports")}>Go to reports</button>
            <button onClick={() => go("/new")}>New idea</button>
            {!companyId && <p className="command-hint">Open a company workspace to ask the Co-Founder, create tasks, or record decisions from here.</p>}
          </div>
        )}

        {mode !== "list" && (
          <form onSubmit={mode === "ask" ? submitAsk : mode === "task" ? submitTask : submitDecision} className="command-form">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              placeholder={mode === "ask" ? "Ask your Co-Founder anything…" : mode === "task" ? "What's the task?" : "What did you decide?"} />
            <div className="command-form-actions">
              <button type="submit" disabled={working || !input.trim()}>{working ? "Working…" : mode === "ask" ? "Ask" : mode === "task" ? "Add task" : "Record"}</button>
              <button type="button" onClick={() => { setMode("list"); setResult(null); setInput(""); }}>Back</button>
            </div>
            {result && <p className={result.ok ? "command-result-ok" : "command-result-error"}>{result.message}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
