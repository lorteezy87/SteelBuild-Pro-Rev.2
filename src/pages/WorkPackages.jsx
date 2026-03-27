import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import WorkPackageList from "@/components/workpackages/WorkPackageList";
import WorkPackageDetailModal from "@/components/workpackages/WorkPackageDetailModal";
import WPFormModal from "@/components/workpackages/WPFormModal";
import { getNextNumber } from "@/components/shared/numberSequencing";

export default function WorkPackages() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const [selectedWP, setSelectedWP] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [editingWP, setEditingWP] = useState(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const qc = useQueryClient();

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: async () => {
      if (projectId) {
        return base44.entities.WorkPackage.filter({ project_id: projectId });
      }
      const all = await base44.entities.WorkPackage.list();
      return all.sort((a, b) => {
        const pa = a.project_name || '';
        const pb = b.project_name || '';
        if (pa !== pb) return pa.localeCompare(pb);
        return (a.wp_number || '').localeCompare(b.wp_number || '');
      });
    },
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () =>
      projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    initialData: [],
  });

  const updateWPMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkPackage.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package updated");
    },
    onError: (err) => toast.error("Update failed: " + err.message),
  });

  const createWPMut = useMutation({
    mutationFn: async (d) => {
      let wpNumber;
      try {
        wpNumber = projectId ? await getNextNumber(projectId, "WORK_PACKAGE") : null;
      } catch (e) {
        wpNumber = null;
      }
      if (!wpNumber) {
        wpNumber = `WP-${String((workPackages.length || 0) + 1).padStart(2, "0")}`;
      }
      return base44.entities.WorkPackage.create({
        ...d,
        wp_number: wpNumber,
        project_id: d.project_id || projectId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package created");
    },
    onError: (err) => toast.error("Create failed: " + err.message),
  });

  const quickCompleteMut = useMutation({
    mutationFn: ({ id }) =>
      base44.entities.WorkPackage.update(id, { status: "Complete", percent_complete: 100 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      toast.success("Work package marked complete");
    },
    onError: () => toast.error("Update failed"),
  });

  const handleWPSave = (d) => {
    if (editingWP) {
      updateWPMut.mutate({ id: editingWP.id, data: d });
    } else {
      createWPMut.mutate(d);
    }
  };

  const handleWPEdit = (wp) => {
    if (wp._quickComplete) {
      quickCompleteMut.mutate({ id: wp.id });
    } else {
      setEditingWP(wp);
      setWPModalOpen(true);
    }
  };

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const filtered = workPackages.filter((wp) => {
    const statusMatch = filterStatus === "all" || wp.status === filterStatus;
    const phaseMatch = filterPhase === "all" || wp.phase === filterPhase;
    return statusMatch && phaseMatch;
  });

  const grouped = !projectId
    ? filtered.reduce((acc, wp) => {
        const key = wp.project_name || wp.project_id || 'Unknown Project';
        if (!acc[key]) acc[key] = [];
        acc[key].push(wp);
        return acc;
      }, {})
    : null;

  const stats = {
    total: workPackages.length,
    notStarted: workPackages.filter((wp) => wp.status === "Not Started").length,
    inProgress: workPackages.filter((wp) => wp.status === "In Progress").length,
    complete: workPackages.filter((wp) => wp.status === "Complete").length,
    onHold: workPackages.filter((wp) => wp.status === "On Hold").length,
    totalTonnage: workPackages.reduce((sum, wp) => sum + (wp.tonnage || 0), 0),
  };

  const phases = ["Detailing", "Fabrication", "Delivery", "Erection"];
  const statuses = ["Not Started", "In Progress", "Complete", "On Hold"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Work Packages
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 4,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {projectId
              ? `${selectedProject?.name || 'All Projects'} · ${workPackages.length} Packages`
              : `${Object.keys(grouped || {}).length} Projects · ${workPackages.length} Packages`
            } &middot; {stats.totalTonnage}T Steel
          </p>
        </div>
        <button
          onClick={() => { setEditingWP(null); setWPModalOpen(true); }}
          style={{
            background: "var(--accent)", color: "#fff", border: "none",
            borderRadius: 8, padding: "8px 16px", fontFamily: "var(--font-mono)",
            fontSize: 10, fontWeight: 700, cursor: "pointer",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}
        >
          + NEW WP
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Not Started" value={stats.notStarted} color="var(--text-muted)" />
        <StatCard label="In Progress" value={stats.inProgress} color="var(--status-warning)" />
        <StatCard label="Complete" value={stats.complete} color="var(--status-success)" />
        <StatCard label="On Hold" value={stats.onHold} color="var(--status-info)" />
        <StatCard label="Total Tonnage" value={`${stats.totalTonnage}T`} color="var(--accent)" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Phase:
          </span>
          {["all", ...phases].map((phase) => (
            <button
              key={phase}
              onClick={() => setFilterPhase(phase)}
              style={{
                background: filterPhase === phase ? "var(--accent)" : "var(--bg-surface)",
                color: filterPhase === phase ? "white" : "var(--text-secondary)",
                border: `1px solid ${filterPhase === phase ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "6px", padding: "6px 12px", fontFamily: "var(--font-mono)",
                fontSize: "8px", fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}
            >
              {phase === "all" ? "All" : phase}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Status:
          </span>
          {["all", ...statuses].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                background: filterStatus === status ? "var(--accent)" : "var(--bg-surface)",
                color: filterStatus === status ? "white" : "var(--text-secondary)",
                border: `1px solid ${filterStatus === status ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "6px", padding: "6px 12px", fontFamily: "var(--font-mono)",
                fontSize: "8px", fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}
            >
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>
      </div>

      {/* Work Packages List */}
      {projectId ? (
        <WorkPackageList
          workPackages={filtered}
          onSelectWP={setSelectedWP}
          onEdit={handleWPEdit}
          showProject={false}
        />
      ) : (
        Object.entries(grouped || {}).map(([projectName, wps]) => (
          <div key={projectName}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 6px 0', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                {projectName}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', background: 'var(--bg-surface-high)', padding: '1px 8px', borderRadius: 4 }}>
                {wps.length} WPs
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
            </div>
            <WorkPackageList
              workPackages={wps}
              onSelectWP={setSelectedWP}
              onEdit={handleWPEdit}
              showProject={false}
            />
          </div>
        ))
      )}

      {/* Detail Modal */}
      {selectedWP && (
        <WorkPackageDetailModal
          wp={selectedWP}
          onClose={() => setSelectedWP(null)}
        />
      )}

      {/* WP Form Modal */}
      <WPFormModal
        open={wpModalOpen}
        onClose={() => { setWPModalOpen(false); setEditingWP(null); }}
        onSave={handleWPSave}
        wp={editingWP}
        projects={projects}
        nextNumber={`WP-${String((workPackages.length || 0) + 1).padStart(2, "0")}`}
        allDrawings={drawings}
      />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "10px",
        padding: "12px",
        borderTop: `2px solid ${color}`,
      }}
    >
      <div style={{ fontSize: "18px", fontWeight: 700, color: color, marginBottom: "4px" }}>
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)",
          letterSpacing: "0.10em", textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}