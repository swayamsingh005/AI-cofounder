"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "", label: "Dashboard" },
  { href: "/mission", label: "Missions" },
  { href: "/tasks", label: "Tasks" },
  { href: "/decisions", label: "Decisions" },
  { href: "/memory", label: "Company Memory" },
];

export default function CompanySidebar({ companyId }: { companyId: string; companyName: string; stage: string }) {
  const pathname = usePathname();
  const base = `/company/${companyId}`;

  return (
    <nav className="company-sidebar">
      <Link href="/" className="sidebar-brand"><img src="/logo-mark.png" alt="" className="brand-mark" /> AI Co-Founder</Link>

      <div className="sidebar-nav">
        {NAV.map(item => {
          const href = `${base}${item.href}`;
          const active = item.href === "" ? pathname === base : pathname?.startsWith(href);
          return <Link key={item.href} href={href} className={active ? "sidebar-link active" : "sidebar-link"}><span aria-hidden="true">{({ Dashboard: "⌂", Missions: "◇", Tasks: "☑", Decisions: "⊞", "Company Memory": "▤" } as Record<string, string>)[item.label]}</span>{item.label}</Link>;
        })}
      </div>

      <div className="sidebar-section">
        <Link href={`${base}#primary-goal`} className="sidebar-link">◎ Goals</Link>
        <Link href={`${base}#activity`} className="sidebar-link">↺ Activity Timeline</Link>
        <span>AI INTELLIGENCE</span>
        <Link href={`${base}#daily-brief`} className="sidebar-link">Daily Brief</Link>
        <Link href={`${base}#next-action`} className="sidebar-link">Next Best Action</Link>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-help"><b>Need help?</b><p>Ask your AI Co-Founder</p><Link href={`${base}#company-assistant`}>Open conversation ↗</Link></div>
        <Link href="/reports" className="sidebar-link sidebar-link-muted">Reports</Link>
        <Link href="/settings" className="sidebar-link sidebar-link-muted">Settings</Link>
      </div>
    </nav>
  );
}
