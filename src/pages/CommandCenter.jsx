import React, { useMemo, useState, useCallback, useEffect } from "react";
import { entities } from "@/api/supabaseClient";
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
const EMPTY_LIST = Object.freeze([]);

// ── Role presets ──────────────────────────────────────────────────────
//
// Different people in a steel shop care about wildly different pieces of
// the Command Center. The PM wants RFIs + COs + budget drift; the super
// wants today's deliveries + blockers; the fab manager wants WP
// bottlenecks + drawing releases; the exec wants portfolio health.
// Rather than build 4 separate pages, we let the user pick a role and
// filter which TILES and SECTIONS show.
//
// Persisted per-user via localStorage. Default is "pm" — same
// experience as before, so existing users see no behaviour change
// until they switch roles.
const ROLE_STORAGE_KEY = "sbp-cc-role-v1";
const ROLE_PRESETS = [
  {
    id: "pm",
    label: "PM",
    description: "RFIs, COs, budget drift, submittal calls.",
    color: "var(--accent)",
    tiles: ["needsAction", "overdue", "dueToday", "arrivingToday", "waitingOthers"],
    sections: ["todayAgenda", "weekAhead", "upcomingWindow", "actionFeed"],
  },
  {
    id: "super",
    label: "Superintendent",
    description: "Today's deliveries, crew constraints, blockers.",
    color: "var(--phase-delivery, #F59E0B)",
    tiles: ["dueToday", "arrivingToday", "overdue", "needsAction"],
    sections: ["todayAgenda", "upcomingWindow", "weekAhead"],
  },
  {
    id: "fab",
    label: "Fab Manager",
    description: "WP bottlenecks, drawing release, ship dates.",
    color: "#0EA5E9",
    tiles: ["overdue", "dueToday", "needsAction", "arrivingToday"],
    sections: ["todayAgenda", "upcomingWindow", "actionFeed"],
  },
  {
    id: "exec",
    label: "Executive",
    description: "Forecast, job health, margin-at-risk.",
    color: "#0d9488",
    tiles: ["overdue", "needsAction", "waitingOthers"],
    sections: ["upcomingWindow", "actionFeed"],
  },
];
function loadRole() {
  try {
    const saved = typeof window !== "undefined" && window.localStorage?.getItem(ROLE_STORAGE_KEY);
    if (saved && ROLE_PRESETS.some((r) => r.id === saved)) return saved;
  } catch { /* ignore */ }
  return "pm";
}
function saveRole(id) {
  try { window.localStorage?.setItem(ROLE_STORAGE_KEY, id); } catch { /* ignore */ }
}

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
  const [roleId, setRoleId] = useState(loadRole);
  const activeRole = ROLE_PRESETS.find((r) => r.id === roleId) || ROLE_PRESETS[0];
  const sectionVisible = (key) => activeRole.sections.includes(key);

  // ── Data queries ────────────────────────────────────────────────────
  //
  // Query keys deliberately mirror the registry's bare list-all family
  // keys (see `src/services/cacheRegistry.js`). Earlier these were
  // `cc-rfis` / `cc-schedule-tasks` / etc. — disjoint from the keys
  // mutations invalidate (`["schedule-tasks", projectId]`,
  // `["rfis", projectId]`, …). Result: edit a task on Schedule.jsx, and
  // Command Center kept showing pre-edit dates until STALE_TIME ran out
  // and a window-focus refetch fired.
  //
  // By aligning to the same family keys the rest of the app uses, any
  // call to `invalidateEntity(qc, "schedule_task", projectId)` (or any
  // matching prefix invalidation) wakes Command Center up immediately —
  // no special wiring needed per-mutation site, no cache-key drift.
  const { data: projects = EMPTY_LIST, isLoading: projLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: rfis = EMPTY_LIST, isLoading: rfiLoading } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => entities.RFI.list("-submitted_date"),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: drawings = EMPTY_LIST } = useQuery({
    queryKey: ["drawings"],
    queryFn: () => entities.Drawing.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: drawingSets = EMPTY_LIST } = useQuery({
    queryKey: ["drawing-sets"],
    queryFn: () => entities.DrawingSet.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: changeOrders = EMPTY_LIST } = useQuery({
    queryKey: ["change-orders"],
    queryFn: () => entities.ChangeOrder.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: deliveries = EMPTY_LIST } = useQuery({
    queryKey: ["deliveries"],
    queryFn: () => entities.Delivery.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: workPackages = EMPTY_LIST } = useQuery({
    queryKey: ["work-packages"],
    queryFn: () => entities.WorkPackage.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: sovItems = EMPTY_LIST } = useQuery({
    queryKey: ["sov-items"],
    queryFn: () => entities.SOVItem.list(),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const { data: productionNotes = EMPTY_LIST } = useQuery({
    queryKey: ["production-notes"],
    queryFn: () => entities.ProductionNote.list("-note_date"),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  // Schedule tasks from the Gantt — feeds Installation / Fabrication /
  // Detailing rows into the 48h + 10d windows so everything the user
  // sees on the Gantt also shows up here.
  const { data: scheduleTasks = EMPTY_LIST } = useQuery({
    queryKey: ["schedule-tasks"],
    queryFn: () => entities.ScheduleTask.list("-start_date"),
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
  const [feedUpdatedAt, setFeedUpdatedAt] = useState(Date.now());
  useEffect(() => {
    setFeedUpdatedAt(Date.now());
  }, [rawFeed]);

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
              entities.ProductionNote
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
      : `All clear across ${projects.length} project${projects.length !== 1 ? "s" : ""} — nothing urgent today ✓`;

  const activeFilter = (key) => (snapshotFilter === key);
  const toggleFilter = (key) => setSnapshotFilter((p) => (p === key ? null : key));

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
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

      {/* Role selector — switches the Command Center's default layout so
          PMs, supers, fab managers and execs each see what they actually
          care about. Persisted to localStorage per-user. */}
      <div
        className="sbd-card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderLeft: `3px solid ${activeRole.color}`,
          borderRadius: "var(--radius-card)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginRight: 4,
          }}
        >
          View as
        </span>
        {ROLE_PRESETS.map((r) => {
          const isActive = r.id === activeRole.id;
          return (
            <button
              key={r.id}
              onClick={() => { setRoleId(r.id); saveRole(r.id); }}
              title={r.description}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: isActive ? 11 : 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: isActive ? "6px 14px" : "5px 10px",
                borderRadius: 3,
                border: `1px solid ${isActive ? r.color : "var(--divider)"}`,
                background: isActive ? `color-mix(in srgb, ${r.color} 20%, var(--bg-surface))` : "transparent",
                color: isActive ? r.color : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              {r.label}
            </button>
          );
        })}
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--text-muted)",
            fontStyle: "italic",
          }}
        >
          {activeRole.description}
        </span>
      </div>

      {/* Critical banner — only when blocking items exist */}
      {view.blocking.length > 0 && (
        <div
          onClick={() => toggleFilter("dueToday")}
          className="sbd-card sbd-card-hover"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 12px",
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

      {/* Snapshot tiles — rendered in the order dictated by the active
          role preset. Each tile is opted in/out by the role's `tiles`
          array; trust footer (source + updatedAt) carries through so
          the numbers stay auditable regardless of which role is
          driving the layout. */}
      {(() => {
        const tileSpecs = {
          needsAction:   { label: "Needs You",     value: snapshot.needsAction,   color: "var(--accent)",           source: "action feed",            sub: snapshot.needsAction > 0 ? `across ${projects.length} project${projects.length !== 1 ? "s" : ""}` : "all clear" },
          overdue:       { label: "Overdue",       value: snapshot.overdue,       color: "var(--status-error)",     source: "rfis + drawings + tasks", sub: snapshot.overdue > 5 ? "⚠ elevated" : snapshot.overdue > 0 ? "needs attention" : "none" },
          dueToday:      { label: "Due Today",     value: snapshot.dueToday,      color: "var(--status-warning)",   source: "due-date rollup" },
          arrivingToday: { label: "Arriving Today",value: snapshot.arrivingToday, color: "var(--phase-delivery)",   source: "deliveries" },
          waitingOthers: { label: "Waiting Others",value: snapshot.waitingOthers, color: "var(--text-muted)",       source: "ball-in-court" },
        };
        const visibleTiles = activeRole.tiles.filter((k) => tileSpecs[k]);
        if (visibleTiles.length === 0) return null;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 8 }}>
            {visibleTiles.map((key) => {
              const spec = tileSpecs[key];
              return (
                <KpiTile
                  key={key}
                  compact
                  label={spec.label}
                  value={spec.value}
                  sub={spec.sub}
                  color={spec.color}
                  active={activeFilter(key)}
                  onClick={() => toggleFilter(key)}
                  source={spec.source}
                  updatedAt={feedUpdatedAt}
                />
              );
            })}
          </div>
        );
      })()}

      {/* Main grid: Today (3fr) / Week Ahead (2fr). Either half can be
          hidden by role preset — layout collapses to single-column if
          only one is visible. */}
      {(sectionVisible("todayAgenda") || sectionVisible("weekAhead")) && (
        <div
          className="cc-main-grid"
          style={{
            display: "grid",
            gridTemplateColumns:
              sectionVisible("todayAgenda") && sectionVisible("weekAhead")
                ? "minmax(0, 3fr) minmax(0, 2fr)"
                : "minmax(0, 1fr)",
            gap: 10,
            alignItems: "start",
          }}
        >
          {sectionVisible("todayAgenda") && <TodayAgenda buckets={view} onOpenDetail={setDetailItem} />}
          {sectionVisible("weekAhead") && <WeekAhead weekByDay={view.weekByDay} onForwardLookClick={() => setForwardLookOpen(true)} />}
        </div>
      )}

      {/* Two-window upcoming queue: 48h imminent / 10-day near-term */}
      {sectionVisible("upcomingWindow") && (
        <UpcomingWindows feed={rawFeed} onOpenDetail={setDetailItem} />
      )}

      {/* Collapsible full action feed — visible only for roles that
          include it in their preset (all roles except the lean Super
          view today). */}
      {sectionVisible("actionFeed") && (
      <div
        className="sbd-card"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
          padding: 0,
        }}
      >
        <button
          onClick={() => setFeedExpanded((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "9px 14px",
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
          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
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
      )}

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
