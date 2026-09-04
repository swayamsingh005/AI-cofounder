"use client";

import Link from "next/link";

export default function CompanyTopBar({ companyName, stage }: { companyName: string; stage: string }) {
  return (
    <header className="company-topbar">
      <Link href="/companies" className="topbar-company-switch">
        <b>{companyName}</b><small>{stage}</small>
      </Link>
      <button type="button" className="topbar-quick-action" onClick={() => window.dispatchEvent(new Event("open-command-bar"))}>
        + Quick action <kbd>⌘K</kbd>
      </button>
    </header>
  );
}
