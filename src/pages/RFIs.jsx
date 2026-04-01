
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/useProjectContext";
import DeleteDialog from "@/components/shared/DeleteDialog";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { Pill } from "@/components/rfis/RFISections";
import { RFIBulkActionBar, RFIBulkAddModal, RFIBulkEditModal, RFICommandBar, RFIDetailPanel, RFIFilterBar, RFIKpiStrip, RFIOverdueStrip } from "@/components/rfis/RFIPageSections";
import { BIC_COLORS, PRIORITY_CFG, STATUS_CFG, daysOpen, isClosed, isOverdue, mono, statusColumns } from "@/components/rfis/rfiConfig";
import { useRFIData } from "@/components/rfis/useRFIData";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";

export default function RFIs() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();

  const [view, setView] = useState("LIST");
  const scopeView = "project";
  const [showForm, setShowForm] = useState(false);
  const [editingRFI, setEditingRFI] = useState(null);
  const [selectedRFI, setSelectedRFI] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterBIC, setFilterBIC] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("date_required");
  const [sortDir, setSortDir] = useState("asc");
  const [overdueFirst, setOverdueFirst] = useState(false);
  const rfiQueryKeys = [["rfis"], ["rfis", projectId]];
  const {
    projects,
    rfis,
    normalizedRfis,
    scopedRfis,
    filtered,
    kpis,
    bicCounts,
    repairPlan,
    numberingIssues,
    overdueList,
    groupedByProject,
    agingBuckets,
    projectNameById,
    resolveProjectName,
    loadingRfis,
    hasRfisError,
    rfisErrorMessage,
  } = useRFIData({
    projectId,
    activeProjectName: activeProject?.name || "",
    search,
    filterStatus,
    filterPriority,
    filterBIC,
    sortField,
    sortDir,
    overdueFirst,
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.RFI.create(data),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, rfiQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI created");
    },
    onError: (e) => toastCrudError(e, "Failed to create RFI"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RFI.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, rfiQueryKeys, updated);
      if (selectedRFI?.id === updated.id) setSelectedRFI(updated);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI updated");
    },
    onError: (e) => toastCrudError(e, "Failed to update RFI"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.RFI.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, rfiQueryKeys, deletedId);
      if (selectedRFI?.id === deleteTarget?.id) setSelectedRFI(null);
      setDeleteTarget(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to delete RFI"),
  });
  const [bulkEditData, setBulkEditData] = useState({
    status: "",
    priority: "",
    ball_in_court: "",
    date_required: "",
    assigned_to: "",
  });
  const [bulkAddData, setBulkAddData] = useState({
    project_id: projectId || "",
    priority: "Medium",
    status: "Open",
    ball_in_court: "Contractor",
    date_required: "",
    lines: "",
  });

  const repairNumbersMut = useMutation({
    mutationFn: async () => {
      const { repairs, skippedWithoutProject } = repairPlan;
      if (!repairs.length) {
        return { repaired: 0, updates: [], skippedWithoutProject };
      }
      const updates = [];

      for (const repair of repairs) {
        const updated = await base44.entities.RFI.update(repair.id, {
          rfi_number: repair.next_number,
          project_name: repair.project_name || projectNameById.get(repair.project_id) || "",
        });
        updates.push(updated);
      }

      return { repaired: updates.length, updates, skippedWithoutProject };
    },
    onSuccess: async ({ repaired, updates, skippedWithoutProject }) => {
      updates.forEach((updated) => replaceRecordInCaches(qc, rfiQueryKeys, updated));
      await invalidateCrudQueries(qc, rfiQueryKeys);

      if (repaired > 0) {
        toast.success(`Repaired ${repaired} RFI number${repaired === 1 ? "" : "s"}`);
      } else {
        toast.success("RFI numbering is already clean");
      }

      if (skippedWithoutProject > 0) {
        toast.warning(`Skipped ${skippedWithoutProject} RFIs without a project`);
      }
    },
    onError: (e) => toastCrudError(e, "Failed to repair RFI numbering"),
  });
  const bulkEditMut = useMutation({
    mutationFn: async (payload) => {
      const ids = [...selectedIds];
      if (!ids.length) throw new Error("Select at least one RFI");
      await Promise.all(ids.map((id) => base44.entities.RFI.update(id, payload)));
    },
    onSuccess: async () => {
      setShowBulkEdit(false);
      setSelectedIds(new Set());
      setBulkEditData({ status: "", priority: "", ball_in_court: "", date_required: "", assigned_to: "" });
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFIs updated");
    },
    onError: (e) => toastCrudError(e, "Failed to bulk update RFIs"),
  });
  const bulkDeleteMut = useMutation({
    mutationFn: async () => {
      const ids = [...selectedIds];
      if (!ids.length) throw new Error("Select at least one RFI");
      await Promise.all(ids.map((id) => base44.entities.RFI.delete(id)));
    },
    onSuccess: async () => {
      setSelectedIds(new Set());
      setSelectedRFI(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFIs deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to bulk delete RFIs"),
  });
  const bulkAddMut = useMutation({
    mutationFn: async () => {
      const projectTarget = bulkAddData.project_id || projectId;
      if (!projectTarget) throw new Error("Select a project");
      const lines = bulkAddData.lines
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) throw new Error("Enter at least one RFI line");

      for (const line of lines) {
        const [titlePart, questionPart] = line.split("|").map((part) => part.trim());
        const rfiNumber = await getNextFormattedNumber({
          projectId: projectTarget,
          recordType: "RFI",
          entityName: "RFI",
          fieldName: "rfi_number",
          prefix: "RFI #",
        });
        await base44.entities.RFI.create({
          project_id: projectTarget,
          project_name: resolveProjectName(projectTarget),
          title: titlePart,
          question: questionPart || titlePart,
          priority: bulkAddData.priority,
          status: bulkAddData.status,
          ball_in_court: bulkAddData.ball_in_court,
          date_required: bulkAddData.date_required || "",
          submitted_date: new Date().toISOString().split("T")[0],
        });
      }
    },
    onSuccess: async () => {
      setShowBulkAdd(false);
      setBulkAddData({
        project_id: projectId || "",
        priority: "Medium",
        status: "Open",
        ball_in_court: "Contractor",
        date_required: "",
        lines: "",
      });
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFIs added");
    },
    onError: (e) => toastCrudError(e, "Failed to bulk add RFIs"),
  });

  const toggleStatus = (r) => {
    const order = statusColumns;
    const idx = order.indexOf(r.status || "Open");
    const next = order[Math.min(idx + 1, order.length - 1)];
    const extra = ["Answered", "Closed"].includes(next) ? { date_answered: new Date().toISOString().split("T")[0] } : {};
    updateMut.mutate({ id: r.id, data: { status: next, ...extra } });
  };

  useEffect(() => {
    if (!selectedRFI?.id) return;
    const refreshed = normalizedRfis.find((rfi) => rfi.id === selectedRFI.id);
    if (refreshed) setSelectedRFI(refreshed);
  }, [normalizedRfis, selectedRFI?.id]);

  useEffect(() => {
    setSelectedIds((prev) => new Set([...prev].filter((id) => filtered.some((rfi) => rfi.id === id))));
  }, [filtered]);

  const toggleSelectedId = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAllVisible = () =>
    setSelectedIds((prev) => {
      const visibleIds = filtered.map((rfi) => rfi.id);
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ ...mono, fontSize: 12, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Select a project to view RFIs
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          The RFI workspace is project-specific.
        </div>
      </div>
    );
  }

  if (loadingRfis) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ ...mono, fontSize: 12, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Loading RFIs
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          Pulling project RFIs and numbering context.
        </div>
      </div>
    );
  }

  if (hasRfisError) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ ...mono, fontSize: 12, color: "var(--status-error)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          RFI Hub Failed To Load
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          {rfisErrorMessage}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)", background: "var(--bg-page)", overflow: "hidden" }}>
      <RFICommandBar
        projectName={resolveProjectName(projectId) || activeProject?.name || "Current Project"}
        scopedCount={scopedRfis.length}
        openCount={kpis.open}
        qc={qc}
        projectId={projectId}
        repairNumbersMut={repairNumbersMut}
        numberingIssues={numberingIssues}
        view={view}
        setView={setView}
        setShowBulkAdd={setShowBulkAdd}
        setEditingRFI={setEditingRFI}
        setShowForm={setShowForm}
      />
      <RFIKpiStrip kpis={kpis} setFilterStatus={setFilterStatus} setFilterPriority={setFilterPriority} />
      <RFIOverdueStrip overdueList={overdueList} setSelectedRFI={setSelectedRFI} />
      <RFIFilterBar
        search={search}
        setSearch={setSearch}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterPriority={filterPriority}
        setFilterPriority={setFilterPriority}
        filterBIC={filterBIC}
        setFilterBIC={setFilterBIC}
        sortField={sortField}
        setSortField={setSortField}
        sortDir={sortDir}
        setSortDir={setSortDir}
        overdueFirst={overdueFirst}
        setOverdueFirst={setOverdueFirst}
        filtered={filtered}
      />
      <RFIBulkActionBar selectedIds={selectedIds} filtered={filtered} toggleSelectAllVisible={toggleSelectAllVisible} setShowBulkEdit={setShowBulkEdit} bulkDeleteMut={bulkDeleteMut} />
      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {view === "LIST" && (
          <div style={{ width: 270, flexShrink: 0, borderRight: "1px solid var(--divider)", background: "var(--bg-sidebar)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>RFI Tracker</div>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Ball in Court</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bicCounts.map(({ party, count }) => {
                  const cfg = BIC_COLORS[party] || BIC_COLORS.Contractor;
                  return (
                    <div key={party} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setFilterBIC(party)}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{party}</div>
                        <div style={{ width: "100%", height: 6, background: "var(--bg-surface-low)", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${count === 0 ? 0 : Math.min(100, (count / Math.max(1, kpis.open)) * 100)}%`, height: "100%", background: cfg.text }} />
                        </div>
                      </div>
                      <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: cfg.text }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Aging Analysis</div>
              {[
                { label: "< 7 days", key: "fresh", color: "var(--status-success)" },
                { label: "7–14 days", key: "aging", color: "var(--status-warning)" },
                { label: "15–30 days", key: "stale", color: "var(--status-error)" },
                { label: "> 30 days", key: "critical", color: "var(--status-error)" },
              ].map((b) => (
                <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", minWidth: 80 }}>{b.label}</div>
                  <div style={{ flex: 1, height: 6, background: "var(--bg-surface-low)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, (agingBuckets[b.key] / Math.max(1, kpis.open)) * 100)}%`, height: "100%", background: b.color }} />
                  </div>
                  <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: b.color }}>{agingBuckets[b.key]}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", flex: 1, overflowY: "auto" }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                Due within 7 days ({kpis.dueThisWeek})
              </div>
              {filtered
                .filter((r) => !isClosed(r) && r.date_required)
                .filter((r) => {
                  const d = parseUTCDate(r.date_required);
                  const today = new Date();
                  const in7 = new Date();
                  in7.setDate(today.getDate() + 7);
                  return d >= today && d <= in7;
                })
                .sort((a, b) => new Date(a.date_required) - new Date(b.date_required))
                .map((r) => {
                  const cfg = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
                  const due = parseUTCDate(r.date_required);
                  const diff = Math.ceil((due - new Date()) / 86400000);
                  const badgeColor = diff <= 3 ? "var(--status-error)" : "var(--status-warning)";
                  return (
                    <div key={r.id} onClick={() => setSelectedRFI(r)} style={{ border: "1px solid var(--border-default)", borderRadius: 6, padding: "8px 10px", marginBottom: 6, cursor: "pointer", background: "var(--bg-surface)" }}>
                      <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{r.rfi_number}</div>
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                        <span style={{ ...mono, fontSize: 8, background: cfg.bg, color: cfg.text, padding: "2px 6px", borderRadius: 4 }}>{r.ball_in_court || "Contractor"}</span>
                        <span style={{ ...mono, fontSize: 8, color: badgeColor, fontWeight: 700 }}>{diff <= 0 ? "TODAY" : `${diff}d`}</span>
                      </div>
                    </div>
                  );
                })}
              {kpis.dueThisWeek === 0 && <div style={{ ...mono, fontSize: 9, color: "var(--status-success)" }}>No RFIs due this week</div>}
            </div>
            <div style={{ padding: "10px 14px" }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Open Impact</div>
              {kpis.costExposure > 0 && (
                <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--status-warning)", marginBottom: 4 }}>COST | ${kpis.costExposure.toLocaleString()}</div>
              )}
              {kpis.scheduleDays > 0 && (
                <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--status-error)" }}>SCHEDULE | {kpis.scheduleDays}d exposure</div>
              )}
              {kpis.costExposure === 0 && kpis.scheduleDays === 0 && <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>No impact flagged</div>}
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {view === "BOARD" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: 12, width: "100%", overflow: "auto" }}>
              {statusColumns.map((st) => {
                const col = filtered.filter((r) => r.status === st);
                return (
                  <div key={st} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, display: "flex", flexDirection: "column", maxHeight: "100%", overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--divider)", ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                      {st} · {col.length}
                    </div>
                    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                      {col.map((r) => {
                        const pr = PRIORITY_CFG[r.priority] || PRIORITY_CFG.Medium;
                        const bic = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
                        const overdue = isOverdue(r);
                        return (
                          <div
                            key={r.id}
                            onClick={() => setSelectedRFI(r)}
                            style={{
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border-default)",
                              borderLeft: overdue ? "3px solid var(--status-error)" : r.priority === "Critical" ? "3px solid var(--status-warning)" : "3px solid transparent",
                              borderRadius: 4,
                              padding: "10px 12px",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <div style={{ ...mono, fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>{r.rfi_number}</div>
                              <Pill label={r.priority} color={pr.color} bg={pr.bg} />
                            </div>
                            <div style={{ fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 4, maxHeight: 38, overflow: "hidden" }}>
                              {r.title}
                            </div>
                            {r.drawing_reference && <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>{r.drawing_reference}</div>}
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                              <Pill label={r.ball_in_court || "Contractor"} color={bic.text} bg={bic.bg} />
                              <span style={{ ...mono, fontSize: 8, color: overdue ? "var(--status-error)" : "var(--text-muted)", fontWeight: overdue ? 700 : 500 }}>
                                {r.date_required ? new Date(r.date_required).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                              </span>
                              <span style={{ ...mono, fontSize: 8, color: "var(--text-secondary)" }}>{daysOpen(r)}d</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
              <div style={{ position: "sticky", top: 0, zIndex: 5, display: "grid", gridTemplateColumns: "28px 80px 2fr 90px 100px 110px 72px 52px 90px", background: "var(--bg-sidebar)", borderBottom: "1px solid var(--divider)", padding: "10px 12px", ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                <div>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((rfi) => selectedIds.has(rfi.id))}
                    onChange={toggleSelectAllVisible}
                    style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                  />
                </div>
                <div>RFI #</div>
                <div>Subject</div>
                <div>Priority</div>
                <div>Status</div>
                <div>Ball in Court</div>
                <div>Due</div>
                <div>Days</div>
                <div>Actions</div>
              </div>
              {Object.entries(groupedByProject).map(([proj, rows]) => (
                <div key={proj} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)" }}>
                    <div style={{ width: 4, height: 20, background: "var(--accent)" }} />
                    <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-primary)" }}>{proj}</div>
                    <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>{rows.length} RFIs</div>
                    <div style={{ ...mono, fontSize: 8, color: "var(--status-error)", marginLeft: 6 }}>{rows.filter((r) => isOverdue(r)).length} overdue</div>
                  </div>
                  {rows.map((r) => {
                    const overdue = isOverdue(r);
                    const pr = PRIORITY_CFG[r.priority] || PRIORITY_CFG.Medium;
                    const st = STATUS_CFG[r.status] || STATUS_CFG.Open;
                    const bic = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
                    const due = r.date_required ? new Date(r.date_required) : null;
                    const diff = due ? Math.ceil((due - new Date()) / 86400000) : null;
                    const rowBg = overdue ? "rgba(255,61,61,0.12)" : "transparent";
                    const leftBorder = overdue && r.priority === "Critical" ? "3px solid var(--status-error)" : overdue ? "3px solid rgba(255,61,61,0.7)" : r.priority === "Critical" ? "3px solid var(--status-warning)" : "3px solid transparent";
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRFI(r)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "28px 80px 2fr 90px 100px 110px 72px 52px 90px",
                          padding: "10px 12px",
                          alignItems: "center",
                          borderBottom: "1px solid var(--divider)",
                          cursor: "pointer",
                          background: selectedRFI?.id === r.id ? "var(--accent-muted)" : rowBg,
                          borderLeft: leftBorder,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = selectedRFI?.id === r.id ? "var(--accent-muted)" : "var(--hover-bg)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = selectedRFI?.id === r.id ? "var(--accent-muted)" : rowBg)}
                      >
                        <div>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectedId(r.id);
                            }}
                            style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                          />
                        </div>
                        <div style={{ ...mono, fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>
                          {r.priority === "Critical" && <span style={{ color: "var(--status-error)", marginRight: 4 }}>!</span>}
                          {r.rfi_number}
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", textDecoration: r.status === "Closed" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.drawing_reference || "—"}
                            {r.spec_section ? ` · ${r.spec_section}` : ""}
                          </div>
                        </div>
                        <div>
                          <Pill label={r.priority} color={pr.color} bg={pr.bg} />
                        </div>
                        <div>
                          <Pill label={r.status} color={st.color} bg={st.bg} />
                          <div style={{ ...mono, fontSize: 8, color: "var(--status-error)" }}>{r.cost_impact ? "Cost" : ""}</div>
                          <div style={{ ...mono, fontSize: 8, color: "var(--status-warning)" }}>{r.schedule_impact ? "Sched" : ""}</div>
                        </div>
                        <div>
                          <Pill label={r.ball_in_court || "Contractor"} color={bic.text} bg={bic.bg} />
                        </div>
                        <div style={{ ...mono, fontSize: 9, color: overdue ? "var(--status-error)" : diff != null && diff <= 3 ? "var(--status-warning)" : "var(--text-secondary)", fontWeight: overdue || (diff != null && diff <= 3) ? 700 : 500 }}>
                          {due ? due.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          {overdue && <div style={{ fontSize: 8, color: "var(--status-error)" }}>{Math.abs(diff)}d LATE</div>}
                        </div>
                        <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: daysOpen(r) > 30 ? "var(--status-error)" : daysOpen(r) > 14 ? "var(--status-warning)" : "var(--status-success)" }}>{daysOpen(r)}d</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus(r);
                            }}
                            style={{
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-surface)",
                              borderRadius: 4,
                              padding: "4px 6px",
                              ...mono,
                              fontSize: 8,
                              cursor: "pointer",
                            }}
                          >
                            {r.status === "Open" ? "Review" : r.status === "Under Review" ? "Answer" : "Done"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRFI(r);
                              setShowForm(true);
                            }}
                            style={{
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-surface)",
                              borderRadius: 4,
                              padding: "4px 6px",
                              ...mono,
                              fontSize: 8,
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(r);
                            }}
                            style={{
                              border: "1px solid rgba(255,61,61,0.25)",
                              background: "rgba(255,61,61,0.08)",
                              borderRadius: 4,
                              padding: "4px 6px",
                              ...mono,
                              fontSize: 8,
                              color: "var(--status-error)",
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <RFIDetailPanel
            selectedRFI={selectedRFI}
            setSelectedRFI={setSelectedRFI}
            setEditingRFI={setEditingRFI}
            setShowForm={setShowForm}
            setDeleteTarget={setDeleteTarget}
            updateMut={updateMut}
          />
        </div>
      </div>

      {showForm && (
        <RFIFormModal
          open={showForm}
          onClose={() => {
            setShowForm(false);
            setEditingRFI(null);
          }}
          onSave={async (data) => {
            if (editingRFI) {
              updateMut.mutate({
                id: editingRFI.id,
                data: {
                  ...data,
                  project_name: resolveProjectName(data.project_id || projectId) || data.project_name || editingRFI.project_name || "",
                },
              });
            } else {
              const num =
                data.rfi_number ||
                (await getNextFormattedNumber({
                  projectId: data.project_id || projectId,
                  recordType: "RFI",
                  entityName: "RFI",
                  fieldName: "rfi_number",
                  prefix: "RFI #",
                }));
              createMut.mutate({
                ...data,
                rfi_number: num,
                project_name: resolveProjectName(data.project_id || projectId) || data.project_name || "",
              });
            }
            setShowForm(false);
            setEditingRFI(null);
          }}
          saving={createMut.isPending || updateMut.isPending}
          rfi={editingRFI}
          projectId={projectId}
        />
      )}

      <RFIBulkEditModal open={showBulkEdit} onClose={() => setShowBulkEdit(false)} bulkEditData={bulkEditData} setBulkEditData={setBulkEditData} selectedCount={selectedIds.size} bulkEditMut={bulkEditMut} />
      <RFIBulkAddModal open={showBulkAdd} onClose={() => setShowBulkAdd(false)} bulkAddData={bulkAddData} setBulkAddData={setBulkAddData} projects={projects} bulkAddMut={bulkAddMut} />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete RFI"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />
    </div>
  );
}
