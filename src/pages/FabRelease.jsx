import React, { useMemo, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "../components/shared/useProjectContext";
import { toast } from "sonner";
import WPFormModal from "../components/workpackages/WPFormModal";
import StatusBadge from "../components/shared/StatusBadge";

const FAB_STAGES = [
  { id: "drawings_approved", label: "Drawings Approved", short: "DWG APRVD", color: "var(--accent)" },
  { id: "material_on_hand", label: "Material On Hand", short: "MATERIAL", color: "#44E2CD" },
  { id: "shop_released", label: "Released to Shop", short: "RELEASED", color: "var(--status-warning)" },
  { id: "in_fabrication", label: "In Fabrication", short: "IN FAB", color: "#FFB95F" },
  { id: "fabricated", label: "Fabricated", short: "FABRICATED", color: "var(--status-info)" },
  { id: "finish_treatment", label: "Paint / Galv", short: "FINISH", color: "#C084FC" },
  { id: "ready_to_ship", label: "Ready to Ship", short: "RTS", color: "var(--status-success)" },
];

const STATUS_ORDER = ["Not Started", "In Progress", "Complete", "On Hold"];
const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

function getFabStage(wp) {
  const phase = wp.phase || "";
  const status = wp.status || "";
  const pct = Number(wp.percent_complete) || 0;

  if (["Delivery", "Installation", "Closeout"].includes(phase)) return "ready_to_ship";

  if (phase === "Fabrication") {
    if (status === "Complete" || pct === 100) return "ready_to_ship";
    if (pct >= 75) return "finish_treatment";
    if (pct >= 25 || status === "In Progress") return "in_fabrication";
    if (wp.released_date) return "shop_released";
    if (wp.vif_confirmed && wp.load_list_complete) return "material_on_hand";
    return "drawings_approved";
  }

  if (phase === "Detailing") {
    if (status === "Complete") return "material_on_hand";
    return "drawings_approved";
  }

  return "drawings_approved";
}

const clampPct = (p) => Math.min(100, Math.max(0, Number(p) || 0));
const formatDateUTC = (d) =>
  d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";

export default function FabRelease() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;

  const [view, setView] = useState("pipeline");
  const [stageFilter, setStageFilter] = useState("all");
  const [editingWP, setEditingWP] = useState(null);
  const [showNewWP, setShowNewWP] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const qc = useQueryClient();

  // restore persisted view/filter prefs
  useEffect(() => {
    const savedView = localStorage.getItem("fabView");
    const savedStage = localStorage.getItem("fabStageFilter");
    const savedHours = localStorage.getItem("fabShowHours");
    if (savedView) setView(savedView);
    if (savedStage) setStageFilter(savedStage);
    if (savedHours) setShowHours(savedHours === "true");
  }, []);

  const { data: wps = [], isLoading } = useQuery({
    queryKey: ["wps-fab", projectId],
    queryFn: () => (projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const completeMut = useMutation({
    mutationFn: (id) =>
      base44.entities.WorkPackage.update(id, {
        status: "Complete",
        percent_complete: 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wps-fab", projectId] });
      toast.success("Work package marked complete");
    },
    onError: () => toast.error("Update failed"),
  });

  const derivedWPs = useMemo(
    () =>
      wps.map((wp) => ({
        ...wp,
        fab_stage: getFabStage(wp),
        percent_complete: clampPct(wp.percent_complete),
      })),
    [wps]
  );

  const totalTons = useMemo(
    () => derivedWPs.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0),
    [derivedWPs]
  );

  const stageTotals = useMemo(() => {
    const map = {};
    FAB_STAGES.forEach((s, idx) => {
      const tons = derivedWPs
        .filter((wp) => FAB_STAGES.findIndex((st) => st.id === wp.fab_stage) >= idx)
        .reduce((sum, wp) => sum + (Number(wp.tonnage) || 0), 0);
      map[s.id] = tons;
    });
    return map;
  }, [derivedWPs]);

  const stats = useMemo(() => {
    const inFab = derivedWPs.filter(
      (wp) => wp.fab_stage === "in_fabrication" || wp.fab_stage === "shop_released"
    ).length;
    const rts = derivedWPs.filter((wp) => wp.fab_stage === "ready_to_ship").length;
    const onHold = derivedWPs.filter((wp) => wp.status === "On Hold").length;
    return {
      total: derivedWPs.length,
      totalTons: totalTons.toFixed(1),
      inFab,
      rts,
      onHold,
    };
  }, [derivedWPs, totalTons]);

  const filteredByStage = useMemo(() => {
    if (stageFilter === "all") return derivedWPs;
    return derivedWPs.filter((wp) => wp.fab_stage === stageFilter);
  }, [derivedWPs, stageFilter]);

  const hoursRows = useMemo(
    () =>
      derivedWPs.filter(
        (wp) =>
          Number(wp.shop_hours_budget || 0) > 0 ||
          Number(wp.shop_hours_actual || 0) > 0 ||
          Number(wp.field_hours_budget || 0) > 0 ||
          Number(wp.field_hours_actual || 0) > 0
      ),
    [derivedWPs]
  );

  const stageColor = (stageId) => FAB_STAGES.find((s) => s.id === stageId)?.color || "var(--accent)";

  const StageBadge = ({ stage }) => (
    <span
      style={{
        background: `${stageColor(stage)}18`,
        color: stageColor(stage),
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: "var(--radius-badge)",
      }}
    >
      {FAB_STAGES.find((s) => s.id === stage)?.short || stage}
    </span>
  );

  const WPCard = ({ wp }) => (
    <div
      onClick={() => setEditingWP(wp)}
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "8px 10px",
        marginBottom: 6,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-mid)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface-low)")}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: stageColor(wp.fab_stage) }}>
          {wp.wp_number || wp.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 80,
              height: 6,
              background: "var(--bg-surface-high)",
              borderRadius: "var(--radius-card)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${clampPct(wp.percent_complete)}%`,
                height: "100%",
                background: stageColor(wp.fab_stage),
              }}
            />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", fontWeight: 700 }}>
            {clampPct(wp.percent_complete)}%
          </span>
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginTop: 4,
          lineHeight: 1.3,
        }}
      >
        {wp.name || "Untitled Work Package"}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
        {Number(wp.tonnage || 0).toFixed(1)}T · Crew: {wp.crew || "—"} · Released: {formatDateUTC(wp.released_date)}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
        {wp.vif_confirmed && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 7,
              fontWeight: 700,
              color: "var(--status-success)",
              background: "var(--success-muted)",
              padding: "2px 4px",
              borderRadius: 2,
            }}
          >
            VIF ✓
          </span>
        )}
        {wp.load_list_complete && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 7,
              fontWeight: 700,
              color: "var(--status-success)",
              background: "var(--success-muted)",
              padding: "2px 4px",
              borderRadius: 2,
            }}
          >
            LL ✓
          </span>
        )}
        {wp.status === "On Hold" && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 7,
              fontWeight: 700,
              color: "var(--status-error)",
              background: "var(--danger-muted)",
              padding: "2px 4px",
              borderRadius: 2,
            }}
          >
            ON HOLD
          </span>
        )}
      </div>
    </div>
  );

  const PipelineColumn = ({ stage }) => {
    const items = derivedWPs.filter((wp) => wp.fab_stage === stage.id);
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-card)",
          borderTop: `3px solid ${stage.color}`,
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          height: 520,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: stage.color }}>
            {stage.label.toUpperCase()}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
            {items.length} · {stageTotals[stage.id]?.toFixed(1) || "0.0"}T
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 12, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
              NO WPS
            </div>
          ) : (
            items.map((wp) => <WPCard key={wp.id} wp={wp} />)
          )}
        </div>
      </div>
    );
  };

  const ListRow = ({ wp }) => {
    const pct = clampPct(wp.percent_complete);
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "70px 1fr 130px 60px 80px 100px 80px 80px",
          padding: "11px 16px",
          alignItems: "center",
          borderBottom: "1px solid var(--divider)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{wp.wp_number || "—"}</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wp.name || "Untitled WP"}</div>
        <div>
          <StageBadge stage={wp.fab_stage} />
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{Number(wp.tonnage || 0).toFixed(1)}T</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: pct === 100 ? "var(--status-success)" : pct > 0 ? "var(--accent)" : "var(--text-muted)" }}>
          {pct}%
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>{wp.crew || "—"}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{formatDateUTC(wp.released_date)}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setEditingWP(wp)}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: 2,
              padding: "4px 8px",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            EDIT
          </button>
          {wp.status !== "Complete" && (
            <button
              onClick={() => completeMut.mutate(wp.id)}
              style={{
                background: "var(--success-muted)",
                border: "1px solid var(--success-border)",
                borderRadius: 2,
                padding: "4px 8px",
                color: "var(--status-success)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✓ COMPLETE
            </button>
          )}
        </div>
      </div>
    );
  };

  const BoardColumn = ({ status }) => {
    const color = STATUS_COLORS[status] || "var(--text-muted)";
    const items = derivedWPs.filter((wp) => wp.status === status);
    return (
      <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-card)", borderTop: `3px solid ${color}`, padding: 10, minHeight: 320 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color }}>{status.toUpperCase()}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 12, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>NO WPS</div>
        ) : (
          items.map((wp) => (
            <div key={wp.id} style={{ marginBottom: 8 }}>
              <div
                onClick={() => setEditingWP(wp)}
                style={{
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-card)",
                  padding: 10,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-mid)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface-low)")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: stageColor(wp.fab_stage) }}>
                    {wp.wp_number || wp.name}
                  </div>
                  <StageBadge stage={wp.fab_stage} />
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{wp.name || "Untitled WP"}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
                  {Number(wp.tonnage || 0).toFixed(1)}T · {clampPct(wp.percent_complete)}%
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const TonnagePipeline = () => (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 20px",
        marginTop: 14,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-muted)" }}>TONNAGE THROUGH SHOP PIPELINE</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text-muted)" }}>
          {Number(totalTons).toFixed(1)}T TOTAL
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${FAB_STAGES.length}, 1fr)`, gap: 12 }}>
        {FAB_STAGES.map((stage) => {
          const tons = stageTotals[stage.id] || 0;
          const pct = totalTons > 0 ? (tons / totalTons) * 100 : 0;
          return (
            <div key={stage.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.12em", color: stage.color }}>
                {stage.short}
              </div>
              <div style={{ height: 6, borderRadius: "var(--radius-card)", background: "var(--bg-surface-high)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: stage.color }} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{tons.toFixed(1)}T</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const ShopHoursPanel = () => {
    const totals = hoursRows.reduce(
      (acc, wp) => {
        acc.sb += Number(wp.shop_hours_budget || 0);
        acc.sa += Number(wp.shop_hours_actual || 0);
        acc.fb += Number(wp.field_hours_budget || 0);
        acc.fa += Number(wp.field_hours_actual || 0);
        return acc;
      },
      { sb: 0, sa: 0, fb: 0, fa: 0 }
    );
    const varianceColor = (v) => (v > 0 ? "var(--status-error)" : "var(--status-success)");
    return (
      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => {
            setShowHours((v) => {
              localStorage.setItem("fabShowHours", (!v).toString());
              return !v;
            });
          }}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-btn)",
            padding: "6px 10px",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          {showHours ? "▾" : "▸"} SHOP HOURS SUMMARY
        </button>
        {showHours && (
          <div
            style={{
              marginTop: 10,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 90px 90px 90px 90px 90px 90px",
                padding: "10px 12px",
                background: "var(--bg-surface-secondary)",
                borderBottom: "1px solid var(--divider)",
                gap: 8,
              }}
            >
              {["WP #", "Name", "Shop Budget", "Shop Actual", "Shop Var", "Field Budget", "Field Actual", "Field Var"].map((h) => (
                <div
                  key={h}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}
                >
                  {h}
                </div>
              ))}
            </div>
            {hoursRows.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                NO HOURS ENTERED
              </div>
            ) : (
              hoursRows.map((wp) => {
                const sVar = Number(wp.shop_hours_actual || 0) - Number(wp.shop_hours_budget || 0);
                const fVar = Number(wp.field_hours_actual || 0) - Number(wp.field_hours_budget || 0);
                return (
                  <div
                    key={wp.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 90px 90px 90px 90px 90px 90px",
                      padding: "9px 12px",
                      alignItems: "center",
                      borderBottom: "1px solid var(--divider)",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>{wp.wp_number || "—"}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)" }}>{wp.name || "Untitled WP"}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{Number(wp.shop_hours_budget || 0).toFixed(1)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{Number(wp.shop_hours_actual || 0).toFixed(1)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: varianceColor(sVar), fontWeight: 700 }}>
                      {sVar > 0 ? `+${sVar.toFixed(1)}` : sVar.toFixed(1)}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{Number(wp.field_hours_budget || 0).toFixed(1)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{Number(wp.field_hours_actual || 0).toFixed(1)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: varianceColor(fVar), fontWeight: 700 }}>
                      {fVar > 0 ? `+${fVar.toFixed(1)}` : fVar.toFixed(1)}
                    </div>
                  </div>
                );
              })
            )}
            {hoursRows.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 90px 90px 90px 90px 90px 90px",
                  padding: "10px 12px",
                  background: "var(--bg-surface-secondary)",
                  gap: 8,
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)" }}>TOTALS</div>
                <div />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", fontWeight: 700 }}>{totals.sb.toFixed(1)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", fontWeight: 700 }}>{totals.sa.toFixed(1)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: varianceColor(totals.sa - totals.sb), fontWeight: 700 }}>
                  {totals.sa - totals.sb > 0 ? `+${(totals.sa - totals.sb).toFixed(1)}` : (totals.sa - totals.sb).toFixed(1)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", fontWeight: 700 }}>{totals.fb.toFixed(1)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", fontWeight: 700 }}>{totals.fa.toFixed(1)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: varianceColor(totals.fa - totals.fb), fontWeight: 700 }}>
                  {totals.fa - totals.fb > 0 ? `+${(totals.fa - totals.fb).toFixed(1)}` : (totals.fa - totals.fb).toFixed(1)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Select a project to view Fabrication
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: 48,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
        }}
      >
        LOADING WORK PACKAGES...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 24,
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Fabrication
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              margin: 0,
              marginTop: 2,
            }}
          >
            {activeProject?.name || "Project"} · {derivedWPs.length} Work Packages · {totalTons.toFixed(1)}T
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowNewWP(true)}
            style={{
              background: "var(--accent)",
              border: "1px solid var(--accent)",
              color: "#0b1021",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "8px 14px",
              borderRadius: "var(--radius-btn)",
              cursor: "pointer",
            }}
          >
            + Log Update
          </button>
          <div style={{ display: "flex", border: "1px solid var(--divider)", borderRadius: 8, overflow: "hidden" }}>
            {[
              { id: "pipeline", label: "Pipeline" },
              { id: "list", label: "List" },
              { id: "board", label: "Board" },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setView(v.id);
                  localStorage.setItem("fabView", v.id);
                }}
                style={{
                  padding: "6px 12px",
                  border: "none",
                  background: view === v.id ? "var(--accent)" : "var(--bg-surface-low)",
                  color: view === v.id ? "#0b1021" : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "Total Packages", value: stats.total, color: "var(--accent)" },
          { label: "Total Tonnage", value: `${stats.totalTons}T`, color: "var(--status-info)" },
          { label: "In Fabrication", value: stats.inFab, color: "var(--status-warning)" },
          { label: "Ready to Ship", value: stats.rts, color: "var(--status-success)" },
          { label: "On Hold", value: stats.onHold, color: "var(--status-error)" },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              padding: "12px",
              borderTop: `2px solid ${card.color}`,
            }}
          >
            <div style={{ fontFamily: "var(--font-body)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              {card.label}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <TonnagePipeline />

      {view === "pipeline" && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${FAB_STAGES.length}, 1fr)`, gap: 12 }}>
          {FAB_STAGES.map((s) => (
            <PipelineColumn key={s.id} stage={s} />
          ))}
        </div>
      )}

      {view === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                setStageFilter("all");
                localStorage.setItem("fabStageFilter", "all");
              }}
              style={{
                background: stageFilter === "all" ? "var(--accent)" : "var(--bg-surface-low)",
                color: stageFilter === "all" ? "#0b1021" : "var(--text-secondary)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "5px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              All
            </button>
            {FAB_STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setStageFilter(s.id);
                  localStorage.setItem("fabStageFilter", s.id);
                }}
                style={{
                  background: stageFilter === s.id ? "var(--accent)" : "var(--bg-surface-low)",
                  color: stageFilter === s.id ? "#0b1021" : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "var(--radius-btn)",
                  padding: "5px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {s.short}
              </button>
            ))}
          </div>

          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "70px 1fr 130px 60px 80px 100px 80px 80px",
                padding: "12px 16px",
                background: "var(--bg-surface-secondary)",
                borderBottom: "1px solid var(--divider)",
                gap: 12,
              }}
            >
              {["WP #", "Name", "Stage", "Tons", "%", "Crew", "Released", "Actions"].map((h) => (
                <div
                  key={h}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}
                >
                  {h}
                </div>
              ))}
            </div>
            {filteredByStage.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
                NO WORK PACKAGES IN THIS STAGE
              </div>
            ) : (
              filteredByStage.map((wp) => <ListRow key={wp.id} wp={wp} />)
            )}
          </div>
        </div>
      )}

      {view === "board" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {STATUS_ORDER.map((s) => (
            <BoardColumn key={s} status={s} />
          ))}
        </div>
      )}

      <ShopHoursPanel />

      {(editingWP || showNewWP) && (
        <WPFormModal
          wp={editingWP}
          onClose={() => {
            setEditingWP(null);
            setShowNewWP(false);
            qc.invalidateQueries({ queryKey: ["wps-fab", projectId] });
          }}
        />
      )}
    </div>
  );
}
