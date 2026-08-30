import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/sidebar";
import { CursorLight } from "@/components/cursor-light";

export const metadata: Metadata = {
  title: "SECONDWIND | Razorpay Recovery Operations Console",
  description: "Deterministic payment recovery operations, idempotent webhook orchestration, and audit provenance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <CursorLight />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div className="app-shell">
          <AppSidebar />
          <main id="main-content" className="app-main" tabIndex={-1}>
            <div className="content-container">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
