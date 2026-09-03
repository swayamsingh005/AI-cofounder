"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "todo" | "in_progress" | "blocked" | "completed";
const NEXT_STATUS: Record<Status, Status> = { todo: "in_progress", in_progress: "completed", completed: "todo", blocked: "todo" };
const MARK: Record<Status, string> = { todo: "○", in_progress: "◐", completed: "✓", blocked: "!" };
const STATUS_LABEL: Record<Status, string> = { todo: "To do", in_progress: "In progress", completed: "Completed", blocked: "Blocked" };

export default function TaskItem({ id, title, description, priority, initialStatus }: { id: string; title: string; description?: string | null; priority: string; initialStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>((initialStatus as Status) ?? "todo");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function setTaskStatus(next: Status) {
    if (working) return;
    const prev = status;
    setStatus(next); setWorking(true); setError("");
    try {
      const response = await fetch("/api/company/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: id, status: next }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setStatus(prev); setError(data.error || "Could not update this task."); }
      else router.refresh(); // pick up updated mission/goal progress from the server
    } catch {
      setStatus(prev);
      setError("Could not reach the server.");
    }
    setWorking(false);
  }

  return (
    <li className={`task task-${status}`}>
      <button type="button" className="task-mark" onClick={() => setTaskStatus(NEXT_STATUS[status])} disabled={working} aria-label={`Mark as ${NEXT_STATUS[status].replace("_", " ")}`}>{MARK[status]}</button>
      <button type="button" className="task-title-button" onClick={() => setOpen(true)}>{title}</button>
      <em>{priority}</em>
      {error && <small className="task-error">{error}</small>}

      {open && (
        <div className="task-modal-overlay" onClick={() => setOpen(false)}>
          <div className="task-modal" onClick={event => event.stopPropagation()}>
            <span className="task-modal-priority">{priority.toUpperCase()} PRIORITY</span>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
            <div className="task-modal-status">Status: <b>{STATUS_LABEL[status]}</b></div>
            <div className="task-modal-actions">
              <button type="button" onClick={() => setTaskStatus("in_progress")} disabled={working || status === "in_progress"}>Start</button>
              <button type="button" onClick={() => setTaskStatus("blocked")} disabled={working || status === "blocked"}>Mark blocked</button>
              <button type="button" onClick={() => setTaskStatus("completed")} disabled={working || status === "completed"}>Complete</button>
            </div>
            <button type="button" className="task-modal-close" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </li>
  );
}
