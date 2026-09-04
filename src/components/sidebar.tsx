"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  AlertTriangle,
  GitCompare,
  ShieldCheck,
  BookOpen,
  Sliders,
  Terminal,
  Presentation,
  Menu,
  X,
  Radio,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeType?: "warning" | "danger" | "neutral" | "accent";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "OPERATIONS",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Cases Ledger", href: "/cases", icon: Layers },
    ],
  },
  {
    title: "WORK QUEUES",
    items: [
      { label: "Manual Review", href: "/manual-review", icon: AlertTriangle, badgeType: "warning" },
      { label: "Duplicate Resolution", href: "/duplicates", icon: GitCompare, badgeType: "danger" },
    ],
  },
  {
    title: "PROVENANCE & EVIDENCE",
    items: [
      { label: "Reconciliation Ledger", href: "/reconciliation", icon: ShieldCheck },
      { label: "Verified Runbook", href: "/runbook", icon: BookOpen },
    ],
  },
  {
    title: "GOVERNANCE & POLICY",
    items: [
      { label: "Stopping Rules & Policy", href: "/policy", icon: Sliders },
    ],
  },
  {
    title: "PRESENTATION & SANDBOX",
    items: [
      { label: "Pitch Slide Deck", href: "/slides.html", icon: Presentation, badge: "16:9", badgeType: "accent" },
      { label: "Event Injector", href: "/dev/injector", icon: Terminal, badge: "DEV", badgeType: "neutral" },
    ],
  },
];

function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? "8px" : "10px" }}>
      <div
        style={{
          width: compact ? "28px" : "34px",
          height: compact ? "28px" : "34px",
          borderRadius: "var(--radius-sm)",
          background: "linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(234, 179, 8, 0.08))",
          border: "1px solid rgba(16, 185, 129, 0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 14px rgba(16, 185, 129, 0.2)",
          flexShrink: 0,
        }}
      >
        <svg width={compact ? "16" : "20"} height={compact ? "16" : "20"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M12 6C8.69 6 6 8.69 6 12C6 15.31 8.69 18 12 18" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 2V12L19 12" stroke="#fde047" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.2" fill="#10b981" />
        </svg>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "1px", lineHeight: 1.15 }}>
          <span style={{ fontWeight: 800, fontSize: compact ? "0.9375rem" : "1.0625rem", color: "#f2f7f4", letterSpacing: "-0.02em" }}>
            Second
          </span>
          <span style={{ fontWeight: 800, fontSize: compact ? "0.9375rem" : "1.0625rem", color: "var(--accent-primary)", letterSpacing: "-0.02em" }}>
            Wind
          </span>
        </div>
        {!compact && (
          <span style={{ fontSize: "0.5625rem", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginTop: "2px" }}>
            Recovery Console
          </span>
        )}
      </div>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile Top Bar */}
      <header
        style={{
          display: "none",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border-subtle)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
        className="mobile-header"
      >
        <Link href="/" style={{ display: "flex", alignItems: "center" }}>
          <BrandLogo compact={true} />
        </Link>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="btn btn-secondary btn-sm"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          <span>{mobileOpen ? "Close" : "Menu"}</span>
        </button>
      </header>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            zIndex: 35,
          }}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`app-sidebar ${mobileOpen ? "open" : ""}`} aria-label="Main Navigation">
        {/* Brand Header */}
        <div
          style={{
            padding: "var(--space-5) var(--space-4)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            style={{ display: "block" }}
          >
            <BrandLogo />
          </Link>
        </div>

        {/* Live Operational Mode Tag */}
        <div
          style={{
            padding: "8px var(--space-4)",
            background: "rgba(16, 185, 129, 0.05)",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Radio size={13} style={{ color: "var(--success-primary)" }} />
          <span style={{ fontSize: "0.6875rem", color: "var(--success-text)", fontWeight: 600, letterSpacing: "0.03em" }}>
            Razorpay Test Mode
          </span>
        </div>

        {/* Navigation Sections */}
        <nav style={{ flex: 1, padding: "var(--space-4) 0", overflowY: "auto" }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} style={{ marginBottom: "var(--space-4)" }}>
              <div
                style={{
                  padding: "4px var(--space-4)",
                  fontSize: "0.625rem",
                  fontWeight: 700,
                  color: "var(--text-dim)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {section.title}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "2px" }}>
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "7px var(--space-4)",
                        fontSize: "0.8125rem",
                        fontWeight: active ? 600 : 400,
                        color: active ? "#ffffff" : "var(--text-secondary)",
                        background: active ? "var(--bg-surface-active)" : "transparent",
                        borderLeft: active ? "3px solid var(--accent-primary)" : "3px solid transparent",
                        transition: "background 0.12s ease, color 0.12s ease",
                      }}
                      aria-current={active ? "page" : undefined}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Icon size={15} style={{ color: active ? "var(--accent-primary)" : "var(--text-muted)" }} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className="badge-base"
                          style={{
                            fontSize: "0.5625rem",
                            padding: "1px 4px",
                            background: "rgba(255, 255, 255, 0.08)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            borderTop: "1px solid var(--border-subtle)",
            fontSize: "0.6875rem",
            color: "var(--text-muted)",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Environment</span>
            <span className="text-mono" style={{ color: "var(--text-secondary)" }}>Test Mode (INR)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Policy Engine</span>
            <span style={{ color: "var(--success-text)" }}>Deterministic</span>
          </div>
        </div>
      </aside>
    </>
  );
}
