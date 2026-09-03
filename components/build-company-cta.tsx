"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BuildCompanyCta({ reportId, existingCompanyId }: { reportId: string; existingCompanyId: string | null }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function build() {
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/company/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Could not build the company workspace."); setWorking(false); return; }
      router.push(`/company/${data.companyId}`);
    } catch {
      setError("Could not reach the server. Try again.");
      setWorking(false);
    }
  }

  if (existingCompanyId) {
    return (
      <section className="build-company-cta">
        <span>COMPANY WORKSPACE</span>
        <h2>This idea already has a workspace.</h2>
        <p>Goals, missions, tasks and decisions for this company are already set up.</p>
        <Link href={`/company/${existingCompanyId}`} className="large-start">Open company workspace <b>→</b></Link>
      </section>
    );
  }

  return (
    <section className="build-company-cta">
      <span>THE RESEARCH IS DONE</span>
      <h2>Now build the company.</h2>
      <p>Your Co-Founder can turn this research into goals, a validation plan, MVP priorities, and company memory — so you don&rsquo;t have to explain your startup again.</p>
      <button className="large-start" onClick={build} disabled={working}>{working ? "Building your company…" : <>Build this company <b>→</b></>}</button>
      {error && <small className="cofounder-error">{error}</small>}
    </section>
  );
}
