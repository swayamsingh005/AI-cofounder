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
  const [error, setError] = useState("");

  async function cycle() {
    if (working) return;
    const next = NEXT_STATUS[status];
    const prev = status;
    setStatus(next); setWorking(true); setError("");
    try {
      const response = await fetch("/api/company/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: id, status: next }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setStatus(prev); setError(data.error || "Could not update this task."); }
      else router.refresh(); // pick up updated mission progress / done count from the server
    } catch {
      setStatus(prev);
      setError("Could not reach the server.");
    }
    setWorking(false);
  }

  return (
    <li className={`task task-${status}`}>
      <button type="button" className="task-mark" onClick={cycle} disabled={working} aria-label={`Mark as ${NEXT_STATUS[status].replace("_", " ")}`}>{MARK[status]}</button>
      <span>{title}</span>
      <em>{priority}</em>
      {error && <small className="task-error">{error}</small>}
    </li>
  );
}
