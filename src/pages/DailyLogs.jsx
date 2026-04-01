import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "../components/shared/useProjectContext";
import DailyLogForm from "@/components/fieldops/DailyLogForm";
import DailyLogsList from "@/components/fieldops/DailyLogsList";
import DeleteDialog from "@/components/shared/DeleteDialog";

const commandPanel = {
  background: "linear-gradient(180deg, rgba(31,33,37,0.96), rgba(12,14,17,0.98))",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

const statLabel = {
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 8,
};

const statValue = {
  fontFamily: "var(--font-display)",
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: "-0.03em",
  color: "var(--text-primary)",
  lineHeight: 1,
};

const actionBtn = {
  background: "var(--accent)",
  color: "var(--on-accent)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  padding: "9px 16px",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export default function DailyLogs() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const qc = useQueryClient();

  const { data: logs = [] } = useQuery({
    queryKey: ["daily-logs", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.DailyLog.filter({ project_id: projectId }, "-date")
        : [],
    initialData: [],
    enabled: !!projectId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.DailyLog.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      toast.success("Daily log created");
      setShowForm(false);
      setEditing(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DailyLog.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      toast.success("Daily log updated");
      setShowForm(false);
      setEditing(null);
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
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (data) => {
    if (editing?.id) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  };

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;
  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    [logs]
  );
  const latestLog = sortedLogs[0];

  const metrics = useMemo(() => {
    const totalHours = logs.reduce((sum, log) => sum + Number(log.hours_worked || 0), 0);
    const totalHeadcount = logs.reduce((sum, log) => sum + Number(log.headcount || 0), 0);
    const delayHours = logs.reduce((sum, log) => sum + Number(log.delay_hours || 0), 0);
    const incidents = logs.reduce((sum, log) => sum + Number(log.safety_incidents || 0), 0);
    return {
      entries: logs.length,
      totalHours,
      avgCrew: logs.length ? Math.round(totalHeadcount / logs.length) : 0,
      delayHours,
      incidents,
    };
  }, [logs]);

  const riskItems = useMemo(() => {
    if (!logs.length) return [];
    const issues = [];
    if (metrics.delayHours > 0) issues.push(`${metrics.delayHours} delay hours logged across current entries`);
    if (metrics.incidents > 0) issues.push(`${metrics.incidents} safety incidents require review`);
    if (latestLog?.weather_description) issues.push(`Latest field weather: ${latestLog.weather_description}`);
    return issues;
  }, [logs, metrics, latestLog]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          ...commandPanel,
          overflow: "hidden",
          position: "relative",
          padding: 24,
          background:
            "radial-gradient(circle at top right, rgba(255,107,0,0.14), transparent 34%), radial-gradient(circle at left center, rgba(0,229,255,0.08), transparent 28%), linear-gradient(180deg, rgba(26,28,31,0.95), rgba(9,10,11,0.98))",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--secondary)", marginBottom: 10 }}>
                Field Command
              </div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(30px,4vw,48px)", fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.04em", margin: 0, color: "var(--text-primary)" }}>
                Daily execution, labor, and site friction in one field log.
              </h1>
              <p style={{ margin: "12px 0 0", maxWidth: 720, fontSize: 15, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                Track crew output, weather, equipment, delays, and superintendent notes in a page built for daily operating rhythm instead of a basic entry form.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <MetricCard label="Log Entries" value={metrics.entries} tone="var(--text-primary)" />
              <MetricCard label="Hours Logged" value={metrics.totalHours} tone="var(--accent)" />
              <MetricCard label="Average Crew" value={metrics.avgCrew} tone="var(--secondary)" />
              <MetricCard label="Delay Hours" value={metrics.delayHours} tone={metrics.delayHours ? "var(--status-warning)" : "var(--text-muted)"} />
            </div>
          </div>

          <div style={{ ...commandPanel, padding: 18, background: "rgba(12,14,17,0.82)" }}>
            <div style={{ ...statLabel, color: "var(--secondary)" }}>Latest Field Pulse</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
              {selectedProject?.name || activeProject?.name || "Current Project"}
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <DataLine label="Latest Log" value={latestLog?.date ? new Date(latestLog.date).toLocaleDateString() : "No entries yet"} />
              <DataLine label="Crew" value={latestLog?.crew_name || "Not captured"} />
              <DataLine label="Superintendent" value={latestLog?.superintendent || "Not captured"} />
              <DataLine label="Safety" value={metrics.incidents ? `${metrics.incidents} incidents logged` : "No incidents logged"} tone={metrics.incidents ? "var(--status-error)" : "var(--status-success)"} />
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              style={{ ...actionBtn, width: "100%", justifyContent: "center" }}
            >
              Create Daily Log
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {showForm && (
            <div style={{ ...commandPanel, padding: 18 }}>
              <div style={{ ...statLabel, color: "var(--accent)" }}>{editing ? "Edit Daily Log" : "Create Daily Log"}</div>
              <DailyLogForm
                projectId={projectId}
                log={editing}
                onSave={handleSave}
                onClose={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                isSaving={createMut.isPending || updateMut.isPending}
              />
            </div>
          )}

          <div style={{ ...commandPanel, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <div style={statLabel}>Field Ledger</div>
                <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  {(selectedProject?.name || activeProject?.name || "Current Project")} · {sortedLogs.length} recorded day{sortedLogs.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <DailyLogsList
              logs={sortedLogs}
              onEdit={(log) => {
                setEditing(log);
                setShowForm(true);
              }}
              onDelete={(log) => setDeleteTarget(log)}
            />
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...commandPanel, padding: 18 }}>
            <div style={statLabel}>Operations Watch</div>
            {riskItems.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {riskItems.map((item) => (
                  <div key={item} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--divider)", borderRadius: "var(--radius-card)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                No active field risks are surfacing from the current daily log set.
              </div>
            )}
          </div>

          <div style={{ ...commandPanel, padding: 18 }}>
            <div style={statLabel}>Crew Snapshot</div>
            <div style={{ display: "grid", gap: 12 }}>
              <DataLine label="Total Hours" value={`${metrics.totalHours}h`} />
              <DataLine label="Average Crew" value={`${metrics.avgCrew} workers`} />
              <DataLine label="Delay Exposure" value={`${metrics.delayHours}h`} tone={metrics.delayHours ? "var(--status-warning)" : "var(--text-primary)"} />
              <DataLine label="Incidents" value={`${metrics.incidents}`} tone={metrics.incidents ? "var(--status-error)" : "var(--text-primary)"} />
            </div>
          </div>
        </aside>
      </section>

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id);
        }}
        title="Delete Daily Log"
        description={`Delete log for ${deleteTarget?.date}? This cannot be undone.`}
      />
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <div style={{ ...commandPanel, padding: 16, background: "rgba(12,14,17,0.78)" }}>
      <div style={statLabel}>{label}</div>
      <div style={{ ...statValue, color: tone }}>{value}</div>
    </div>
  );
}

function DataLine({ label, value, tone = "var(--text-primary)" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", borderBottom: "1px solid var(--divider)", paddingBottom: 8 }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: tone, textAlign: "right" }}>{value}</span>
    </div>
  );
}
