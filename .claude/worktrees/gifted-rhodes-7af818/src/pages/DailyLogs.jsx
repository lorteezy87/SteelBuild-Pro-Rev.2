import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import DailyLogForm from "@/components/fieldops/DailyLogForm";
import DailyLogsList from "@/components/fieldops/DailyLogsList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, KpiTile } from "@/components/design-system";
import { Plus, Copy } from "lucide-react";
import { logActivity } from "@/services/auditLogger";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";

function getDateCutoff(preset) {
  const now = new Date();
  if (preset === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
      .toISOString()
      .slice(0, 10);
  }
  if (preset === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.getFullYear(), now.getMonth(), diff)
      .toISOString()
      .slice(0, 10);
  }
  if (preset === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
  }
  return null;
}

export default function DailyLogs() {
  const projectId = useProjectId();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState("all");

  const qc = useQueryClient();

  useAutoOpenCreate(() => {
    setEditing(null);
    setShowForm(true);
  });

  const { data: rawLogs = [], isLoading } = useQuery({
    queryKey: ["daily-logs", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.DailyLog.filter({ project_id: projectId })
        : base44.entities.DailyLog.list("-date"),
  });
  // Defensive in-memory soft-delete filter — the entity client does this
  // at fetch time, but a stale cache from before the migration could still
  // surface deleted rows. Mirrors the BudgetHours / Procurement pattern.
  const logs = useMemo(() => rawLogs.filter((r) => !r.is_deleted), [rawLogs]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const filteredLogs = useMemo(() => {
    let result = logs;

    // Date range filter
    const cutoff = getDateCutoff(dateRange);
    if (cutoff) {
      result = result.filter((log) => log.date >= cutoff);
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter((log) => {
        const fields = [
          log.activities,
          log.delays,
          log.crew_name,
          log.superintendent,
        ];
        return fields.some(
          (f) => typeof f === "string" && f.toLowerCase().includes(term)
        );
      });
    }

    return result;
  }, [logs, searchTerm, dateRange]);

  // Key metrics computed from filtered logs
  const metrics = useMemo(() => {
    const totalManHours = filteredLogs.reduce(
      (sum, log) => sum + (log.hours_worked || 0) * (log.headcount || 0),
      0
    );
    const avgCrewSize =
      filteredLogs.length > 0
        ? filteredLogs.reduce((sum, log) => sum + (log.headcount || 0), 0) /
          filteredLogs.length
        : 0;
    const safetyIncidents = filteredLogs.reduce(
      (sum, log) => sum + (log.safety_incidents || 0),
      0
    );
    const delayHours = filteredLogs.reduce(
      (sum, log) => sum + (log.delay_hours || 0),
      0
    );
    return { totalManHours, avgCrewSize, safetyIncidents, delayHours };
  }, [filteredLogs]);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.DailyLog.create(data),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      toast.success("Daily log created");
      setShowForm(false);
      setEditing(null);
      // Audit trail — fire-and-forget
      logActivity("daily_log", "created", created, {
        projectId,
        description: `Daily log for ${created?.date || "today"}`,
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DailyLog.update(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      toast.success("Daily log updated");
      setShowForm(false);
      setEditing(null);
      logActivity("daily_log", "updated", updated, {
        projectId,
        description: `Daily log for ${updated?.date || ""}`,
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.DailyLog.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      toast.success("Daily log deleted");
      setDeleteTarget(null);
      logActivity("daily_log", "deleted", { id: deletedId }, { projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
    }
  };

  const handleCopyFromYesterday = () => {
    if (logs.length === 0) {
      toast.error("No previous logs to copy from");
      return;
    }
    const sorted = [...logs].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    const mostRecent = sorted[0];
    const today = new Date().toISOString().slice(0, 10);
    setEditing({
      crew_name: mostRecent.crew_name || "",
      headcount: mostRecent.headcount || 0,
      superintendent: mostRecent.superintendent || "",
      equipment_used: mostRecent.equipment_used || "",
      activities: "",
      delays: "",
      safety_notes: "",
      date: today,
    });
    setShowForm(true);
  };

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const datePresets = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All Time" },
  ];

  const presetBtnStyle = (active) => ({
    background: active ? "var(--accent)" : "var(--bg-surface)",
    color: active ? "white" : "var(--text-secondary)",
    border: "none",
    borderRadius: "var(--radius-btn)",
    padding: "6px 12px",
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    fontWeight: 700,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Daily Logs"
        count={filteredLogs.length}
        unit=" · ENTRIES"
        subtitle="Field superintendent journal · man-hours · safety · delays"
      >
        <button
          onClick={handleCopyFromYesterday}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--bg-surface)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-btn)",
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
        >
          <Copy size={12} /> Copy Yesterday
        </button>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)",
            color: "var(--bg-base)",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> New Log
        </button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total Man-Hours"  value={metrics.totalManHours.toLocaleString()} color="var(--accent)" />
        <KpiTile compact label="Avg Crew Size"    value={metrics.avgCrewSize.toFixed(1)}          color="var(--phase-fabrication)" />
        <KpiTile compact label="Safety Incidents" value={metrics.safetyIncidents}                 color="var(--status-error)" />
        <KpiTile compact label="Delay Hours"      value={metrics.delayHours}                      color="var(--status-warning)" />
      </div>

      {/* Search and Date Range Filters */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search logs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: "1 1 200px",
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-btn)",
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: "4px" }}>
          {datePresets.map((p) => (
            <button
              key={p.key}
              onClick={() => setDateRange(p.key)}
              style={presetBtnStyle(dateRange === p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <DailyLogForm
          projectId={projectId}
          log={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Logs List */}
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : (
        <DailyLogsList
          logs={filteredLogs}
          onEdit={(log) => { setEditing(log); setShowForm(true); }}
          onDelete={(log) => setDeleteTarget(log)}
        />
      )}

      {/* Delete Confirmation */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Daily Log"
        description={`Delete log for ${deleteTarget?.date}? This cannot be undone.`}
      />
    </div>
  );
}
