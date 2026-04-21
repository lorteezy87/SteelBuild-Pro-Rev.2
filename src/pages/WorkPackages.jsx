/**
 * WorkPackages — steel fab/erection work-package tracker, rebuilt
 * on the Claude Design industrial-OS system.
 *
 * Shell owns: React-Query fetches + mutations (create / update /
 * delete / quick-complete / bulk-create / bulk-status), derived
 * counts + tonnage, selection state, and composition.
 *
 * Every visual block comes from `@/components/design-system` or
 * `src/pages/workPackages/*`.
 */

import React, { useMemo, useState } from "react";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import WorkPackageDetailModal from "@/components/workpackages/WorkPackageDetailModal";
import WPFormModal from "@/components/workpackages/WPFormModal";
import WPBulkAddModal from "@/components/workpackages/WPBulkAddModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { getNextNumber } from "@/components/shared/numberSequencing";
import { batchProcess } from "@/utils/batchProcess";

import {
  CommandBar,
  KpiTile,
  Button,
  BulkActionBar,
  EmptyState,
  Icon,
  ProgressBar,
  StatusPill,
} from "@/components/design-system";
import { PHASE_COLOR, PHASE_HEX } from "@/components/design-system/tokens";
import { exportWorkPackagesCSV } from "./workPackages/utils";
import WpRow from "./workPackages/WpRow";

export default function WorkPackages() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();

  const [view, setView] = useState("list");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingWP, setEditingWP] = useState(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedBoardWP, setSelectedBoardWP] = useState(null);
  const [selectedWPs, setSelectedWPs] = useState(new Set());
  const [bulkAddOpen, setBulkAddOpen] = useState(false);

  /* ── Data ── */
  const { data: workPackages = [], isLoading: wpLoading } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: async () => {
      if (projectId) return base44.entities.WorkPackage.filter({ project_id: projectId });
      const all = await base44.entities.WorkPackage.list();
      return all.sort((a, b) => (a.project_name || "").localeCompare(b.project_name || ""));
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Drawings are consumed by the WP form modal so the user can link
  // drawings to a work package at create/edit time. Without this fetch
  // the modal's `allDrawings` default of [] produces an empty search
  // dropdown ("No drawings found for this project") regardless of how
  // many drawings the project actually has.
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: async () => {
      if (projectId) return base44.entities.Drawing.filter({ project_id: projectId });
      return base44.entities.Drawing.list();
    },
    staleTime: 30 * 1000,
  });

  /* ── Mutations ── */
  const updateWPMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkPackage.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const createWPMut = useMutation({
    mutationFn: (data) => base44.entities.WorkPackage.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package created");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.WorkPackage.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setDeleteTarget(null);
      toast.success("Work package deleted");
    },
    // Surface the real server error rather than a generic "Delete
    // failed" — makes RLS / FK-constraint diagnostics possible from
    // the toast alone without opening devtools.
    onError: (err) => {
      console.error("WP delete failed", err);
      toast.error(`Delete failed: ${err?.message || "unknown error"}`);
    },
  });

  const bulkCreateMut = useMutation({
    mutationFn: async (rows) => {
      if (!rows?.length) throw new Error("No rows to add");
      if (!projectId) throw new Error("Select a project first");
      const needsNumbers = rows.filter((r) => !r.wp_number);
      let nextStart = null;
      if (needsNumbers.length > 0) {
        try {
          nextStart = await getNextNumber(projectId, "wp_number");
        } catch (err) {
          console.warn("[WorkPackages] getNextNumber fallback:", err?.message);
          const maxNum = workPackages
            .map((wp) => parseInt((wp.wp_number || "").replace(/\D/g, ""), 10))
            .filter((n) => !isNaN(n))
            .reduce((max, n) => Math.max(max, n), 0);
          nextStart = maxNum + 1;
        }
      }
      let cursor = nextStart;
      const prepared = rows.map((row) => {
        let wp_number = row.wp_number;
        if (!wp_number && cursor != null) {
          wp_number = `WP-${String(cursor).padStart(3, "0")}`;
          cursor += 1;
        }
        return { ...row, wp_number, project_id: projectId, project_name: row.project_name || undefined };
      });
      return batchProcess(prepared, (data) => base44.entities.WorkPackage.create(data), 5);
    },
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      const ok = results.succeeded.length;
      const fail = results.failed.length;
      if (fail === 0) {
        toast.success(`Added ${ok} work package${ok === 1 ? "" : "s"}`);
        setBulkAddOpen(false);
      } else if (ok === 0) {
        toast.error(`All ${fail} failed: ${results.failed[0]?.error || "unknown error"}`);
      } else {
        toast.warning(`${ok} added, ${fail} failed`);
        setBulkAddOpen(false);
      }
    },
    onError: (err) => toast.error(err.message || "Bulk create failed"),
  });

  const bulkStatusMut = useMutation({
    mutationFn: async ({ ids, status }) => {
      const results = await batchProcess(ids, (id) => base44.entities.WorkPackage.update(id, { status }));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setSelectedWPs(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("Status updated");
      }
    },
    onError: () => toast.error("Bulk update failed"),
  });

  /* ── Derived ── */
  const counts = useMemo(() => ({
    all:         workPackages.length,
    detailing:   workPackages.filter((w) => w.phase === "Detailing").length,
    fabrication: workPackages.filter((w) => w.phase === "Fabrication").length,
    delivery:    workPackages.filter((w) => w.phase === "Delivery").length,
    erection:    workPackages.filter((w) => w.phase === "Erection").length,
    complete:    workPackages.filter((w) => w.status === "Complete").length,
  }), [workPackages]);

  const totalTons = useMemo(
    () => workPackages.reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
    [workPackages]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workPackages.filter((w) => {
      if (filter === "complete") {
        if (w.status !== "Complete") return false;
      } else if (filter !== "all" && w.phase !== filter) {
        return false;
      }
      if (!q) return true;
      return (
        (w.wp_number || "").toLowerCase().includes(q) ||
        (w.name || "").toLowerCase().includes(q) ||
        (w.crew || "").toLowerCase().includes(q)
      );
    });
  }, [workPackages, filter, search]);

  const filteredTons = useMemo(
    () => filtered.reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
    [filtered]
  );

  /* ── Helpers ── */
  const toggleSelect = (id) =>
    setSelectedWPs((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const handleWPEdit = (wp) => {
    setEditingWP(wp);
    setWPModalOpen(true);
  };

  const handleWPCreate = async () => {
    let wpNumber = "";
    try {
      if (projectId) {
        const n = await getNextNumber(projectId, "wp_number");
        wpNumber = `WP-${String(n).padStart(3, "0")}`;
      }
    } catch (err) {
      console.warn("[WorkPackages] getNextNumber fallback:", err?.message);
      const maxNum = workPackages
        .map((wp) => parseInt((wp.wp_number || "").replace(/\D/g, ""), 10))
        .filter((n) => !isNaN(n))
        .reduce((max, n) => Math.max(max, n), 0);
      wpNumber = `WP-${String(maxNum + 1).padStart(3, "0")}`;
    }
    setEditingWP({ wp_number: wpNumber, project_id: projectId });
    setWPModalOpen(true);
  };

  /* ── Loading ── */
  if (wpLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const projectName = projects.find((p) => p.id === projectId)?.name || "All Projects";

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <CommandBar
        eyebrow={`PRODUCTION · ${projectName.toUpperCase()}`}
        title="Work Packages"
        count={counts.all}
        unit={` · ${totalTons.toFixed(1)}T`}
        subtitle="Phase pipeline tracking · detailing → fab → ship → erect"
      >
        <div style={{ display: "flex", gap: 4 }}>
          {["list", "board"].map((v) => (
            <Button
              key={v}
              variant={view === v ? "primary" : "secondary"}
              size="sm"
              onClick={() => setView(v)}
            >
              {v}
            </Button>
          ))}
        </div>
        <Button variant="secondary" icon="download" onClick={() => exportWorkPackagesCSV(filtered)}>
          CSV
        </Button>
        <Button
          variant="outline"
          icon="upload"
          onClick={() => setBulkAddOpen(true)}
          disabled={!projectId}
        >
          BULK ADD
        </Button>
        <Button variant="primary" icon="plus" onClick={handleWPCreate}>
          NEW WP
        </Button>
      </CommandBar>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
        <KpiTile compact label="ALL"         value={counts.all}         color="var(--text-secondary)" active={filter === "all"}         onClick={() => setFilter("all")} />
        <KpiTile compact label="DETAILING"   value={counts.detailing}   color={PHASE_HEX.Detailing}   active={filter === "Detailing"}   onClick={() => setFilter("Detailing")} />
        <KpiTile compact label="FABRICATION" value={counts.fabrication} color={PHASE_HEX.Fabrication} active={filter === "Fabrication"} onClick={() => setFilter("Fabrication")} />
        <KpiTile compact label="DELIVERY"    value={counts.delivery}    color={PHASE_HEX.Delivery}    active={filter === "Delivery"}    onClick={() => setFilter("Delivery")} />
        <KpiTile compact label="ERECTION"    value={counts.erection}    color={PHASE_HEX.Erection}    active={filter === "Erection"}    onClick={() => setFilter("Erection")} />
        <KpiTile compact label="COMPLETE"    value={counts.complete}    color="var(--status-success)" active={filter === "complete"}    onClick={() => setFilter("complete")} />
      </div>

      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 420 }}>
          <div
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          >
            <Icon name="search" size={12} />
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search WP # or name…"
            style={{
              width: "100%",
              height: 30,
              padding: "0 12px 0 30px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-input)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
          }}
        >
          {filtered.length} of {workPackages.length} · {filteredTons.toFixed(1)}T
        </span>
      </div>

      {/* View content */}
      {view === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.length > 0 ? (
            filtered.map((w) => (
              <WpRow
                key={w.id}
                wp={w}
                selected={selectedWPs.has(w.id)}
                onToggle={() => toggleSelect(w.id)}
                onEdit={handleWPEdit}
                onOpen={() => setSelectedBoardWP(w)}
                onDelete={(wp) => setDeleteTarget(wp)}
              />
            ))
          ) : (
            <EmptyState
              icon="wp"
              title={workPackages.length === 0 ? "No work packages yet" : "No WPs match the current filter"}
              body={
                workPackages.length === 0
                  ? "Create your first work package to start tracking fabrication and erection progress."
                  : "Try clearing filters or adjusting the search."
              }
            />
          )}
        </div>
      ) : (
        <BoardView wps={filtered} onSelect={setSelectedBoardWP} />
      )}

      <BulkActionBar
        count={selectedWPs.size}
        onClear={() => setSelectedWPs(new Set())}
        actions={[
          {
            label: "SET COMPLETE",
            icon: "check",
            onClick: () => bulkStatusMut.mutate({ ids: [...selectedWPs], status: "Complete" }),
          },
          {
            label: "SET IN PROGRESS",
            icon: "arrow",
            onClick: () => bulkStatusMut.mutate({ ids: [...selectedWPs], status: "In Progress" }),
          },
          {
            label: "EXPORT",
            icon: "download",
            onClick: () => exportWorkPackagesCSV(filtered.filter((w) => selectedWPs.has(w.id))),
          },
        ]}
      />

      {/* Modals */}
      <WPBulkAddModal
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        onCommit={(rows) => bulkCreateMut.mutate(rows)}
        projectId={projectId}
        projectName={projectName}
        existingWPs={workPackages}
        isSaving={bulkCreateMut.isPending}
      />

      {(wpModalOpen || editingWP) && (
        <WPFormModal
          open={wpModalOpen || !!editingWP}
          onClose={() => { setWPModalOpen(false); setEditingWP(null); }}
          onSave={(data) => {
            if (editingWP?.id) updateWPMut.mutate({ id: editingWP.id, data });
            else createWPMut.mutate(data);
          }}
          wp={editingWP}
          projects={projects}
          nextNumber={editingWP?.wp_number || ""}
          allDrawings={drawings}
        />
      )}

      {selectedBoardWP && (
        <WorkPackageDetailModal
          wp={selectedBoardWP}
          onClose={() => setSelectedBoardWP(null)}
          onEdit={(wp) => { setSelectedBoardWP(null); handleWPEdit(wp); }}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Work Package"
        description={`Delete "${deleteTarget?.name}" (${deleteTarget?.wp_number})? This cannot be undone.`}
      />
    </div>
  );
}

/* ── Board View (Kanban by phase) ──────────────────────────── */

function BoardView({ wps, onSelect }) {
  const phases = ["Detailing", "Fabrication", "Delivery", "Erection"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
      {phases.map((phase) => {
        const items = wps.filter((w) => w.phase === phase);
        const tons = items.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
        return (
          <div
            key={phase}
            style={{
              background: "var(--bg-surface-low)",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border-default)",
              borderTop: `2px solid ${PHASE_COLOR[phase]}`,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: PHASE_COLOR[phase],
                  letterSpacing: "0.14em",
                }}
              >
                {phase.toUpperCase()}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                {items.length} · {tons.toFixed(1)}T
              </span>
            </div>
            {items.map((w) => (
              <div
                key={w.id}
                onClick={() => onSelect(w)}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
                    {w.wp_number}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {Number(w.tonnage || 0).toFixed(1)}T
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    marginTop: 4,
                    lineHeight: 1.3,
                  }}
                >
                  {w.name}
                </div>
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    value={Number(w.percent_complete) || 0}
                    color={PHASE_COLOR[phase]}
                    height={3}
                    sub={`${Number(w.percent_complete) || 0}% · ${w.scheduled_end_date || w.due_date || "—"}`}
                  />
                </div>
                <div style={{ marginTop: 6 }}>
                  <StatusPill label={w.status || "Not Started"} />
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "16px 0",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.12em",
                }}
              >
                — EMPTY —
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
