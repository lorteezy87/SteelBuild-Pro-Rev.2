/**
 * ResourceHub — canonical Resource Register entry point.
 *
 * ResourcesControlCenter is the supported Resource Register implementation.
 * This shell remains responsible for CRUD plumbing (open modal, mutation
 * wiring, delete confirmation) while keeping tab navigation for the two
 * supported resource workflows:
 *
 * - Resource Register (ResourcesControlCenter)
 * - Crew Schedule (ResourceScheduling)
 *
 * Legacy ResourceManagement links continue through compatibility redirect.
 */
import { Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { useProjectContext } from "@/components/shared/ProjectContext";
import ResourcesControlCenter from "@/pages/resources/ResourcesControlCenter";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";

const CrewSchedule = lazyWithRetry(() => import("@/pages/ResourceScheduling"));
const ResourceFormModal = lazyWithRetry(() => import("@/components/resources/ResourceFormModal"));

const TABS = [
  { key: "register", label: "Resource Register" },
  { key: "schedule", label: "Crew Schedule" },
];

export default function ResourceHub() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [params, setParams] = useSearchParams();
  const param = params.get("res_tab");
  const activeTab = TABS.some((t) => t.key === param) ? param : "register";
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("res_tab", key);
        return next;
      },
      { replace: true },
    );

  /* ── Resource CRUD, on behalf of ResourcesControlCenter ── */
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const closeForm = () => { setShowForm(false); setEditing(null); };

  // ResourcesControlCenter owns the grid and hands us resource rows plus
  // action hooks. Its own rendering handles reads and role gating; this
  // shell only owns persistence + lifecycle glue.
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.Resource.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Resource updated");
      closeForm();
    },
    onError: (e) => toast.error(`Failed to update resource: ${toUserErrorMessage(e, "Unknown error")}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.Resource.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Resource deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(`Failed to delete resource: ${toUserErrorMessage(e, "Unknown error")}`),
  });

  // The modal only calls onSave in edit mode; it owns the create mutation itself.
  const handleSave = (data) => {
    if (editing) updateMut.mutate({ id: editing.id, data });
  };

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      {/* Slim tab strip — switches between the two resource surfaces */}
      <div
        role="tablist"
        aria-label="Resources"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "10px 24px 0",
          flexWrap: "wrap",
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(tab.key)}
              style={{
                minHeight: 34,
                padding: "7px 14px",
                borderRadius: 9,
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border-default)"}`,
                background: isActive
                  ? "color-mix(in srgb, var(--accent) 14%, var(--bg-surface-high))"
                  : "var(--bg-surface-low)",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ minHeight: 0, position: "relative" }}>
        <ErrorBoundary label="Resources">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            {activeTab === "register"
              ? <ResourcesControlCenter
                  projectName={activeProject?.name}
                  onAddResource={() => { setEditing(null); setShowForm(true); }}
                  onEditResource={(r) => { setEditing(r); setShowForm(true); }}
                  onDeleteResource={setDeleteTarget}
                />
              : <CrewSchedule />}
          </Suspense>
        </ErrorBoundary>
      </div>

      {showForm && (
        <Suspense fallback={null}>
          <ResourceFormModal
            projectId={activeProject?.id}
            editing={editing}
            onClose={closeForm}
            onSave={handleSave}
          />
        </Suspense>
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Resource"
        description={`Delete "${deleteTarget?.name || "this resource"}"? Crew members assigned to it become top-level resources. This cannot be undone.`}
      />
    </div>
  );
}
