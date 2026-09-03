"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StartTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);

  async function start() {
    if (working || done) return;
    setWorking(true);
    try {
      const response = await fetch("/api/company/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, status: "in_progress" }) });
      if (response.ok) { setDone(true); router.refresh(); }
    } catch { /* button just stays clickable again on failure — no need for a loud error here */ }
    setWorking(false);
  }

  return <button type="button" className="next-action-button" onClick={start} disabled={working || done}>{done ? "Started ✓" : working ? "Starting…" : "Start task"}</button>;
}
