"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConfig } from "./useConfig";

export default function Header() {
  const path = usePathname();
  const cfg = useConfig();
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <header className="top">
      <Link href="/" className="brand">
        AgentCart<small>Approve once. Pay only for parts confirmed to fit.</small>
      </Link>
      <nav className="nav" aria-label="Main">
        {link("/", "Shop")}
        {link("/merchant", "Merchant console")}
        {link("/about", "What's real")}
      </nav>
      {cfg && (
        <div className="badges">
          <span className={`badge ${cfg.paypalMode === "sandbox" ? "ok" : ""}`}>
            {cfg.paypalMode === "sandbox" ? "PayPal sandbox" : "Mock PayPal"}
          </span>
          <span className={`badge ${cfg.aiMode === "live" ? "ok" : ""}`}>
            {cfg.aiMode === "live" ? "Live AI" : "Mock AI"}
          </span>
        </div>
      )}
    </header>
  );
}
