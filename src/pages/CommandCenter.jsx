import React, { useMemo, useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import UrgencyStrip from "@/components/commandcenter/UrgencyStrip";
import ActionFeed from "@/components/commandcenter/ActionFeed";
import FeedFilters from "@/components/commandcenter/FeedFilters";
import ItemDetailDrawer from "@/components/commandcenter/ItemDetailDrawer";
import ForwardLookDrawer from "@/components/commandcenter/ForwardLookDrawer";
import { buildFeed, computeSummary } from "@/lib/commandCenter/feedAggregator";
import { defaultFeedSort } from "@/lib/commandCenter/sortLogic";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

/**
 * CommandCenter — personal action-triage cockpit.
 *
 * Three zones:
 *   A) Urgency Summary Strip (top tiles)
 *   B) Action Feed (hero list)
 *   C) Forward Look Drawer (14-day lookahead, default collapsed)
 *
 * Pulls from all entity types across all projects. Single-user PM view.
 */

const STALE_TIME = 60_000; // 60s — refetch on window focus

// ── Urgency tile key → feed filter mapping ──────────────────────────────
const TILE_TO_URGENCY = {
  overdue:     ["overdue"],
  dueThisWeek: ["due-soon"],
  blocking:    ["blocking"],
  awaiting:    ["awaiting"],
  totalOpen:   null, // no filter — show all
};

export default function CommandCenter() {
  // ── State ───────────────────────────────────────────────────────────
  const [urgencyFilter, setUrgencyFilter] = useState(null);
  const [chipFilters, setChipFilters] = useState({
    projectIds: [],
    itemTypes: [],
    ownerFilter: [],
    search: "",
  });
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [detailItem, setDetailItem] = useState(null);
  const [forwardLookOpen, setForwardLookOpen] = useState(false);

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
        { rfis, drawings, drawingSets, changeOrders, deliveries, workPackages, sovItems, productionNotes },
        projectMap
      ),
    [rfis, drawings, drawingSets, changeOrders, deliveries, workPackages, sovItems, productionNotes, projectMap]
  );

  const summary = useMemo(() => computeSummary(rawFeed), [rawFeed]);

  // ── Apply filters ───────────────────────────────────────────────────
  const filteredFeed = useMemo(() => {
    let feed = [...rawFeed];

    // Urgency tile filter
    if (urgencyFilter) {
      const allowed = TILE_TO_URGENCY[urgencyFilter];
      if (allowed) {
        feed = feed.filter((item) => allowed.includes(item.urgency));
      }
    }

    // Chip filters
    const { projectIds, itemTypes, ownerFilter, search } = chipFilters;
    if (projectIds.length > 0) {
      feed = feed.filter((item) => projectIds.includes(item.projectId));
    }
    if (itemTypes.length > 0) {
      feed = feed.filter((item) => itemTypes.includes(item.itemType));
    }
    if (ownerFilter.length > 0) {
      feed = feed.filter((item) => item.owner && ownerFilter.includes(item.owner));
    }
    if (search) {
      const q = search.toLowerCase();
      feed = feed.filter(
        (item) =>
          (item.title || "").toLowerCase().includes(q) ||
          (item.displayStatus || "").toLowerCase().includes(q) ||
          (item.projectNumber || "").toLowerCase().includes(q)
      );
    }

    // Sort
    feed.sort(defaultFeedSort);
    return feed;
  }, [rawFeed, urgencyFilter, chipFilters]);

  // ── Unique owners for filter chips ──────────────────────────────────
  const uniqueOwners = useMemo(() => {
    const set = new Set();
    for (const item of rawFeed) {
      if (item.owner) set.add(item.owner);
    }
    return [...set].sort();
  }, [rawFeed]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      // Don't capture when inside an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      switch (e.key) {
        case "j":
        case "J":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredFeed.length - 1));
          break;
        case "k":
        case "K":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
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
          // Mark resolved — for production notes only in MVP
          if (selectedIndex >= 0 && selectedIndex < filteredFeed.length) {
            const item = filteredFeed[selectedIndex];
            if (item.itemType === "NOTE" && item.raw?.id) {
              e.preventDefault();
              base44.entities.ProductionNote.update(item.raw.id, {
                is_resolved: true,
                resolved_date: new Date().toISOString(),
              }).catch(() => {});
            }
          }
          break;
      }
    },
    [filteredFeed, selectedIndex, detailItem, forwardLookOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Reset selected index when feed changes
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

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Space Grotesk', var(--font-display)",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "0.04em",
            }}
          >
            COMMAND CENTER
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-muted)",
              margin: "2px 0 0",
            }}
          >
            {rawFeed.length} open item{rawFeed.length !== 1 ? "s" : ""} across{" "}
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setForwardLookOpen(true)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "7px 14px",
              borderRadius: 4,
              border: "1px solid var(--accent-border)",
              background: "var(--bg-surface-low)",
              color: "var(--accent)",
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "border-color 0.15s",
            }}
          >
            14-Day Forward Look
          </button>

          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              padding: "4px 8px",
              background: "var(--bg-surface)",
              borderRadius: 2,
            }}
            title="Keyboard: J/K navigate, Enter opens detail, Esc closes, E resolves notes"
          >
            J/K/Enter/Esc
          </span>
        </div>
      </div>

      {/* Zone A — Urgency Strip */}
      <UrgencyStrip
        summary={summary}
        activeFilter={urgencyFilter}
        onFilterClick={setUrgencyFilter}
      />

      {/* Filter chips */}
      <FeedFilters
        projects={projects}
        owners={uniqueOwners}
        filters={chipFilters}
        onFilterChange={setChipFilters}
      />

      {/* Active filter indicator */}
      {(urgencyFilter || chipFilters.projectIds.length > 0 || chipFilters.itemTypes.length > 0 || chipFilters.ownerFilter.length > 0 || chipFilters.search) && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.06em",
          }}
        >
          Showing {filteredFeed.length} of {rawFeed.length} items
        </div>
      )}

      {/* Zone B — Action Feed */}
      <ActionFeed
        items={filteredFeed}
        selectedIndex={selectedIndex}
        onSelectIndex={setSelectedIndex}
        onOpenDetail={setDetailItem}
      />

      {/* Item Detail Drawer */}
      <ItemDetailDrawer
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />

      {/* Zone C — Forward Look Drawer */}
      <ForwardLookDrawer
        open={forwardLookOpen}
        onClose={() => setForwardLookOpen(false)}
        workPackages={workPackages}
        deliveries={deliveries}
        projectMap={projectMap}
      />
    </div>
  );
}
