import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ProjectCloseoutForm from "@/components/closeout/ProjectCloseoutForm";
import ProjectCloseoutChecklist from "@/components/closeout/ProjectCloseoutChecklist";
import ProjectCloseoutSummary from "@/components/closeout/ProjectCloseoutSummary";

export default function ProjectCloseout() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [activeTab, setActiveTab] = useState("checklist");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: closeouts = [] } = useQuery({
    queryKey: ["closeouts", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ProjectCloseout.filter({ project_id: projectId })
        : base44.entities.ProjectCloseout.list(),
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const projectCloseout = closeouts[0] || null;
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ProjectCloseout.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closeouts", projectId] });
      toast.success("Closeout record created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.ProjectCloseout.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closeouts", projectId] });
      toast.success("Closeout updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (data) => {
    if (projectCloseout) {
      updateMut.mutate({ ...data, id: projectCloseout.id });
    } else {
      createMut.mutate(data);
    }
  };

  const tabs = [
    { label: "Checklist", id: "checklist" },
    { label: "Summary", id: "summary" },
    { label: "Lessons Learned", id: "lessons" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Project Closeout</h1>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>{selectedProject ? selectedProject.name : "Select Project"}</p>
      </div>

      {!projectCloseout ? (
        <ProjectCloseoutForm projectId={projectId} selectedProject={selectedProject} onSave={handleSave} />
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-default)", paddingBottom: "12px" }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: activeTab === tab.id ? "var(--accent)" : "transparent",
                  color: activeTab === tab.id ? "white" : "var(--text-muted)",
                  border: activeTab === tab.id ? `1px solid var(--accent)` : "1px solid var(--border-default)",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeTab === "checklist" && <ProjectCloseoutChecklist closeout={projectCloseout} onUpdate={(data) => updateMut.mutate({ ...data, id: projectCloseout.id })} />}
          {activeTab === "summary" && <ProjectCloseoutSummary closeout={projectCloseout} onUpdate={(data) => updateMut.mutate({ ...data, id: projectCloseout.id })} />}
          {activeTab === "lessons" && <ProjectCloseoutLessons closeout={projectCloseout} />}
        </>
      )}
    </div>
  );
}

function ProjectCloseoutLessons({ closeout }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>✓ Successes</h3>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{closeout.project_successes || "No successes documented"}</p>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--status-warning)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>⚠ Challenges</h3>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{closeout.challenges_faced || "No challenges documented"}</p>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--status-info)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>💡 Recommendations</h3>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{closeout.recommendations || "No recommendations documented"}</p>
      </div>

      <div style={{ gridColumn: "1 / -1", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>📚 Lessons Learned</h3>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{closeout.lessons_learned || "No lessons learned documented"}</p>
      </div>
    </div>
  );
}