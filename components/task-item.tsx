"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "todo" | "in_progress" | "blocked" | "completed";
const NEXT_STATUS: Record<Status, Status> = { todo: "in_progress", in_progress: "completed", completed: "todo", blocked: "todo" };
const MARK: Record<Status, string> = { todo: "○", in_progress: "◐", completed: "✓", blocked: "!" };

export default function TaskItem({ id, title, priority, initialStatus }: { id: string; title: string; priority: string; initialStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>((initialStatus as Status) ?? "todo");
  const [working, setWorking] = useState(false);

  async function cycle() {
    if (working) return;
    const next = NEXT_STATUS[status];
    const prev = status;
    setStatus(next); setWorking(true);
    try {
      const response = await fetch("/api/company/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: id, status: next }) });
      if (!response.ok) setStatus(prev); // revert on failure
      else router.refresh(); // pick up updated mission progress / done count from the server
    } catch {
      setStatus(prev);
    }
    setWorking(false);
  }

  return (
    <li className={`task task-${status}`}>
      <button type="button" className="task-mark" onClick={cycle} disabled={working} aria-label={`Mark as ${NEXT_STATUS[status].replace("_", " ")}`}>{MARK[status]}</button>
      <span>{title}</span>
      <em>{priority}</em>
    </li>
  );
}
