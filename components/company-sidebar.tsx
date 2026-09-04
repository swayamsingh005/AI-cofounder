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

export default function CompanySidebar({ companyId, companyName, stage }: { companyId: string; companyName: string; stage: string }) {
  const pathname = usePathname();
  const base = `/company/${companyId}`;

  return (
    <nav className="company-sidebar">
      <Link href="/" className="sidebar-brand"><img src="/logo-mark.png" alt="" className="brand-mark" /> AI Co-Founder</Link>

      <div className="sidebar-company">
        <Link href="/companies" className="sidebar-company-switch">
          <b>{companyName}</b>
          <small>{stage}</small>
        </Link>
      </div>

      <div className="sidebar-nav">
        {NAV.map(item => {
          const href = `${base}${item.href}`;
          const active = item.href === "" ? pathname === base : pathname?.startsWith(href);
          return <Link key={item.href} href={href} className={active ? "sidebar-link active" : "sidebar-link"}>{item.label}</Link>;
        })}
      </div>

      <div className="sidebar-bottom">
        <Link href="/reports" className="sidebar-link sidebar-link-muted">Reports</Link>
        <Link href="/settings" className="sidebar-link sidebar-link-muted">Settings</Link>
      </div>
    </nav>
  );
}
