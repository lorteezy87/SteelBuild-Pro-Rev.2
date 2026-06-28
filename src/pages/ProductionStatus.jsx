/**
 * ProductionStatus.jsx — per-piece fabrication status imported from Tekla EPM /
 * FabSuite (Phase 4). Answers the §18 questions "what's fabricated?" / "what's
 * ready to ship / erect?" from the shop's own production-control export.
 *
 * Read view + the staged CSV import. Pure rollup over piece_production; writes
 * go through ProductionStatusImportModal → the typed repository (RLS: field+).
 *
 * command_ui flag: mounts ProductionStatusControlCenter (light command-kit skin)
 * instead of the classic dark layout. Data, modals, and mutations are shared.
 */

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Upload, Boxes } from "lucide-react";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { CommandBar } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { listPieceProduction } from "@/lib/production/repository";
import { PRODUCTION_STAGES } from "@/lib/importProductionStatus";
import ProductionStatusImportModal from "@/components/production/ProductionStatusImportModal";
import TeklaEpmImportModal from "@/components/production/TeklaEpmImportModal";
import { useFlag } from "@/hooks/useFeatureFlag";
import ProductionStatusControlCenter from "./productionStatus/ProductionStatusControlCenter";

/** CSV export — reuses the same field order as the DataTable columns. */
function exportProductionCSV(rows) {
  const headers = ["Piece Mark", "Assembly", "Seq", "Area", "Stage", "% Complete", "Qty", "Ship Date", "Weight", "External Ref"];
  const data = rows.map((p) => [
    p.piece_mark,
    p.assembly_mark || "",
    p.sequence_number || "",
    p.erection_area || "",
    p.status || "",
    p.percent_complete ?? "",
    p.quantity ?? "",
    p.ship_date || "",
    p.weight ?? "",
    p.external_ref || "",
  ]);
  const csv = [headers, ...data]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "production-status.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const STAGE_COLOR = {
  "Not Started": "var(--text-muted)",
  Cut: "var(--status-info)",
  Fit: "var(--status-info)",
  Weld: "var(--status-warning)",
  Clean: "var(--status-warning)",
  Paint: "var(--accent)",
  Shipped: "var(--status-success)",
};

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

export default function ProductionStatus() {
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();
  const commandUi = useFlag("command_ui");
  const [showImport, setShowImport] = useState(false);
  const [showEpmImport, setShowEpmImport] = useState(false);

  // command_ui filter state — not used by the classic path
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");

  const { data: pieces = [], isLoading } = useQuery({
    queryKey: ["piece-production", projectId],
    queryFn: () => listPieceProduction(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Filtered list for the command_ui DataTable
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pieces.filter((p) => {
      if (stageFilter !== "All" && p.status !== stageFilter) return false;
      if (!q) return true;
      return (
        (p.piece_mark || "").toLowerCase().includes(q) ||
        (p.assembly_mark || "").toLowerCase().includes(q) ||
        (p.erection_area || "").toLowerCase().includes(q) ||
        (p.sequence_number || "").toLowerCase().includes(q)
      );
    });
  }, [pieces, search, stageFilter]);

  const rollup = useMemo(() => {
    const byStage = Object.fromEntries(PRODUCTION_STAGES.map((s) => [s, 0]));
    let unknown = 0;
    let pctSum = 0;
    let pctCount = 0;
    for (const p of pieces) {
      if (p.status && byStage[p.status] !== undefined) byStage[p.status] += 1;
      else unknown += 1;
      if (p.percent_complete !== null && p.percent_complete !== undefined) {
        pctSum += num(p.percent_complete);
        pctCount += 1;
      }
    }
    const total = pieces.length;
    const shipped = byStage.Shipped || 0;
    const inFab = total - shipped - (byStage["Not Started"] || 0) - unknown;
    const avgPct = pctCount ? Math.round(pctSum / pctCount) : 0;
    return { byStage, unknown, total, shipped, inFab, avgPct };
  }, [pieces]);

  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page page-content" style={{ padding: 24 }}>
        <CommandBar eyebrow="Production" title="Production Status" />
        <div className="sbd-card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
          Pick a project from the top bar to view fabrication status.
        </div>
      </div>
    );
  }

  /* ── Shared modals — reused by both classic and command_ui paths ─────────── */
  const modals = (
    <>
      <ProductionStatusImportModal
        open={showImport}
        projectId={projectId}
        projectName={activeProject?.name}
        existing={pieces}
        onClose={() => setShowImport(false)}
        onImported={() => queryClient.invalidateQueries({ queryKey: ["piece-production", projectId] })}
      />
      <TeklaEpmImportModal
        open={showEpmImport}
        projectId={projectId}
        projectName={activeProject?.name}
        onClose={() => setShowEpmImport(false)}
      />
    </>
  );

  /* ── Command UI skin (light, command-kit) ────────────────────────────────── */
  if (commandUi) {
    if (isLoading) {
      return (
        <div style={{ padding: 24 }}>
          <LoadingSkeleton variant="table" rows={8} />
        </div>
      );
    }
    return (
      <div className="production-page">
        <ProductionStatusControlCenter
          projectName={activeProject?.name || "All Projects"}
          pieces={pieces}
          filtered={filtered}
          search={search}
          onSearch={setSearch}
          stageFilter={stageFilter}
          onStageFilterChange={setStageFilter}
          onExport={() => exportProductionCSV(filtered)}
          onImport={() => setShowImport(true)}
          onImportEpm={() => setShowEpmImport(true)}
          projectHealth={activeProject?.health_status || null}
          percentComplete={activeProject?.scope_complete_pct_override != null ? Number(activeProject.scope_complete_pct_override) : null}
        />
        {modals}
      </div>
    );
  }

  return (
    <div className="sb-dashboard-reference-page page-content" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={activeProject?.name || "Production"}
        title="Production Status"
        count={rollup.total}
        unit=" pieces"
        subtitle="Per-piece fab status from Tekla EPM / FabSuite"
      >
        <button className="sbd-btn sbd-btn-ghost" onClick={() => setShowEpmImport(true)}>
          <Boxes size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Import Tekla EPM File
        </button>
        <button className="sbd-btn sbd-btn-primary" onClick={() => setShowImport(true)}>
          <Upload size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Import Production Status
        </button>
      </CommandBar>

      {isLoading ? (
        <LoadingSkeleton variant="page" />
      ) : rollup.total === 0 ? (
        <div className="sbd-card" style={{ padding: 40, textAlign: "center" }}>
          <Factory size={28} style={{ color: "var(--text-muted)" }} />
          <div style={{ marginTop: 12, color: "var(--text-primary)", fontWeight: 700 }}>No production data yet</div>
          <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13, maxWidth: 520, marginInline: "auto", lineHeight: 1.6 }}>
            Export a production-control report from Tekla EPM / FabSuite as CSV and import it to track
            per-piece fabrication status — so "ready to ship" and "ready to erect" reflect the shop floor.
          </div>
          <button className="sbd-btn sbd-btn-primary" style={{ marginTop: 16 }} onClick={() => setShowImport(true)}>
            Import a CSV
          </button>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="sbd-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Kpi label="Pieces tracked" value={rollup.total} />
            <Kpi label="Shipped" value={rollup.shipped} tone="var(--status-success)" sub={rollup.total ? `${Math.round((rollup.shipped / rollup.total) * 100)}% ready to erect` : ""} />
            <Kpi label="In fabrication" value={rollup.inFab} tone="var(--status-warning)" />
            <Kpi label="Avg complete" value={`${rollup.avgPct}%`} tone="var(--accent)" />
          </div>

          {/* Stage distribution */}
          <div className="sbd-card" style={{ padding: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
              Stage distribution
            </div>
            <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", border: "1px solid var(--border-default)" }}>
              {PRODUCTION_STAGES.map((stage) => {
                const n = rollup.byStage[stage] || 0;
                if (!n) return null;
                const pct = (n / rollup.total) * 100;
                return <div key={stage} title={`${stage}: ${n}`} style={{ width: `${pct}%`, background: STAGE_COLOR[stage] }} />;
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
              {PRODUCTION_STAGES.map((stage) => (
                <span key={stage} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: STAGE_COLOR[stage] }} />
                  {stage}
                  <strong style={{ color: "var(--text-primary)" }}>{rollup.byStage[stage] || 0}</strong>
                </span>
              ))}
              {rollup.unknown > 0 && (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Unmapped <strong>{rollup.unknown}</strong></span>
              )}
            </div>
          </div>

          {/* Piece table */}
          <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={th}>Mark</th>
                    <th style={th}>Assembly</th>
                    <th style={th}>Stage</th>
                    <th style={{ ...th, textAlign: "right" }}>%</th>
                    <th style={th}>Ship date</th>
                    <th style={th}>Seq</th>
                    <th style={th}>Area</th>
                    <th style={{ ...th, textAlign: "right" }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {pieces.map((p) => (
                    <tr key={p.id}>
                      <td style={{ ...td, fontWeight: 700, color: "var(--text-primary)" }}>{p.piece_mark}</td>
                      <td style={td}>{p.assembly_mark || "—"}</td>
                      <td style={td}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: STAGE_COLOR[p.status] || "var(--text-muted)" }} />
                          {p.status || "—"}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right" }} className="sbd-num">{p.percent_complete ?? "—"}</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 11 }}>{p.ship_date || "—"}</td>
                      <td style={td}>{p.sequence_number || "—"}</td>
                      <td style={td}>{p.erection_area || "—"}</td>
                      <td style={{ ...td, textAlign: "right" }} className="sbd-num">{p.quantity ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modals}
    </div>
  );
}

const th = {
  textAlign: "left", padding: "9px 12px", fontFamily: "var(--font-mono)",
  fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
  color: "var(--text-muted)", borderBottom: "1px solid var(--divider)",
  position: "sticky", top: 0, background: "var(--bg-surface)",
};
const td = { padding: "8px 12px", borderBottom: "1px solid var(--divider)", color: "var(--text-secondary)" };

function Kpi({ label, value, tone = "var(--text-primary)", sub }) {
  return (
    <div className="sbd-card" style={{ padding: "14px 16px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 800, color: tone, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
