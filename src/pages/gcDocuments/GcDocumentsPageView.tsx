/**
 * GcDocumentsPageView — JSX only. All state lives in useGcDocumentsPageState,
 * all reads in useGcDocumentsPageData, all writes in the controller.
 */

import WorkflowFetchState from "@/components/shared/WorkflowFetchState";
import { EmptyState } from "./dsPrimitives";
import DeleteDialog from "@/components/shared/DeleteDialog";
import {
  GC_DOC_TYPES,
  GC_DOC_TYPE_LABELS,
  STEEL_IMPACT_LABELS,
  STEEL_IMPACT_STATES,
} from "@/lib/gcDocuments/gcDocTypes";
import GcDocumentsPageToolbar from "./GcDocumentsPageToolbar";
import GcIssuanceTable from "./GcIssuanceTable";
import GcIssuanceFormModal from "./GcIssuanceFormModal";
import GcImpactModal from "./GcImpactModal";
import { ALL, NEEDS_REVIEW } from "./gcDocumentsPageDerive";
import type { GcDocumentsPageController } from "./useGcDocumentsPageController";
import type { GcDocumentsPageData } from "./useGcDocumentsPageData";
import type { GcDocumentsPageState } from "./useGcDocumentsPageState";

const selectStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface-low)",
  color: "var(--text-primary)",
  fontSize: 12.5,
  outline: "none",
};

export default function GcDocumentsPageView({
  projectId,
  projectName,
  canCreate,
  canEdit,
  canDelete,
  data,
  state,
  controller,
}: {
  projectId: string | null;
  projectName?: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  data: GcDocumentsPageData;
  state: GcDocumentsPageState;
  controller: GcDocumentsPageController;
}) {
  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          SELECT A PROJECT TO VIEW GC DOCUMENTS
        </p>
      </div>
    );
  }

  if (data.queryError || data.isLoading) {
    return (
      <WorkflowFetchState
        label="GC Documents"
        error={data.queryError}
        onRetry={() => { void data.refetch(); }}
      />
    );
  }

  const filtersActive =
    state.search.trim() !== "" || state.docType !== ALL || state.impact !== ALL;

  return (
    <div className="sb-dashboard-reference-page" style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <GcDocumentsPageToolbar
        projectName={projectName}
        stats={data.stats}
        impact={state.impact}
        canCreate={canCreate}
        onImpactFilter={state.setImpact}
        onLogIssuance={() => state.setUploadOpen(true)}
        onExpandAll={controller.expandAll}
        onCollapseAll={controller.collapseAll}
      />

      {data.stats.needsReview > 0 && state.impact !== NEEDS_REVIEW && (
        <div
          role="status"
          style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            padding: "8px 14px", marginBottom: 14, borderRadius: 8,
            border: "1px solid var(--status-review)",
            background: "var(--bg-surface-low)",
          }}
        >
          <span style={{ fontSize: 12.5, color: "var(--text-secondary, var(--text-muted))", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--text-primary)" }}>{data.stats.needsReview}</strong>
            {" "}issuance(s) have not been reviewed for steel impact. Not reviewed is not the same as no impact.
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="sbd-btn"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => state.setImpact(NEEDS_REVIEW)}
          >
            Show them
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          flexWrap: "wrap", marginBottom: 12,
        }}
      >
        <input
          value={state.search}
          onChange={(e) => state.setSearch(e.target.value)}
          placeholder="Search issuance, number, sheet…"
          aria-label="Search GC documents"
          style={{ ...selectStyle, flex: "0 1 380px", minWidth: 200 }}
        />
        <select
          value={state.docType}
          onChange={(e) => state.setDocType(e.target.value)}
          aria-label="Filter by document type"
          style={selectStyle}
        >
          <option value={ALL}>All types ({data.stats.total})</option>
          {GC_DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {GC_DOC_TYPE_LABELS[t]} ({data.docTypeCounts.get(t) ?? 0})
            </option>
          ))}
        </select>
        <select
          value={state.impact}
          onChange={(e) => state.setImpact(e.target.value)}
          aria-label="Filter by steel impact"
          style={selectStyle}
        >
          <option value={ALL}>Any impact state</option>
          <option value={NEEDS_REVIEW}>Needs review ({data.stats.needsReview})</option>
          {STEEL_IMPACT_STATES.map((s) => (
            <option key={s} value={s}>{STEEL_IMPACT_LABELS[s]}</option>
          ))}
        </select>
        {filtersActive && (
          <button
            type="button"
            className="sbd-btn"
            onClick={() => {
              state.setSearch("");
              state.setDocType(ALL);
              state.setImpact(ALL);
            }}
            style={{ fontSize: 11 }}
          >
            Clear filters
          </button>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          {data.filtered.length} of {data.stats.total}
        </span>
      </div>

      {data.filtered.length === 0 ? (
        <EmptyState
          icon="rfi"
          title={filtersActive ? "Nothing matches those filters" : "No GC documents logged yet"}
          body={
            filtersActive
              ? "Clear the filters to see the whole register."
              : "Log what the GC sends — drawing sets, ASIs, addenda, bulletins, CCDs and contract documents — so revisions against your steel are traceable."
          }
        />
      ) : (
        <GcIssuanceTable
          issuances={data.filtered}
          expanded={state.expanded}
          canEdit={canEdit}
          canDelete={canDelete}
          onToggleExpand={controller.toggleExpanded}
          onEdit={(i) => state.setEditingSet(i.set)}
          onSetImpact={(i) => state.setImpactTarget(i)}
          onDelete={controller.handleDelete}
        />
      )}

      <GcIssuanceFormModal
        open={state.uploadOpen}
        saving={state.saving}
        onSave={(values) => controller.handleCreate({ set: values })}
        onClose={() => state.setUploadOpen(false)}
      />

      <GcIssuanceFormModal
        open={!!state.editingSet}
        initial={state.editingSet}
        saving={state.saving}
        onSave={controller.handleSaveSet}
        onClose={() => state.setEditingSet(null)}
      />

      <GcImpactModal
        open={!!state.impactTarget}
        issuance={state.impactTarget}
        saving={state.saving}
        onSave={controller.handleSaveImpact}
        onClose={() => state.setImpactTarget(null)}
      />

      <DeleteDialog
        open={!!state.confirmState}
        title={state.confirmState?.title || ""}
        description={state.confirmState?.description || ""}
        onClose={() => state.setConfirmState(null)}
        onConfirm={() => state.confirmState?.run()}
      />
    </div>
  );
}
