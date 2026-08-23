"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RecomputeAction({ reportId, evidenceCount }: { reportId: string; evidenceCount: number }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function recompute() {
    setWorking(true); setMessage("");
    try {
      const response = await fetch("/api/recompute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "Could not recompute the verdict."); setWorking(false); return; }
      setMessage(data.changed ? `Updated: ${data.verdict} (score ${data.score}).` : "Evidence reviewed — the verdict held.");
      router.refresh();
    } catch {
      setMessage("Could not reach the server. Try again.");
    }
    setWorking(false);
  }

  return <div className="recompute-box">
    <button className="recompute-button" onClick={recompute} disabled={working || evidenceCount === 0}>{working ? "Reviewing your evidence…" : "Recompute verdict with my evidence →"}</button>
    {evidenceCount === 0 && <small>Add interview notes or pilot results to this report from the V2 workspace first.</small>}
    {message && <small className="recompute-message">{message}</small>}
  </div>;
}
