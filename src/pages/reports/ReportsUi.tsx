/**
 * Presentational hub pieces for Reports page shell.
 */
import React, { Suspense } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { CommandBar } from "@/components/design-system";
import PageLoader from "@/boot/PageLoader";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import { mono, body, CARD, LABEL } from "./constants";
import { REPORTS, REPORT_CATEGORIES, REPORTS_BY_SLUG } from "./registry";
import { categoryAccent, reportsForCategory } from "./reportsPageHelpers";
import { ChevronRight } from "lucide-react";

export function ReportCard({ entry, onClick }) {
  // Team uses accent-light so it's visually distinct from --accent / --status-info.
  const accent = categoryAccent(entry.category);
  return (
    <button
      onClick={onClick}
      className="sbd-card sbd-card-hover"
      style={{
        ...CARD,
        textAlign: "left",
        cursor: "pointer",
        borderTop: `2px solid ${accent}`,
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 140,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "var(--shadow-card-hover, 0 4px 12px rgba(0,0,0,0.08))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "var(--shadow-card)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            ...mono,
            fontSize: 8,
            fontWeight: 700,
            color: accent,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          {entry.category}
        </div>
        <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
      </div>
      <div
        style={{
          ...mono,
          fontSize: 14,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "0.02em",
          lineHeight: 1.3,
        }}
      >
        {entry.title}
      </div>
      <div
        style={{
          ...body,
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          flex: 1,
        }}
      >
        {entry.summary}
      </div>
      <div
        style={{
          ...mono,
          fontSize: 8,
          fontWeight: 600,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          paddingTop: 4,
          borderTop: "1px solid var(--divider)",
        }}
      >
        /Reports/{entry.slug}
      </div>
    </button>
  );
}

export function ReportsHub() {
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <CommandBar
        eyebrow="REPORTS"
        title="Report Hub"
        count={REPORTS.length}
        unit=" · LIVE"
        subtitle="Every report below is wired to live Supabase data. Pick one to drill in."
      />

      {REPORT_CATEGORIES.map((cat) => {
        const cards = reportsForCategory(REPORTS, cat);
        if (!cards.length) return null;
        return (
          <section
            key={cat}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div style={{ ...LABEL, fontSize: 9, color: "var(--text-secondary)" }}>
              {cat}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 14,
              }}
            >
              {cards.map((entry) => (
                <ReportCard
                  key={entry.slug}
                  entry={entry}
                  onClick={() => navigate(`/Reports/${entry.slug}`)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ReportRoute({ slug }) {
  const entry = REPORTS_BY_SLUG[slug];
  if (!entry) return <Navigate to="/Reports" replace />;
  const Component = entry.component;
  return (
    <Suspense fallback={<PageLoader />}>
      <PageErrorBoundary label={entry.title} key={slug}>
        <Component />
      </PageErrorBoundary>
    </Suspense>
  );
}


export function ReportsPageShell() {
  return (
    <div className="sb-dashboard-reference-page">
      <Routes>
        <Route index element={<ReportsHub />} />
        {REPORTS.map((entry) => (
          <Route
            key={entry.slug}
            path={entry.slug}
            element={<ReportRoute slug={entry.slug} />}
          />
        ))}
        <Route path="*" element={<Navigate to="/Reports" replace />} />
      </Routes>
    </div>
  );
}
