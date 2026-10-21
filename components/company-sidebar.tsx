"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY_NAV = [
  { href: "", label: "Dashboard" },
  { href: "/agents", label: "Agents" },
  { href: "/coding", label: "Coding Workspace" },
  { href: "/tasks", label: "Tasks" },
  { href: "/approvals", label: "Approvals" },
  { href: "/connections", label: "Connections" },
];

const MORE_NAV = [
  { href: "/mission", label: "Missions" },
  { href: "/decisions", label: "Decisions" },
  { href: "/memory", label: "Company Memory" },
  { href: "/insights", label: "Insights" },
  { href: "/investigations", label: "Investigations" },
  { href: "/automations", label: "Automations" },
  { href: "/executions", label: "Execution History" },
];

const ICONS: Record<string, string> = { Dashboard: "⌂", Agents: "◇", "Coding Workspace": "⌨", Missions: "◇", Tasks: "☑", Decisions: "⊞", "Company Memory": "▤", Insights: "ϟ", Investigations: "⌕", Automations: "⚙", Connections: "⌘", Approvals: "☷", "Execution History": "↺" };

export default function CompanySidebar({ companyId }: { companyId: string; companyName: string; stage: string }) {
  const pathname = usePathname();
  const base = `/company/${companyId}`;

  return (
    <nav className="company-sidebar">
      <Link href="/" className="sidebar-brand"><img src="/logo-mark.png" alt="" className="brand-mark" /> AI Co-Founder</Link>

      <div className="sidebar-nav">
        {PRIMARY_NAV.map(item => {
          const href = `${base}${item.href}`;
          const active = item.href === "" ? pathname === base : pathname?.startsWith(href);
          return <Link key={item.href} href={href} className={active ? "sidebar-link active" : "sidebar-link"}><span aria-hidden="true">{ICONS[item.label]}</span>{item.label}</Link>;
        })}
      </div>

      <details className="sidebar-more" open={MORE_NAV.some(item => pathname?.startsWith(`${base}${item.href}`))}>
        <summary>More workspace tools</summary>
        <div className="sidebar-nav sidebar-nav-secondary">{MORE_NAV.map(item => {
          const href = `${base}${item.href}`;
          const active = pathname?.startsWith(href);
          return <Link key={item.href} href={href} className={active ? "sidebar-link active" : "sidebar-link"}><span aria-hidden="true">{ICONS[item.label]}</span>{item.label}</Link>;
        })}</div>
      </details>

      <div className="sidebar-bottom">
        <Link href="/reports" className="sidebar-link sidebar-link-muted">Reports</Link>
        <Link href="/settings" className="sidebar-link sidebar-link-muted">Settings</Link>
      </div>
    </nav>
  );
}
