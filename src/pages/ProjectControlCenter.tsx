import { useState, useMemo, useEffect } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { useProjectContext } from "@/components/shared/ProjectContext";
import EmptyStateActionRaw from "@/components/shared/EmptyStateAction";
import { Download } from "lucide-react";
import {
  mapRFIsToPCCItems,
  mapDrawingsToPCCItems,
  mapSubmittalsToPCCItems,
  mapWorkPackagesToPCCItems,
  mapDeliveriesToPCCItems,
  mapChangeOrdersToPCCItems,
  mapScheduleTasksToPCCItems,
  mapActionItemsToPCCItems,
  buildPriorityFeed,
  buildSignalKPIs,
  buildWaitingOnBoard,
  buildExecutionWindows,
  buildOwnerLoad,
  buildDailyBriefing,
  buildReleaseGateActionDrafts,
  SEVERITY,
  IMPACT_TAGS,
} from "@/utils/pccEngine";
import { TYPE_PAGE_MAP, TYPE_CONFIG } from "./projectControlCenter/format";
import {
  AISummaryBanner,
  DailyBriefing,
  DetailDrawer,
  ExecutionWindow,
  HealthSummaryPanel,
  MorningScan,
  OwnerLoadBoard,
  PriorityRow,
  ReleaseGateActionDrafts,
  RiskWatchlist,
  SignalCard,
  WaitingOnBoard,
} from "./projectControlCenter/components";
import type { PCCItem } from "./projectControlCenter/types";

// EmptyStateAction is still .jsx; cast at the boundary.
type AnyProps = PropsWithChildren<Record<string, any>>;
const EmptyStateAction = EmptyStateActionRaw as unknown as ComponentType<AnyProps>;

export default function ProjectControlCenter() {
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("morning");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<PCCItem | null>(null);
  const [lastRefresh] = useState(new Date());
  const [creatingReleaseGateKey, setCreatingReleaseGateKey] = useState<string | null>(null);

  const enabled = !!activeProject?.id;

  // ── Data fetching ──────────────────────────────────────────────
  const rfiQ  = useQuery({ queryKey: ["pcc-rfis",       activeProject?.id], queryFn: () => base44.entities.RFI.filter({ project_id: activeProject.id }),          enabled });
  const dwgQ  = useQuery({ queryKey: ["pcc-drawings",   activeProject?.id], queryFn: () => base44.entities.Drawing.filter({ project_id: activeProject.id }),      enabled });
  const wpQ   = useQuery({ queryKey: ["pcc-wps",        activeProject?.id], queryFn: () => base44.entities.WorkPackage.filter({ project_id: activeProject.id }), enabled });
  const delQ  = useQuery({ queryKey: ["pcc-deliveries", activeProject?.id], queryFn: () => base44.entities.Delivery.filter({ project_id: activeProject.id }),    enabled });
  const coQ   = useQuery({ queryKey: ["pcc-cos",        activeProject?.id], queryFn: () => base44.entities.ChangeOrder.filter({ project_id: activeProject.id }), enabled });
  const taskQ = useQuery({ queryKey: ["pcc-schedule-tasks", activeProject?.id], queryFn: () => base44.entities.ScheduleTask.filter({ project_id: activeProject.id }), enabled });
  const actionQ = useQuery({ queryKey: ["pcc-action-items", activeProject?.id], queryFn: () => base44.entities.ActionItem.filter({ project_id: activeProject.id }), enabled });
  const subQ = useQuery({ queryKey: ["pcc-submittals", activeProject?.id], queryFn: () => base44.entities.Submittal.filter({ project_id: activeProject.id }), enabled });
  const rfis = rfiQ.data ?? [];
  const drawings = dwgQ.data ?? [];
  const submittals = subQ.data ?? [];
  const workPackages = wpQ.data ?? [];
  const deliveries = delQ.data ?? [];
  const changeOrders = coQ.data ?? [];
  const scheduleTasks = taskQ.data ?? [];
  const actionItems = actionQ.data ?? [];
  const isLoading = enabled && (rfiQ.isLoading || dwgQ.isLoading || wpQ.isLoading || delQ.isLoading || coQ.isLoading || taskQ.isLoading || actionQ.isLoading || subQ.isLoading);

  // ── Build scored feed ──────────────────────────────────────────
  const allRaw = useMemo(() => [
    ...mapRFIsToPCCItems(rfis),
    ...mapDrawingsToPCCItems(drawings),
    ...mapSubmittalsToPCCItems(submittals),
    ...mapWorkPackagesToPCCItems(workPackages),
    ...mapDeliveriesToPCCItems(deliveries),
    ...mapChangeOrdersToPCCItems(changeOrders),
    ...mapScheduleTasksToPCCItems(scheduleTasks),
    ...mapActionItemsToPCCItems(actionItems),
  ], [rfis, drawings, submittals, workPackages, deliveries, changeOrders, scheduleTasks, actionItems]);

  const scoredFeed = useMemo(() => buildPriorityFeed(allRaw), [allRaw]);

  const filteredFeed = useMemo(() => {
    return scoredFeed.filter((item) => {
      const matchType = typeFilter === "all" || item.type === typeFilter;
      const matchSev  = severityFilter === "all" || item.severityKey === severityFilter;
      const matchTag  = tagFilter === "all"
        || (tagFilter === "OVERDUE" ? item.overdueDays > 0 : (Array.isArray(item.tags) && item.tags.includes(tagFilter)));
      return matchType && matchSev && matchTag;
    });
  }, [scoredFeed, typeFilter, severityFilter, tagFilter]);

  const kpis        = useMemo(() => buildSignalKPIs(scoredFeed, deliveries), [scoredFeed, deliveries]);
  const waitingBoard = useMemo(() => buildWaitingOnBoard(scoredFeed), [scoredFeed]);
  const executionWindows = useMemo(() => buildExecutionWindows(scoredFeed), [scoredFeed]);
  const ownerLoad = useMemo(() => buildOwnerLoad(scoredFeed), [scoredFeed]);
  const dailyBriefing = useMemo(() => buildDailyBriefing(scoredFeed, executionWindows, waitingBoard), [scoredFeed, executionWindows, waitingBoard]);
  const releaseGateActionDrafts = useMemo(
    () => buildReleaseGateActionDrafts(scoredFeed, actionItems),
    [scoredFeed, actionItems]
  );

  const createReleaseGateActionMut = useMutation({
    mutationFn: async (draft: any) => {
      setCreatingReleaseGateKey(draft.key);
      return base44.entities.ActionItem.create({
        project_id: draft.project_id || activeProject?.id,
        project_name: draft.project_name || activeProject?.name || null,
        title: draft.title,
        description: draft.description,
        assigned_to: draft.assigned_to || null,
        due_date: draft.due_date || null,
        priority: draft.priority || "High",
        status: "Open",
        category: "PCC_RELEASE_GATE",
        metadata: draft.metadata,
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pcc-action-items", activeProject?.id] });
      qc.invalidateQueries({ queryKey: ["action-items"] });
      toast.success("Release-gate action item created");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Could not create release-gate action item");
    },
    onSettled: () => setCreatingReleaseGateKey(null),
  });

  const criticalHighCount = scoredFeed.filter((i) => i.severityKey === "CRITICAL" || i.severityKey === "HIGH").length;

  // ── localStorage KPI trend caching ────────────────────────────
  const [previousKpis, setPreviousKpis] = useState<any>(null);

  useEffect(() => {
    if (!activeProject?.id || !kpis) return;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const storageKey = `pcc-kpis-${activeProject.id}`;

    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
      // Find yesterday's data (most recent date that is NOT today)
      const dates = Object.keys(stored).filter((d) => d !== today).sort().reverse();
      if (dates.length > 0) {
        setPreviousKpis(stored[dates[0]]);
      }

      // Save today's KPIs
      stored[today] = {
        critical: kpis.critical,
        highRisk: kpis.highRisk,
        overdueAll: kpis.overdueAll,
        external: kpis.external,
        blocksFab: kpis.blocksFab,
        blocksErec: kpis.blocksErec,
        coExposure: kpis.coExposure,
      };

      // Keep only last 7 days
      const allDates = Object.keys(stored).sort().reverse();
      const trimmed: Record<string, any> = {};
      allDates.slice(0, 7).forEach((d) => { trimmed[d] = stored[d]; });
      localStorage.setItem(storageKey, JSON.stringify(trimmed));
    } catch {
      // Silently ignore localStorage errors
    }
  }, [activeProject?.id, kpis]);

  // ── Navigate to source record page (deep link with search) ────
  const handleNavigate = (item: PCCItem) => {
    const page = TYPE_PAGE_MAP[item.type];
    if (!page) return;
    const baseUrl = createPageUrl(page);
    const searchTypes = ["RFI", "Drawing"];
    if (searchTypes.includes(item.type) && item.subtitle) {
      navigate(`${baseUrl}?search=${encodeURIComponent(item.subtitle)}`);
    } else {
      navigate(baseUrl);
    }
  };

  // ── Deep-link from PriorityRow title text ─────────────────────
  const handleNavigateTitle = (item: PCCItem) => {
    const search = item.subtitle || item.title;
    if (item.type === "Drawing") {
      navigate(`${createPageUrl("Drawings")}?search=${encodeURIComponent(search)}`);
    } else if (item.type === "RFI") {
      navigate(`${createPageUrl("RFIs")}?search=${encodeURIComponent(search)}`);
    } else {
      handleNavigate(item);
    }
  };

  // ── Export daily briefing CSV ──────────────────────────────────
  const exportBriefing = () => {
    const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, "-");
    const projectName = activeProject?.name || "Project";
    const rows: any[][] = [
      ["Rank", "Severity", "Type", "Title", "Score", "Due Date", "Days Overdue", "Owner", "Next Action", "Impact Tags", "Reasons"],
    ];
    scoredFeed.forEach((item, idx) => {
      rows.push([
        idx + 1,
        item.severityKey,
        item.type,
        `"${(item.title || "").replace(/"/g, '""')}"`,
        item.score,
        item.due_date ? new Date(item.due_date).toLocaleDateString("en-US") : "",
        item.overdueDays > 0 ? item.overdueDays : "",
        `"${(item.assigned_to || "Unassigned").replace(/"/g, '""')}"`,
        `"${(item.nextAction || "").replace(/"/g, '""')}"`,
        `"${(Array.isArray(item.tags) ? item.tags : []).join(", ")}"`,
        `"${(Array.isArray(item.reasons) ? item.reasons : []).join(" | ").replace(/"/g, '""')}"`,
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PCC-Briefing_${projectName.replace(/\s+/g, "-")}_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: "morning", label: "MORNING SCAN",    count: criticalHighCount },
    { id: "briefing", label: "DAILY BRIEF",    count: dailyBriefing.total },
    { id: "gate",    label: "48-HR GATE",      count: executionWindows.releaseGate.length },
    { id: "next10",  label: "10-DAY WATCH",    count: executionWindows.next10.length },
    { id: "feed",    label: "PRIORITY FEED",   count: filteredFeed.length },
    { id: "waiting", label: "WAITING ON",      count: waitingBoard.reduce((s, g) => s + g.count, 0) },
    { id: "owners",  label: "OWNER LOAD",      count: ownerLoad.length },
    { id: "risk",    label: "RISK WATCHLIST",  count: criticalHighCount },
  ];

  const noProject = !activeProject;
  const isEmpty   = scoredFeed.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg-page)" }}>

      {/* ═══ COMMAND BAR ════════════════════════════════════════════ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 60, background: "var(--bg-surface-low)", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.02em" }}>
            PCC
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Project Control Center
          </span>
          {activeProject && (
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginLeft: 4 }}>
              {activeProject.name}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Scored {lastRefresh.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "0 10px", height: 32, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer", outline: "none", textTransform: "uppercase" }}
          >
            <option value="all">All Types</option>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "0 10px", height: 32, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer", outline: "none", textTransform: "uppercase" }}
          >
            <option value="all">All Severity</option>
            {Object.keys(SEVERITY).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>

          {!isEmpty && (
            <button
              onClick={exportBriefing}
              title="Download daily briefing CSV"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--accent-muted)",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-btn)", padding: "0 12px", height: 32,
                color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10,
                fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em",
                whiteSpace: "nowrap", textTransform: "uppercase",
              }}
            >
              <Download size={12} /> Export Briefing
            </button>
          )}
        </div>
      </div>

      {/* ═══ SIGNAL STRIP ══════════════════════════════════════════ */}
      <div style={{ display: "flex", gap: 8, padding: "10px 24px", background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)", flexShrink: 0, flexWrap: "wrap" }}>
        <SignalCard
          label="CRITICAL"
          value={kpis.critical}
          color={kpis.critical > 0 ? SEVERITY.CRITICAL.color : "var(--text-muted)"}
          sub="items"
          onClick={() => { setSeverityFilter(severityFilter === "CRITICAL" ? "all" : "CRITICAL"); setTagFilter("all"); setActiveTab("feed"); }}
          active={severityFilter === "CRITICAL"}
          previous={previousKpis?.critical}
          invertTrend
        />
        <SignalCard
          label="HIGH RISK"
          value={kpis.highRisk}
          color={kpis.highRisk > 0 ? SEVERITY.HIGH.color : "var(--text-muted)"}
          sub="items"
          onClick={() => { setSeverityFilter(severityFilter === "HIGH" ? "all" : "HIGH"); setTagFilter("all"); setActiveTab("feed"); }}
          active={severityFilter === "HIGH"}
          previous={previousKpis?.highRisk}
          invertTrend
        />
        <SignalCard
          label="OVERDUE"
          value={kpis.overdueAll}
          color={kpis.overdueAll > 0 ? "var(--status-error)" : "var(--text-muted)"}
          sub="items"
          onClick={() => { setTagFilter(tagFilter === "OVERDUE" ? "all" : "OVERDUE"); setTypeFilter("all"); setSeverityFilter("all"); setActiveTab("feed"); }}
          active={tagFilter === "OVERDUE"}
          previous={previousKpis?.overdueAll}
          invertTrend
        />
        <SignalCard
          label="EXTERNAL WAIT"
          value={kpis.external}
          color={kpis.external > 0 ? "#8898A8" : "var(--text-muted)"}
          sub="items"
          onClick={() => { setActiveTab("waiting"); setTagFilter("all"); }}
          previous={previousKpis?.external}
          invertTrend
        />
        <SignalCard
          label="BLOCKS FAB"
          value={kpis.blocksFab}
          color={kpis.blocksFab > 0 ? "var(--status-review)" : "var(--text-muted)"}
          sub="items"
          onClick={() => { setTagFilter(tagFilter === "BLOCKS_FAB" ? "all" : "BLOCKS_FAB"); setTypeFilter("all"); setSeverityFilter("all"); setActiveTab("feed"); }}
          active={tagFilter === "BLOCKS_FAB"}
          previous={previousKpis?.blocksFab}
          invertTrend
        />
        <SignalCard
          label="BLOCKS ERECTION"
          value={kpis.blocksErec}
          color={kpis.blocksErec > 0 ? "#06B6D4" : "var(--text-muted)"}
          sub="items"
          onClick={() => { setTagFilter(tagFilter === "BLOCKS_ERECTION" ? "all" : "BLOCKS_ERECTION"); setTypeFilter("all"); setSeverityFilter("all"); setActiveTab("feed"); }}
          active={tagFilter === "BLOCKS_ERECTION"}
          previous={previousKpis?.blocksErec}
          invertTrend
        />
        <SignalCard
          label="CO EXPOSURE"
          value={kpis.coExposure > 0 ? `$${(kpis.coExposure / 1000).toFixed(0)}k` : "$0"}
          color={kpis.coExposure > 50000 ? "var(--status-error)" : kpis.coExposure > 10000 ? "var(--status-warning)" : "var(--text-muted)"}
          sub="open COs"
          onClick={() => { setTypeFilter(typeFilter === "ChangeOrder" ? "all" : "ChangeOrder"); setSeverityFilter("all"); setTagFilter("all"); setActiveTab("feed"); }}
          active={typeFilter === "ChangeOrder"}
          previous={previousKpis?.coExposure != null ? (previousKpis.coExposure > 0 ? parseInt((previousKpis.coExposure / 1000).toFixed(0), 10) : 0) : undefined}
          invertTrend
        />
      </div>

      {/* ═══ SPLIT-PANE: Left (tabs+content) / Right (health summary) ═══ */}
      <div className="pcc-split-pane" style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "3fr 2fr", gap: 0 }}>
        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes pccPulse {
            0%, 100% { box-shadow: 0 0 20px var(--pulse-color, var(--status-error)30), 0 0 6px var(--pulse-color, var(--status-error)18); }
            50% { box-shadow: 0 0 28px var(--pulse-color, var(--status-error)50), 0 0 10px var(--pulse-color, var(--status-error)30), 0 0 3px var(--pulse-color, var(--status-error)10); }
          }
          .signal-card-pulse { animation: pccPulse 2.5s ease-in-out infinite; }
          @media (max-width: 900px) {
            .pcc-split-pane { grid-template-columns: 1fr !important; }
          }
        `}</style>
        <style>{`
          .pcc-split-pane [title*="Click to filter"]:hover { transform: translateY(-1px); filter: brightness(1.05); }
        `}</style>

        {/* ─── LEFT COLUMN: Tab bar + Tab content ─── */}
        <div className="pcc-split-left" style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid var(--divider)" }}>

          {/* Tab bar — 52px height for touch-friendly targets */}
          <div style={{ display: "flex", alignItems: "stretch", gap: 0, padding: "0 24px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)", flexShrink: 0, height: 52 }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.10em",
                  padding: "0 18px",
                  background: "transparent",
                  border: "none",
                  borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                  color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "color 0.15s ease, border-color 0.2s ease",
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    background: activeTab === tab.id ? "rgba(200,155,32,0.15)" : "var(--hover-bg)",
                    color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)",
                    border: `1px solid ${activeTab === tab.id ? "rgba(200,155,32,0.30)" : "var(--bg-surface-high)"}`,
                    padding: "1px 6px", borderRadius: 4,
                    transition: "background 0.15s, color 0.15s",
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* No project selected */}
            {noProject && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, color: "var(--text-muted)" }}>⊙</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.12em" }}>SELECT A PROJECT TO LOAD PCC</div>
              </div>
            )}

            {/* Loading state */}
            {!noProject && isLoading && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
                <div style={{ width: 28, height: 28, border: "3px solid var(--border-default)", borderTop: "3px solid var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em" }}>SCORING {activeProject?.name || "PROJECT"} DATA...</div>
              </div>
            )}

            {/* Empty state */}
            {!noProject && !isLoading && isEmpty && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, color: "rgba(0,214,143,0.20)" }}>✓</div>
                <EmptyStateAction
                  message="No open items — project is clear. Add RFIs, drawings, deliveries, or tasks to populate the control center."
                  actions={[
                    { label: "+ Add RFI", onClick: () => navigate(createPageUrl("RFIs")) },
                    { label: "Upload Documents", onClick: () => navigate(createPageUrl("Documents")), secondary: true },
                  ]}
                />
              </div>
            )}

            {/* Morning Scan — with AI summary banner */}
            {!noProject && !isLoading && activeTab === "morning" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "0 20px", flexShrink: 0 }}>
                  <AISummaryBanner
                    kpis={kpis}
                    onClickCritical={() => { setSeverityFilter("CRITICAL"); setTagFilter("all"); setActiveTab("feed"); }}
                    onClickOverdue={() => { setTagFilter("OVERDUE"); setSeverityFilter("all"); setTypeFilter("all"); setActiveTab("feed"); }}
                    onClickBlocksFab={() => { setTagFilter("BLOCKS_FAB"); setSeverityFilter("all"); setTypeFilter("all"); setActiveTab("feed"); }}
                    onClickCO={() => { setTypeFilter("ChangeOrder"); setSeverityFilter("all"); setTagFilter("all"); setActiveTab("feed"); }}
                  />
                </div>
                <MorningScan
                  items={scoredFeed}
                  onSelect={(item) => setDrawerItem(item)}
                  onViewBriefing={() => setActiveTab("briefing")}
                  onViewFeed={() => setActiveTab("feed")}
                />
              </div>
            )}

            {!noProject && !isLoading && activeTab === "briefing" && (
              <DailyBriefing briefing={dailyBriefing} onSelect={setDrawerItem} />
            )}

            {!noProject && !isLoading && activeTab === "gate" && (
              <ExecutionWindow
                title="48-HOUR RELEASE GATE"
                subtitle="Release-blocking confirmations before fabrication, shipping, delivery, or installation."
                items={executionWindows.releaseGate}
                empty="No release-gate blockers in the next 48 hours — fabrication and shipping are unblocked"
                emptyActions={[
                  { label: "View 10-Day Watch", onClick: () => setActiveTab("next10") },
                  { label: "Check Deliveries", onClick: () => navigate(createPageUrl("Deliveries")), secondary: true },
                ]}
                onSelect={setDrawerItem}
                beforeList={(
                  <ReleaseGateActionDrafts
                    drafts={releaseGateActionDrafts}
                    creatingKey={creatingReleaseGateKey}
                    onCreate={(draft) => createReleaseGateActionMut.mutate(draft)}
                  />
                )}
              />
            )}

            {!noProject && !isLoading && activeTab === "next10" && (
              <ExecutionWindow
                title="NEXT 10-DAY RISK WATCH"
                subtitle="Near-term work that can disrupt fabrication, shipping, erection, or cost."
                items={executionWindows.next10}
                empty="No risk-window items in the next 10 days — near-term schedule is clear"
                emptyActions={[
                  { label: "View Full Schedule", onClick: () => navigate(createPageUrl("Schedule")) },
                  { label: "Review Work Packages", onClick: () => navigate(createPageUrl("WorkPackages")), secondary: true },
                ]}
                onSelect={setDrawerItem}
              />
            )}

            {/* Priority Feed — card layout (no grid header) */}
            {!noProject && !isLoading && !isEmpty && activeTab === "feed" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
                {/* Active tag filter chip */}
                {tagFilter !== "all" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--divider)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em" }}>SHOWING:</span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                      padding: "3px 10px", borderRadius: 4,
                      background: "rgba(200,155,32,0.10)", color: "var(--accent)",
                      border: "1px solid rgba(200,155,32,0.25)",
                    }}>
                      {tagFilter === "OVERDUE" ? "OVERDUE ITEMS" : IMPACT_TAGS[tagFilter]?.label || tagFilter}
                    </span>
                    <button
                      onClick={() => setTagFilter("all")}
                      style={{
                        background: "none", border: "1px solid var(--border-default)", borderRadius: 4,
                        padding: "2px 8px", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9,
                        color: "var(--text-muted)", letterSpacing: "0.06em",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                      onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                    >
                      CLEAR
                    </button>
                  </div>
                )}
                {filteredFeed.length === 0 ? (
                  <EmptyStateAction
                    icon="⊘"
                    message="No items match the current filters"
                    actions={[
                      { label: "Clear Filters", onClick: () => { setTypeFilter("all"); setSeverityFilter("all"); setTagFilter("all"); } },
                    ]}
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 12px" }}>
                    {filteredFeed.map((item) => (
                      <PriorityRow
                        key={item.id}
                        item={item}
                        expanded={expandedId === item.id}
                        onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        onOpenDrawer={setDrawerItem}
                        onNavigateTitle={handleNavigateTitle}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Waiting On Board */}
            {!noProject && !isLoading && activeTab === "waiting" && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <WaitingOnBoard
                  board={waitingBoard}
                  onViewRFIs={() => navigate(createPageUrl("RFIs"))}
                />
              </div>
            )}

            {!noProject && !isLoading && activeTab === "owners" && (
              <OwnerLoadBoard
                rows={ownerLoad}
                onCreateActionItem={() => navigate(createPageUrl("ActionItems"))}
              />
            )}

            {/* Risk Watchlist */}
            {!noProject && !isLoading && activeTab === "risk" && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <RiskWatchlist
                  items={scoredFeed}
                  onSelect={setDrawerItem}
                  onViewSchedule={() => navigate(createPageUrl("Schedule"))}
                />
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT COLUMN: Health Summary ─── */}
        <div className="pcc-split-right" style={{ overflow: "auto", padding: 12 }}>
          {!noProject && !isLoading && !isEmpty ? (
            <HealthSummaryPanel
              scoredFeed={scoredFeed}
              waitingBoard={waitingBoard}
              kpis={kpis}
              onClickOverdue={() => { setTagFilter("OVERDUE"); setSeverityFilter("all"); setTypeFilter("all"); setActiveTab("feed"); }}
              onClickBlocksFab={() => { setTagFilter("BLOCKS_FAB"); setSeverityFilter("all"); setTypeFilter("all"); setActiveTab("feed"); }}
              onClickSeverity={(sev) => { setSeverityFilter(sev); setTagFilter("all"); setTypeFilter("all"); setActiveTab("feed"); }}
            />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em" }}>
                {noProject ? "NO PROJECT" : isLoading ? "LOADING..." : "NO DATA"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      <DetailDrawer item={drawerItem} onClose={() => setDrawerItem(null)} onNavigate={handleNavigate} />
    </div>
  );
}
