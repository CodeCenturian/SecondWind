import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SECONDWIND | Razorpay Recovery Operations Console",
  description: "Deterministic payment recovery operations and idempotent webhook orchestration.",
};

import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="container header-content">
            <div className="logo-section">
              <Link href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="logo-badge">SECONDWIND</span>
                <span className="logo-title">Recovery Console</span>
              </Link>
            </div>
            <nav className="nav-links" style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
              <Link href="/" style={{ color: "#fff", fontWeight: 600, fontSize: "0.875rem" }}>
                Cases Ledger
              </Link>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <Link href="/manual-review" style={{ color: "#fbbf24", fontWeight: 600, fontSize: "0.875rem" }}>
                Manual Review
              </Link>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <Link href="/policy" style={{ color: "var(--accent-primary)", fontWeight: 600, fontSize: "0.875rem" }}>
                Policy Rules
              </Link>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <Link href="/reconciliation" style={{ color: "#34d399", fontWeight: 600, fontSize: "0.875rem" }}>
                Reconciliation
              </Link>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <Link href="/runbook" style={{ color: "#60a5fa", fontWeight: 600, fontSize: "0.875rem" }}>
                Runbook
              </Link>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <Link href="/duplicates" style={{ color: "#f87171", fontWeight: 600, fontSize: "0.875rem" }}>
                Duplicate Queue
              </Link>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <Link href="/dev/injector" style={{ color: "#fbbf24", fontWeight: 600, fontSize: "0.875rem" }}>
                Dev Injector <span style={{ fontSize: "0.6875rem", background: "rgba(245, 158, 11, 0.2)", padding: "0.1rem 0.4rem", borderRadius: "0.25rem" }}>DEV</span>
              </Link>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <span style={{ color: "#10b981", fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "0.2rem 0.6rem", borderRadius: "9999px" }}>
                ● Razorpay Test Mode
              </span>
            </nav>
          </div>
        </header>
        <main className="container" style={{ paddingBottom: "4rem" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
