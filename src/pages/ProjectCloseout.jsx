import { useProjectId } from "@/hooks/useProjectId";
import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ProjectCloseoutForm from "@/components/closeout/ProjectCloseoutForm";
import ProjectCloseoutChecklist from "@/components/closeout/ProjectCloseoutChecklist";
import ProjectCloseoutSummary from "@/components/closeout/ProjectCloseoutSummary";
import { CommandBar } from "@/components/design-system";
import { buildCloseoutDbPayload } from "@/lib/closeout/closeoutPayload";
import { withProjectId } from "@/lib/mutations/standardMutation";

export default function ProjectCloseout() {
  const projectId = useProjectId();
  const [activeTab, setActiveTab] = useState("checklist");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const closeoutQueryKey = ["closeouts", projectId];
  const { data: closeouts = [] } = useQuery({
    queryKey: closeoutQueryKey,
    queryFn: () =>
      projectId
        ? entities.ProjectCloseout.filter({ project_id: projectId })
        : entities.ProjectCloseout.list(),
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const projectCloseout = closeouts[0] || null;
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: (data) => entities.ProjectCloseout.create(withProjectId(data, projectId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: closeoutQueryKey });
      toast.success("Closeout record created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }) => entities.ProjectCloseout.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: closeoutQueryKey });
      const previous = qc.getQueryData(closeoutQueryKey);
      qc.setQueryData(closeoutQueryKey, (current = []) =>
        current.map((row) => row.id === id ? { ...row, ...patch } : row),
      );
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) qc.setQueryData(closeoutQueryKey, context.previous);
      toast.error(err.message);
    },
    onSuccess: (updated) => {
      qc.setQueryData(closeoutQueryKey, (current = []) =>
        current.map((row) => row.id === updated.id ? updated : row),
      );
      toast.success("Closeout updated");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: closeoutQueryKey }),
  });

  const handleSave = async (data) => {
    if (projectCloseout) {
      await updateMut.mutateAsync({ id: projectCloseout.id, patch: data });
    } else {
      await createMut.mutateAsync(data);
    }
  };

  const handleChecklistUpdate = async (uiPatch) => {
    if (!projectCloseout) return;
    const patch = buildCloseoutDbPayload(uiPatch, projectCloseout);
    await updateMut.mutateAsync({ id: projectCloseout.id, patch });
  };

  const tabs = [
    { label: "Checklist", id: "checklist" },
    { label: "Summary", id: "summary" },
    { label: "Lessons Learned", id: "lessons" },
  ];

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "SELECT PROJECT"}
        title="Project Closeout"
        subtitle="Handover checklist · final billing summary · lessons learned"
      />

      {!projectCloseout ? (
        <ProjectCloseoutForm projectId={projectId} onSave={handleSave} />
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden", width: "fit-content" }}>
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: activeTab === tab.id ? "var(--accent-muted)" : "transparent",
                  color: activeTab === tab.id ? "var(--accent)" : "var(--text-secondary)",
                  border: "none",
                  borderRight: i < tabs.length - 1 ? "1px solid var(--border-default)" : "none",
                  padding: "8px 14px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeTab === "checklist" && (
            <ProjectCloseoutChecklist
              closeout={projectCloseout}
              isUpdating={updateMut.isPending}
              onUpdate={handleChecklistUpdate}
            />
          )}
          {activeTab === "summary" && (
            <ProjectCloseoutSummary
              closeout={projectCloseout}
              onUpdate={handleChecklistUpdate}
            />
          )}          {activeTab === "lessons" && <ProjectCloseoutLessons closeout={projectCloseout} />}
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
