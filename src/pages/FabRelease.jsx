import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import WPFormModal from "../components/workpackages/WPFormModal";
import { CommandBar, KpiTile } from "@/components/design-system";
import { useProjectId } from "@/hooks/useProjectId";

const FAB_STAGES = [
  { id: "drawings_approved", label: "Drawings Approved", short: "DWG APRVD", color: "var(--accent)" },
  { id: "material_on_hand", label: "Material On Hand", short: "MATERIAL", color: "var(--secondary)" },
  { id: "shop_released", label: "Released to Shop", short: "RELEASED", color: "var(--status-warning)" },
  { id: "in_fabrication", label: "In Fabrication", short: "IN FAB", color: "var(--tertiary)" },
  { id: "fabricated", label: "Fabricated", short: "FABRICATED", color: "var(--status-info)" },
  { id: "finish_treatment", label: "Paint / Galv", short: "FINISH", color: "#B45309" },
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
  const projectId = useProjectId();

  const [view, setView] = useState("pipeline");
  const [stageFilter, setStageFilter] = useState("all");
  const [editingWP, setEditingWP] = useState(null);
  const [showNewWP, setShowNewWP] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const qc = useQueryClient();

  // restore persisted view/filter prefs, then let URL search params
  // override (so deep-links from the project dashboard / Work Packages
  // page can target a specific stage or view without losing the user's
  // saved defaults across cold-loads).
  useEffect(() => {
    const savedView = localStorage.getItem("fabView");
    const savedStage = localStorage.getItem("fabStageFilter");
    const savedHours = localStorage.getItem("fabShowHours");
    if (savedView) setView(savedView);
    if (savedStage) setStageFilter(savedStage);
    if (savedHours) setShowHours(savedHours === "true");

    const urlView = searchParams.get("view");
    const urlStage = searchParams.get("stage");
    if (urlView && ["pipeline", "list", "board"].includes(urlView)) {
      setView(urlView);
    }
    if (urlStage) {
      // Accept the canonical id ("in_fabrication"), the short label
      // ("IN FAB"), or "all" — anything else is silently ignored so a
      // typo'd URL doesn't blank the list.
      const matched =
        urlStage === "all" ? "all"
        : FAB_STAGES.find((s) => s.id === urlStage || s.short.toLowerCase() === urlStage.toLowerCase())?.id;
      if (matched) setStageFilter(matched);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: wps = [], isLoading } = useQuery({
    queryKey: ["wps-fab", projectId],
    queryFn: () => (projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  const completeMut = useMutation({
    mutationFn: (id) =>
      base44.entities.WorkPackage.update(id, {
        status: "Complete",
        percent_complete: 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wps-fab", projectId] });
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
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
      className="sbd-card sbd-card-hover"
      style={{
        padding: "8px 10px",
        marginBottom: 6,
        cursor: "pointer",
      }}
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
              fontSize: 9,
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
              fontSize: 9,
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
              fontSize: 9,
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
        className="sbd-card"
        style={{
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
      <div className="sbd-card" style={{ borderTop: `3px solid ${color}`, padding: 10, minHeight: 320 }}>
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
                className="sbd-card sbd-card-hover"
                style={{
                  padding: 10,
                  cursor: "pointer",
                }}
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
      className="sbd-card"
      style={{
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
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: stage.color }}>
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
            className="sbd-card"
            style={{
              marginTop: 10,
              padding: 0,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <CommandBar
        eyebrow={activeProject?.name || "PROJECT"}
        title="Fabrication"
        count={derivedWPs.length}
        unit={` · ${totalTons.toFixed(1)}T`}
        subtitle="Drawings Approved → Material → Released → In Fab → Fabricated → Finish → Ready to Ship"
      >
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {[
            { id: "pipeline", label: "Pipeline" },
            { id: "list", label: "List" },
            { id: "board", label: "Board" },
          ].map((v, i) => (
            <button
              key={v.id}
              onClick={() => { setView(v.id); localStorage.setItem("fabView", v.id); }}
              style={{
                padding: "6px 12px",
                border: "none",
                borderRight: i < 2 ? "1px solid var(--border-default)" : "none",
                background: view === v.id ? "var(--accent-muted)" : "transparent",
                color: view === v.id ? "var(--accent)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowNewWP(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)", color: "var(--bg-base)", border: "none",
            borderRadius: "var(--radius-btn)", padding: "8px 14px",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> Log Update
        </button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total Packages" value={stats.total}          color="var(--accent)" />
        <KpiTile compact label="Total Tonnage"  value={`${stats.totalTons}T`} color="var(--phase-detailing)" />
        <KpiTile compact label="In Fabrication" value={stats.inFab}          color="var(--phase-fabrication)" />
        <KpiTile compact label="Ready to Ship"  value={stats.rts}            color="var(--status-success)" />
        <KpiTile compact label="On Hold"        value={stats.onHold}         color="var(--status-error)" />
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
                color: stageFilter === "all" ? "var(--accent-text)" : "var(--text-secondary)",
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
                  color: stageFilter === s.id ? "var(--accent-text)" : "var(--text-secondary)",
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

          <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
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
