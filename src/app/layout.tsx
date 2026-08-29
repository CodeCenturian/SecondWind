import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SECONDWIND | Razorpay Recovery Operations Console",
  description: "Deterministic payment recovery operations and idempotent webhook orchestration.",
};

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
              <span className="logo-badge">SECONDWIND</span>
              <span className="logo-title">Recovery Console</span>
            </div>
            <nav className="nav-links">
              <a href="/" style={{ color: "#fff", fontWeight: 600 }}>
                Cases
              </a>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <span style={{ color: "#34d399", fontSize: "0.8125rem" }}>
                ● Razorpay Test Mode Connected
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
