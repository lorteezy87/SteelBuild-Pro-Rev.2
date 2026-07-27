import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/design-system";
import { Card, HeaderBar } from "./portfolioPrimitives";
import ProjectHealthRow from "./portfolio/ProjectHealthRow";

const ROW_HEIGHT = 40;
const PROGRESS_ROW_HEIGHT = 3;
const VIRTUALIZE_THRESHOLD = 50;

const TABLE_HEADERS = ["#", "Project", "Phase", "Timeline", "Health", "Budget", "Actual", "Variance", "Proj. Margin", "Open RFIs", "Overdue RFIs", "WP Progress", "Pending COs", "Tonnage", ""];

function ProjectHealthTableHead() {
  return (
    <thead>
      <tr style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 74%, #000 26%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)" }}>
        {TABLE_HEADERS.map((h, idx) => (
          <th
            key={idx}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "10px 8px",
              textAlign: idx <= 2 ? "left" : "center",
              whiteSpace: "nowrap",
              position: "sticky",
              top: 0,
              background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 74%, #000 26%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)",
              zIndex: 2,
            }}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function EmptyProjectHealthRow({ kpiFilter, setKpiFilter, navigate }) {
  return (
    <tr>
      <td colSpan={15} style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexDirection: "column" }}>
          {kpiFilter ? (
            <>
              No projects match the active filter.
              <button
                onClick={() => setKpiFilter(null)}
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--accent)",
                  borderRadius: "var(--radius-btn)",
                  border: "1px solid var(--accent-border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "6px 12px",
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                }}
              >
                Clear Filter
              </button>
            </>
          ) : (
            <>
              <svg width="48" height="48" viewBox="0 0 36 36" aria-hidden style={{ opacity: 0.15 }}>
                <rect x="4" y="4" width="28" height="5" rx="1" fill="var(--text-muted)" />
                <rect x="15" y="9" width="6" height="18" rx="0" fill="var(--text-muted)" />
                <rect x="4" y="27" width="28" height="5" rx="1" fill="var(--text-muted)" />
              </svg>
              NO ACTIVE PROJECTS — Add a project to begin tracking
              <button
                onClick={() => navigate("/Projects")}
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-text)",
                  borderRadius: "var(--radius-btn)",
                  border: "1px solid var(--accent-border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "6px 12px",
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                }}
              >
                + New Project
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function VirtualizedProjectRows({
  displayMetrics,
  projectScheduleSummaries,
  openProjectDashboard,
  navigate,
  scrollRef,
}) {
  const virtualizer = useVirtualizer({
    count: displayMetrics.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT + PROGRESS_ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <>
      {paddingTop > 0 && (
        <tr><td colSpan={15} style={{ height: paddingTop, padding: 0, border: "none" }} /></tr>
      )}
      {virtualItems.map((virtualRow) => {
        const p = displayMetrics[virtualRow.index];
        return (
          <ProjectHealthRow
            key={p.id}
            p={p}
            i={virtualRow.index}
            projectScheduleSummaries={projectScheduleSummaries}
            openProjectDashboard={openProjectDashboard}
            navigate={navigate}
          />
        );
      })}
      {paddingBottom > 0 && (
        <tr><td colSpan={15} style={{ height: paddingBottom, padding: 0, border: "none" }} /></tr>
      )}
    </>
  );
}

export default function PortfolioProjectTable({
  displayMetrics,
  sortMode,
  setSortMode,
  kpiFilter,
  setKpiFilter,
  navigate,
  projectScheduleSummaries,
  openProjectDashboard,
}) {
  const scrollRef = useRef(null);
  const shouldVirtualize = displayMetrics.length > VIRTUALIZE_THRESHOLD;

  return (
    <Card style={{ gridColumn: "span 12" }}>
      <HeaderBar
        title="Project Health Overview"
        count={displayMetrics.length}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {[
              { key: "health", label: "Default" },
              { key: "rfi", label: "Most RFIs" },
              { key: "deadline", label: "Soonest Deadline" },
            ].map((opt) => (
              <Button
                key={opt.key}
                onClick={() => setSortMode(opt.key)}
                variant={sortMode === opt.key ? "primary" : "secondary"}
                size="sm"
              >
                {opt.label}
              </Button>
            ))}
            {kpiFilter && (
              <Button onClick={() => setKpiFilter(null)} variant="danger" size="sm">
                Clear Filter ✕
              </Button>
            )}
            <Button onClick={() => navigate("/Projects")} variant="secondary" size="sm">
              Manage Projects →
            </Button>
          </div>
        }
      />
      {/* Project Health Overview scroll wrapper
       *
       * Keeps horizontal scrolling for the 14-column table on narrow
       * screens. The vertical bound is now viewport-proportional
       * (`min(980px, 78vh)`) so a 15-project portfolio shows roughly
       * 12-14 rows at a glance on a 1080p monitor — up from the old
       * 520px hard cap that only surfaced 6-7 rows. The outer grid
       * scroll still catches anything past the card height, so no
       * data is hidden, it just flows past the fold. */}
      <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "min(980px, 78vh)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <ProjectHealthTableHead />
          <tbody>
            {displayMetrics.length === 0 ? (
              <EmptyProjectHealthRow kpiFilter={kpiFilter} setKpiFilter={setKpiFilter} navigate={navigate} />
            ) : shouldVirtualize ? (
              <VirtualizedProjectRows
                displayMetrics={displayMetrics}
                projectScheduleSummaries={projectScheduleSummaries}
                openProjectDashboard={openProjectDashboard}
                navigate={navigate}
                scrollRef={scrollRef}
              />
            ) : (
              displayMetrics.map((p, i) => (
                <ProjectHealthRow
                  key={p.id}
                  p={p}
                  i={i}
                  projectScheduleSummaries={projectScheduleSummaries}
                  openProjectDashboard={openProjectDashboard}
                  navigate={navigate}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
