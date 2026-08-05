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
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { RegisterFetchBody } from "@/components/shared/RegisterFetchStates";
import { ProjectCloseoutLessons } from "./projectCloseout/ProjectCloseoutUi";

export default function ProjectCloseout() {
  const projectId = useProjectId();
  const [activeTab, setActiveTab] = useState("checklist");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const closeoutQueryKey = ["closeouts", projectId];
  const {
    data: closeouts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
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
    onError: (err) => toast.error(toUserErrorMessage(err, "Create failed")),
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
      toast.error(toUserErrorMessage(err, "Update failed"));
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

      {isLoading || isError ? (
        <RegisterFetchBody
          isLoading={isLoading}
          isError={isError}
          errorMessage={toUserErrorMessage(error, "Failed to load closeout")}
          onRetry={() => refetch()}
          totalCount={0}
          filteredCount={0}
          emptyTitle="No closeout record"
        />
      ) : !projectCloseout ? (
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
          )}
          {activeTab === "lessons" && <ProjectCloseoutLessons closeout={projectCloseout} />}
        </>
      )}
    </div>
  );
}
