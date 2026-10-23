"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "", label: "Home", icon: "⌂" },
  { href: "/coding", label: "Coding Agent", icon: "⌨" },
  { href: "/marketing", label: "Marketing Agent", icon: "◎" },
  { href: "/research", label: "Research Agent", icon: "⌕" },
  { href: "/connections", label: "Connections", icon: "⌘" },
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
          return <Link key={item.href} href={href} className={active ? "sidebar-link active" : "sidebar-link"}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>;
        })}
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-help"><b>Simple by design</b><p>Your agents keep the technical details out of the way.</p></div>
        <Link href="/settings" className="sidebar-link sidebar-link-muted">⚙ Account settings</Link>
      </div>
    </nav>
  );
}
