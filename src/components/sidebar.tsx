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
    title: "SANDBOX",
    items: [
      { label: "Event Injector", href: "/dev/injector", icon: Terminal, badge: "DEV", badgeType: "neutral" },
    ],
  },
];

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
          padding: "12px 16px",
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border-subtle)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
        className="mobile-header"
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              background: "var(--accent-primary)",
              color: "#040806",
              fontWeight: 700,
              fontSize: "0.75rem",
              padding: "2px 6px",
              borderRadius: "var(--radius-xs)",
              letterSpacing: "0.05em",
            }}
          >
            SW
          </div>
          <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#fff" }}>
            SECONDWIND
          </span>
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

      <style jsx global>{`
        @media (max-width: 1024px) {
          .mobile-header {
            display: flex !important;
          }
          .hide-mobile {
            display: none !important;
          }
        }
      `}</style>

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
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <div
              style={{
                background: "var(--accent-primary)",
                color: "#040806",
                fontWeight: 700,
                fontSize: "0.8125rem",
                padding: "3px 7px",
                borderRadius: "var(--radius-xs)",
                letterSpacing: "0.06em",
              }}
            >
              SECONDWIND
            </div>
          </Link>
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", letterSpacing: "0.02em" }}>
            Financial Recovery Engine
          </span>
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
