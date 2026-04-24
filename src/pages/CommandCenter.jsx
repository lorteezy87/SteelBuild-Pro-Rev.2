import React, { useMemo, useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import ActionFeed from "@/components/commandcenter/ActionFeed";
import FeedFilters from "@/components/commandcenter/FeedFilters";
import ItemDetailDrawer from "@/components/commandcenter/ItemDetailDrawer";
import ForwardLookDrawer from "@/components/commandcenter/ForwardLookDrawer";
import TodayAgenda from "@/components/commandcenter/TodayAgenda";
import WeekAhead from "@/components/commandcenter/WeekAhead";
import UpcomingWindows from "@/components/commandcenter/UpcomingWindows";
import { buildFeed } from "@/lib/commandCenter/feedAggregator";
import { defaultFeedSort } from "@/lib/commandCenter/sortLogic";
import { buildTodayView } from "@/lib/commandCenter/todayView";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, KpiTile } from "@/components/design-system";

/**
 * CommandCenter — today-first personal cockpit.
 *
 * Layout:
 *   1. CommandBar — friendly greeting + today's date + needs-you chip
 *   2. Critical banner — red strip when blocking items exist
 *   3. Snapshot tiles — 5 KpiTiles (Needs You / Overdue / Due Today /
 *      Arriving / Waiting), each click-to-filter the action feed
 *   4. Main 3fr/2fr grid:
 *        Left  — TodayAgenda: Blocking / Overdue / Due Today / Arriving
 *                Today / Active WPs
 *        Right — WeekAhead: 7-day ribbon with per-day counts + previews
 *   5. Full Action Feed — collapsible, search + filter for the long tail
 */

const STALE_TIME = 60_000;

export default function CommandCenter() {
  // ── State ───────────────────────────────────────────────────────────
  const [snapshotFilter, setSnapshotFilter] = useState(null); // one of snapshot keys
  const [chipFilters, setChipFilters] = useState({
    projectIds: [],
    itemTypes: [],
    ownerFilter: [],
    search: "",
  });
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [detailItem, setDetailItem] = useState(null);
  const [forwardLookOpen, setForwardLookOpen] = useState(false);
  const [feedExpanded, setFeedExpanded] = useState(false);

  // ── Data queries ────────────────────────────────────────────────────
  const { data: projects = [], isLoading: projLoading } = useQuery({
    queryKey: ["cc-projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: rfis = [], isLoading: rfiLoading } = useQuery({
    queryKey: ["cc-rfis"],
    queryFn: () => base44.entities.RFI.list("-submitted_date"),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: drawings = [] } = useQuery({
    queryKey: ["cc-drawings"],
    queryFn: () => base44.entities.Drawing.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: drawingSets = [] } = useQuery({
    queryKey: ["cc-drawing-sets"],
    queryFn: () => base44.entities.DrawingSet.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ["cc-cos"],
    queryFn: () => base44.entities.ChangeOrder.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["cc-deliveries"],
    queryFn: () => base44.entities.Delivery.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["cc-wps"],
    queryFn: () => base44.entities.WorkPackage.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: sovItems = [] } = useQuery({
    queryKey: ["cc-sov"],
    queryFn: () => base44.entities.SOVItem.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: productionNotes = [] } = useQuery({
    queryKey: ["cc-notes"],
    queryFn: () => base44.entities.ProductionNote.list("-note_date"),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  // Schedule tasks from the Gantt — feeds Installation / Fabrication /
  // Detailing rows into the 48h + 10d windows so everything the user
  // sees on the Gantt also shows up here.
  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["cc-schedule-tasks"],
    queryFn: () => base44.entities.ScheduleTask.list("-start_date"),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const isLoading = projLoading || rfiLoading;

  // ── Project map ─────────────────────────────────────────────────────
  const projectMap = useMemo(() => {
    const m = {};
    for (const p of projects) {
      m[p.id] = { project_number: p.project_number, name: p.name, gc_name: p.gc_name };
    }
    return m;
  }, [projects]);

  // ── Build unified feed ──────────────────────────────────────────────
  const rawFeed = useMemo(
    () =>
      buildFeed(
        { rfis, drawings, drawingSets, changeOrders, deliveries, workPackages, sovItems, productionNotes, scheduleTasks },
        projectMap
      ),
    [rfis, drawings, drawingSets, changeOrders, deliveries, workPackages, sovItems, productionNotes, scheduleTasks, projectMap]
  );
  // Timestamp pulses whenever any of the underlying query results
  // change. Driven by rawFeed's identity because that's the closest
  // single handle we have to "did the numbers change?". Feeds the
  // KpiTile trust footers so PMs can see how fresh each count is.
  const feedUpdatedAt = useMemo(() => Date.now(), [rawFeed]);

  // ── Today-first view buckets ────────────────────────────────────────
  const view = useMemo(
    () => buildTodayView(rawFeed, { deliveries, workPackages, projectMap }),
    [rawFeed, deliveries, workPackages, projectMap]
  );

  // ── Apply snapshot + chip filters to the full feed ──────────────────
  const filteredFeed = useMemo(() => {
    let feed = [...rawFeed];

    if (snapshotFilter) {
      if (snapshotFilter === "overdue") {
        feed = feed.filter((i) => i.urgency === "overdue");
      } else if (snapshotFilter === "dueToday") {
        feed = feed.filter(
          (i) =>
            i.urgency === "blocking" ||
            (i.urgency === "due-soon" && /due today/i.test(i.displayStatus)) ||
            (i.daysValue === 0 && i.urgency !== "overdue")
        );
      } else if (snapshotFilter === "needsAction") {
        feed = feed.filter(
          (i) =>
            i.urgency === "overdue" ||
            i.urgency === "blocking" ||
            (i.urgency === "due-soon" && /due today/i.test(i.displayStatus)) ||
            (i.daysValue === 0 && i.urgency !== "overdue")
        );
      } else if (snapshotFilter === "arrivingToday") {
        feed = feed.filter((i) => i.itemType === "DEL");
      } else if (snapshotFilter === "waitingOthers") {
        feed = feed.filter((i) => i.urgency === "awaiting");
      }
    }

    const { projectIds, itemTypes, ownerFilter, search } = chipFilters;
    if (projectIds.length > 0) feed = feed.filter((i) => projectIds.includes(i.projectId));
    if (itemTypes.length > 0) feed = feed.filter((i) => itemTypes.includes(i.itemType));
    if (ownerFilter.length > 0) feed = feed.filter((i) => i.owner && ownerFilter.includes(i.owner));
    if (search) {
      const q = search.toLowerCase();
      feed = feed.filter(
        (i) =>
          (i.title || "").toLowerCase().includes(q) ||
          (i.displayStatus || "").toLowerCase().includes(q) ||
          (i.projectNumber || "").toLowerCase().includes(q)
      );
    }

    feed.sort(defaultFeedSort);
    return feed;
  }, [rawFeed, snapshotFilter, chipFilters]);

  const uniqueOwners = useMemo(() => {
    const set = new Set();
    for (const i of rawFeed) if (i.owner) set.add(i.owner);
    return [...set].sort();
  }, [rawFeed]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (!feedExpanded) return; // nav only applies to the expanded feed

      switch (e.key) {
        case "j":
        case "J":
          e.preventDefault();
          setSelectedIndex((p) => Math.min(p + 1, filteredFeed.length - 1));
          break;
        case "k":
        case "K":
          e.preventDefault();
          setSelectedIndex((p) => Math.max(p - 1, 0));
          break;
        case "Enter":
          if (selectedIndex >= 0 && selectedIndex < filteredFeed.length) {
            e.preventDefault();
            setDetailItem(filteredFeed[selectedIndex]);
          }
          break;
        case "Escape":
          if (detailItem) {
            e.preventDefault();
            setDetailItem(null);
          } else if (forwardLookOpen) {
            e.preventDefault();
            setForwardLookOpen(false);
          }
          break;
        case "e":
        case "E":
          if (selectedIndex >= 0 && selectedIndex < filteredFeed.length) {
            const it = filteredFeed[selectedIndex];
            if (it.itemType === "NOTE" && it.raw?.id) {
              e.preventDefault();
              base44.entities.ProductionNote
                .update(it.raw.id, { is_resolved: true, resolved_date: new Date().toISOString() })
                .catch(() => {});
            }
          }
          break;
      }
    },
    [feedExpanded, filteredFeed, selectedIndex, detailItem, forwardLookOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [filteredFeed.length]);

  // ── Render ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  const { snapshot } = view;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const subtitle =
    snapshot.needsAction > 0
      ? `${snapshot.needsAction} item${snapshot.needsAction !== 1 ? "s" : ""} need your attention · ${projects.length} active project${projects.length !== 1 ? "s" : ""}`
      : `All clear across ${projects.length} project${projects.length !== 1 ? "s" : ""} · nothing urgent today`;

  const activeFilter = (key) => (snapshotFilter === key);
  const toggleFilter = (key) => setSnapshotFilter((p) => (p === key ? null : key));

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={`${greeting} · ${dateLabel.toUpperCase()}`}
        title="Command Center"
        count={snapshot.needsAction}
        unit=" · NEEDS YOU"
        subtitle={subtitle}
      >
        <button
          onClick={() => setForwardLookOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            padding: "8px 14px",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--accent)",
            background: "var(--accent-muted)",
            color: "var(--accent)",
            cursor: "pointer",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 18%, transparent)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-muted)")}
        >
          14-Day Forward Look →
        </button>
      </CommandBar>

      {/* Critical banner — only when blocking items exist */}
      {view.blocking.length > 0 && (
        <div
          onClick={() => toggleFilter("dueToday")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "color-mix(in srgb, var(--status-error) 12%, transparent)",
            border: "1px solid var(--status-error)",
            borderRadius: "var(--radius-card)",
            cursor: "pointer",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 800,
              padding: "3px 8px",
              borderRadius: 3,
              background: "var(--status-error)",
              color: "var(--bg-base)",
              letterSpacing: "0.12em",
            }}
          >
            🔴 BLOCKING
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {view.blocking.length} item{view.blocking.length !== 1 ? "s" : ""} holding up fabrication or erection — action required
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--status-error)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Review →
          </span>
        </div>
      )}

      {/* Snapshot tiles — wired with source + updatedAt so PMs can see
          where each count came from and how fresh it is. feedUpdatedAt
          pulses whenever rawFeed recomputes (i.e. any of the 9 entity
          queries refetched), which is the closest we can get to "when
          did these numbers actually change?". */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <KpiTile
          compact
          label="Needs You"
          value={snapshot.needsAction}
          color="var(--accent)"
          active={activeFilter("needsAction")}
          onClick={() => toggleFilter("needsAction")}
          source="action feed"
          updatedAt={feedUpdatedAt}
        />
        <KpiTile
          compact
          label="Overdue"
          value={snapshot.overdue}
          color="var(--status-error)"
          active={activeFilter("overdue")}
          onClick={() => toggleFilter("overdue")}
          source="rfis + drawings + tasks"
          updatedAt={feedUpdatedAt}
        />
        <KpiTile
          compact
          label="Due Today"
          value={snapshot.dueToday}
          color="var(--status-warning)"
          active={activeFilter("dueToday")}
          onClick={() => toggleFilter("dueToday")}
          source="due-date rollup"
          updatedAt={feedUpdatedAt}
        />
        <KpiTile
          compact
          label="Arriving Today"
          value={snapshot.arrivingToday}
          color="var(--phase-delivery)"
          active={activeFilter("arrivingToday")}
          onClick={() => toggleFilter("arrivingToday")}
          source="deliveries"
          updatedAt={feedUpdatedAt}
        />
        <KpiTile
          compact
          label="Waiting Others"
          value={snapshot.waitingOthers}
          color="var(--text-muted)"
          active={activeFilter("waitingOthers")}
          onClick={() => toggleFilter("waitingOthers")}
          source="ball-in-court"
          updatedAt={feedUpdatedAt}
        />
      </div>

      {/* Main grid: Today (3fr) / Week Ahead (2fr) */}
      <div
        className="cc-main-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
          gap: 14,
          alignItems: "start",
        }}
      >
        <TodayAgenda buckets={view} onOpenDetail={setDetailItem} />
        <WeekAhead weekByDay={view.weekByDay} onForwardLookClick={() => setForwardLookOpen(true)} />
      </div>

      {/* Two-window upcoming queue: 48h imminent / 10-day near-term */}
      <UpcomingWindows feed={rawFeed} onOpenDetail={setDetailItem} />

      {/* Collapsible full action feed */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setFeedExpanded((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: feedExpanded ? "var(--bg-surface-low)" : "transparent",
            border: "none",
            borderBottom: feedExpanded ? "1px solid var(--divider)" : "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13 }}>{feedExpanded ? "▾" : "▸"}</span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 13,
                fontWeight: 800,
                color: "var(--text-primary)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              All Open Items
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
              }}
            >
              {filteredFeed.length}
              {filteredFeed.length !== rawFeed.length ? ` of ${rawFeed.length}` : ""}
            </span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {feedExpanded ? "J/K Navigate · Enter Opens · Esc Closes" : "Click to Expand"}
          </span>
        </button>

        {feedExpanded && (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <FeedFilters
              projects={projects}
              owners={uniqueOwners}
              filters={chipFilters}
              onFilterChange={setChipFilters}
            />
            <ActionFeed
              items={filteredFeed}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
              onOpenDetail={setDetailItem}
            />
          </div>
        )}
      </div>

      <ItemDetailDrawer item={detailItem} onClose={() => setDetailItem(null)} />

      <ForwardLookDrawer
        open={forwardLookOpen}
        onClose={() => setForwardLookOpen(false)}
        workPackages={workPackages}
        deliveries={deliveries}
        projectMap={projectMap}
      />

      <style>{`
        @media (max-width: 980px) {
          .cc-main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
