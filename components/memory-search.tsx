"use client";

import { useMemo, useState } from "react";

type Memory = { id: string; kind: string; title: string; content: string };

const KIND_LABEL: Record<string, string> = {
  fact: "Facts", assumption: "Assumptions", decision: "Decisions", learning: "Learnings",
  customer_insight: "Customer insights", risk: "Risks", strategy: "Strategy", experiment: "Experiments", event: "Events",
};
const KIND_ORDER = ["risk", "assumption", "customer_insight", "strategy", "learning", "fact", "decision", "experiment", "event"];

export default function MemorySearch({ memories }: { memories: Memory[] }) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? memories.filter(m => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q)) : memories;
    const groups = new Map<string, Memory[]>();
    for (const m of filtered) {
      if (!groups.has(m.kind)) groups.set(m.kind, []);
      groups.get(m.kind)!.push(m);
    }
    return KIND_ORDER.filter(k => groups.has(k)).map(k => ({ kind: k, items: groups.get(k)! }));
  }, [memories, query]);

  return (
    <div className="memory-search">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search memory…" className="memory-search-input" />
      {!grouped.length && <p className="company-empty-inline">{query ? "Nothing matches that search." : "Your company memory will grow as you make decisions, complete missions, and learn from customers."}</p>}
      {grouped.map(group => (
        <div className="memory-group" key={group.kind}>
          <h3>{KIND_LABEL[group.kind] ?? group.kind} <small>{group.items.length}</small></h3>
          <ul>{group.items.map(item => <li key={item.id}><b>{item.title}</b><p>{item.content}</p></li>)}</ul>
        </div>
      ))}
    </div>
  );
}
