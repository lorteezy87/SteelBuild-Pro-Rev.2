/**
 * ReviewQueuePanel — the on-skin Doc Control "Reviews" view (Slice 2c).
 *
 * Presentation-only re-skin of ReviewQueue onto the canonical presentation kit. The mutations
 * (request review / record decision), permission gate, cache invalidation, and
 * duplicate-role (23505) error handling are UNCHANGED — reused verbatim from the
 * legacy view; only the chrome (card / toolbar / request form / table / decision
 * chip) is swapped to `cmd-*` primitives. Root is `.detailing-cc` so the reused
 * `sbd-select` controls inherit the shipped light token cascade.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { usePermissions } from "@/services/permissions";
import { useDrawingReviews, type DrawingReviewRow } from "@/hooks/useDrawingReviews";
import { useDrawingRegister } from "@/hooks/useDrawingRegister";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";
import { Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { attachableRegisterRows, filterReviews } from "./docControl.derive";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";

const ROLES = ["project_manager", "detailer", "shop", "field_ops", "document_control", "executive"];
const DECIDE_OPTIONS = ["approved", "approved_with_notes", "rejected", "not_required"];

const label = (s: string | null) => (s ? s.replace(/_/g, " ") : "—");

/** Decision → kit Pill tone. Mirrors the legacy DECISION_TONE hues. */
function decisionTone(decision: string): PillTone {
  switch (decision) {
    case "pending": return "warn";
    case "approved": return "good";
    case "approved_with_notes": return "info";
    case "rejected": return "danger";
    default: return "neutral"; // not_required
  }
}

export function ReviewQueuePanel({ projectId }: { projectId: string | null }) {
  const { data: reviews = [], isLoading, error } = useDrawingReviews(projectId);
  const { data: register = [] } = useDrawingRegister(projectId);
  const { can, userId } = usePermissions();
  const canManage = can("approve", "drawing");
  const qc = useQueryClient();

  const [pendingOnly, setPendingOnly] = useState(true);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqDrawing, setReqDrawing] = useState("");
  const [reqRole, setReqRole] = useState(ROLES[0]);

  const attachable = useMemo(() => attachableRegisterRows(register), [register]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drawing-reviews", projectId] });
    qc.invalidateQueries({ queryKey: ["drawing-register"] });
  };

  const requestMut = useMutation({
    mutationFn: async () => {
      const sheet = attachable.find((r) => r.drawing_id === reqDrawing);
      if (!sheet?.current_revision_id) throw new Error("Pick a sheet with a current revision");
      await entities.DrawingReview.create(withProjectId({
        drawing_revision_id: sheet.current_revision_id,
        review_role: reqRole,
        decision: "pending",
      }, projectId) as never);
    },
    onSuccess: () => { invalidate(); toast.success("Review requested"); setReqOpen(false); setReqDrawing(""); },
    onError: (e) => {
      const msg = e as { code?: string; message?: string };
      toast.error(
        msg?.code === "23505"
          ? "That role already has a review on this revision."
          : `Failed: ${toUserErrorMessage(e, "unknown")}`,
      );
    },
  });

  const decideMut = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: string }) => {
      await entities.DrawingReview.update(id, {
        decision,
        reviewed_at: new Date().toISOString(),
        reviewer_id: userId ?? null,
      } as never);
    },
    onSuccess: (_d, { decision }) => { invalidate(); toast.success(`Decision: ${label(decision)}`); },
    onError: (e) => toast.error(`Failed to record decision: ${toUserErrorMessage(e, "unknown")}`),
  });

  const rows = useMemo(() => filterReviews(reviews, pendingOnly), [reviews, pendingOnly]);

  if (!projectId) return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Select a project.</div>;
  if (isLoading) return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Loading reviews…</div>;
  if (error) return <div style={{ padding: 24, color: "var(--cmd-danger)", fontSize: 13 }}>Failed to load reviews: {(error as Error)?.message || "unknown"}</div>;

  return (
    <section className="detailing-cc" style={{ padding: 0, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--cmd-text)", fontSize: 16, fontWeight: 700 }}>Review Queue</h3>
          <p style={{ margin: "4px 0 0", color: "var(--cmd-text-muted)", fontSize: 12 }}>Role-based sign-off gates before a revision is released.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--cmd-text-muted)", fontSize: 12 }}>
            <input type="checkbox" className="cmd-check" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} /> Pending only
          </label>
          {canManage && (
            <button type="button" className="cmd-btn cmd-btn--primary" onClick={() => setReqOpen((o) => !o)}>
              {reqOpen ? "Cancel" : "Request review"}
            </button>
          )}
        </div>
      </div>

      {canManage && reqOpen && (
        <div style={{ padding: 14, borderRadius: 10, background: "var(--cmd-surface)", border: "1px solid var(--cmd-border)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="sbd-select" value={reqDrawing} onChange={(e) => setReqDrawing(e.target.value)} style={{ minWidth: 240 }}>
            <option value="">Select sheet…</option>
            {attachable.map((r) => (
              <option key={r.drawing_id} value={r.drawing_id}>{r.sheet_number} · {r.current_revision} — {r.sheet_title}</option>
            ))}
          </select>
          <select className="sbd-select" value={reqRole} onChange={(e) => setReqRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </select>
          <button type="button" className="cmd-btn cmd-btn--primary" disabled={!reqDrawing || requestMut.isPending} onClick={() => requestMut.mutate()}>
            {requestMut.isPending ? "Requesting…" : "Request"}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="cmd-table-wrap">
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--cmd-text-muted)", fontSize: 13 }}>
            {reviews.length === 0 ? "No reviews requested yet." : "No reviews match the filter."}
          </div>
        </div>
      ) : (
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                <th>Sheet</th>
                <th>Rev</th>
                <th>Role</th>
                <th>Decision</th>
                <th>Reviewed</th>
                {canManage && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: DrawingReviewRow) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700, color: "var(--cmd-text)", whiteSpace: "nowrap" }}>
                    {r.sheet_number || "—"}
                    <span style={{ color: "var(--cmd-text-muted)", fontWeight: 400, marginLeft: 6 }}>{r.sheet_title || ""}</span>
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--cmd-text)" }}>{r.revision_code || "—"}</td>
                  <td style={{ color: "var(--cmd-text-muted)" }}>{label(r.review_role)}</td>
                  <td><Pill tone={decisionTone(r.decision)}>{label(r.decision)}</Pill></td>
                  <td style={{ color: "var(--cmd-text-muted)", whiteSpace: "nowrap" }}>{r.reviewed_at ? fmtDate(r.reviewed_at) : "—"}</td>
                  {canManage && (
                    <td>
                      <select
                        className="sbd-select"
                        value=""
                        disabled={decideMut.isPending}
                        onChange={(e) => { const v = e.target.value; if (v) decideMut.mutate({ id: r.id, decision: v }); e.target.value = ""; }}
                        style={{ fontSize: 11 }}
                        title="Record a decision"
                      >
                        <option value="">{r.decision === "pending" ? "Decide…" : "Change…"}</option>
                        {DECIDE_OPTIONS.map((d) => <option key={d} value={d}>{label(d)}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
