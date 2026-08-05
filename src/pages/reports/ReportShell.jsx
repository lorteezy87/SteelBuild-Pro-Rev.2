/**
 * ReportShell — consistent chrome for every individual report page.
 *
 * Renders the CommandBar header, a "← All reports" back link, and a
 * trailing toolbar with CSV + Print buttons. Reports drop their body
 * content as `children`, plus an optional `filters` slot that lands
 * directly under the header.
 *
 * The CSV button is wired by the consumer: pass `onExportCSV` and we
 * render the button. Likewise Print just calls `window.print()` —
 * reports that need to disable print can pass `onPrint={null}`.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { CommandBar } from "@/components/design-system";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { mono } from "./constants";
import { printReport } from "./utils";

export default function ReportShell({
  eyebrow = "REPORTS",
  title,
  count,
  unit,
  subtitle,
  filters,
  onExportCSV,
  onPrint = printReport,
  headerActions,
  children,
}) {
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        onClick={() => navigate("/Reports")}
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          ...mono,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          padding: "4px 6px",
          marginLeft: -6,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        <ChevronLeft size={12} /> All reports
      </button>

      <CommandBar
        eyebrow={eyebrow}
        title={title}
        count={count}
        unit={unit}
        subtitle={subtitle}
      >
        {headerActions}
        {onExportCSV && (
          <button
            onClick={onExportCSV}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-btn)",
              padding: "8px 12px",
              ...mono,
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            <Download size={12} /> CSV
          </button>
        )}
        {onPrint && (
          <button
            onClick={onPrint}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--accent)",
              color: "var(--bg-base)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "8px 14px",
              ...mono,
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
          >
            <Printer size={12} /> Print
          </button>
        )}
      </CommandBar>

      {filters && <div>{filters}</div>}

      {children}

      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @media print {
          body {
            --report-print-background: white;
            --report-print-text: black;
            background: var(--report-print-background) !important;
            color: var(--report-print-text) !important;
          }
          button, input, select { display: none !important; }
        }
      `}</style>
    </div>
  );
}
