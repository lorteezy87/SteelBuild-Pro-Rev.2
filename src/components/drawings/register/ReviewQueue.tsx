/**
 * ReviewQueue — role-based review gates for drawing revisions. Lists reviews
 * (pending first) with sheet/role/decision, lets PM+ request a review for a
 * sheet's current revision (role-scoped), and lets PM+/reviewers record a
 * decision. The register's pending-review count + (future) release gating read
 * off these rows.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { usePermissions } from "@/services/permissions";
import { useDrawingReviews, type DrawingReviewRow } from "@/hooks/useDrawingReviews";
import { useDrawingRegister } from "@/hooks/useDrawingRegister";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";

const muted = "var(--text-muted)";
const primary = "var(--text-primary)";
const mono = "var(--font-mono)";

const ROLES = ["project_manager", "detailer", "shop", "field_ops", "document_control", "executive"];
const DECIDE_OPTIONS = ["approved", "approved_with_notes", "rejected", "not_required"];

const DECISION_TONE: Record<string, string> = {
  pending: "var(--status-warning)",
  approved: "var(--status-success)",
  approved_with_notes: "var(--status-info)",
  rejected: "var(--status-error)",
  not_required: "var(--text-muted)",
};

const label = (s: string | null) => (s ? s.replace(/_/g, " ") : "—");

function DecisionChip({ decision }: { decision: string }) {
  const tone = DECISION_TONE[decision] || muted;
  return (
    <span style={{
      fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
      color: tone, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
      background: `color-mix(in srgb, ${tone} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)`,
    }}>
      {label(decision)}
    </span>
  );
}

export function ReviewQueue({ projectId }: { projectId: string | null }) {
  const { data: reviews = [], isLoading, error } = useDrawingReviews(projectId);
  const { data: register = [] } = useDrawingRegister(projectId);
  const { can, userId } = usePermissions();
  const canManage = can("approve", "drawing");
  const qc = useQueryClient();

  const [pendingOnly, setPendingOnly] = useState(true);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqDrawing, setReqDrawing] = useState("");
  const [reqRole, setReqRole] = useState(ROLES[0]);

  const attachable = useMemo(() => register.filter((r) => !!r.current_revision_id), [register]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drawing-reviews", projectId] });
    qc.invalidateQueries({ queryKey: ["drawing-register"] });
  };

  const requestMut = useMutation({
    mutationFn: async () => {
      const sheet = attachable.find((r) => r.drawing_id === reqDrawing);
      if (!sheet?.current_revision_id) throw new Error("Pick a sheet with a current revision");
      await entities.DrawingReview.create({
        project_id: projectId as string,
        drawing_revision_id: sheet.current_revision_id,
        review_role: reqRole,
        decision: "pending",
      } as never);
    },
    onSuccess: () => { invalidate(); toast.success("Review requested"); setReqOpen(false); setReqDrawing(""); },
    onError: (e) => {
      const msg = (e as { code?: string; message?: string });
      toast.error(msg?.code === "23505" ? "That role already has a review on this revision." : "Failed: " + (msg?.message || "unknown"));
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
    onError: (e) => toast.error("Failed to record decision: " + ((e as Error)?.message || "unknown")),
  });

  const rows = useMemo(
    () => (pendingOnly ? reviews.filter((r) => r.decision === "pending") : reviews),
    [reviews, pendingOnly]
  );

  if (!projectId) return <div style={{ padding: 24, color: muted, fontSize: 13 }}>Select a project.</div>;
  if (isLoading) return <div style={{ padding: 24, color: muted, fontSize: 13 }}>Loading reviews…</div>;
  if (error) return <div style={{ padding: 24, color: "var(--status-error)", fontSize: 13 }}>Failed to load reviews: {(error as Error)?.message || "unknown"}</div>;

  return (
    <section className="sbd-card" style={{ padding: 16, borderRadius: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: primary, fontSize: 16 }}>Review Queue</h3>
          <p style={{ margin: "4px 0 0", color: muted, fontSize: 12 }}>Role-based sign-off gates before a revision is released.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: muted, fontSize: 12 }}>
            <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} /> Pending only
          </label>
          {canManage && (
            <button type="button" className="sbd-btn sbd-btn-primary" onClick={() => setReqOpen((o) => !o)}>
              {reqOpen ? "Cancel" : "Request review"}
            </button>
          )}
        </div>
      </div>

      {canManage && reqOpen && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="sbd-select" value={reqDrawing} onChange={(e) => setReqDrawing(e.target.value)} style={{ minWidth: 240 }}>
            <option value="">Select sheet…</option>
            {attachable.map((r) => (
              <option key={r.drawing_id} value={r.drawing_id}>{r.sheet_number} · {r.current_revision} — {r.sheet_title}</option>
            ))}
          </select>
          <select className="sbd-select" value={reqRole} onChange={(e) => setReqRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </select>
          <button type="button" className="sbd-btn sbd-btn-primary" disabled={!reqDrawing || requestMut.isPending} onClick={() => requestMut.mutate()}>
            {requestMut.isPending ? "Requesting…" : "Request"}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: muted, fontSize: 13 }}>
          {reviews.length === 0 ? "No reviews requested yet." : "No reviews match the filter."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: muted, fontFamily: mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                <th style={{ padding: "6px 8px" }}>Sheet</th>
                <th style={{ padding: "6px 8px" }}>Rev</th>
                <th style={{ padding: "6px 8px" }}>Role</th>
                <th style={{ padding: "6px 8px" }}>Decision</th>
                <th style={{ padding: "6px 8px" }}>Reviewed</th>
                {canManage && <th style={{ padding: "6px 8px" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: DrawingReviewRow) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-default)" }}>
                  <td style={{ padding: "8px", fontWeight: 700, color: primary, whiteSpace: "nowrap" }}>
                    {r.sheet_number || "—"}
                    <span style={{ color: muted, fontWeight: 400, marginLeft: 6 }}>{r.sheet_title || ""}</span>
                  </td>
                  <td style={{ padding: "8px", fontFamily: mono, color: primary }}>{r.revision_code || "—"}</td>
                  <td style={{ padding: "8px", color: muted }}>{label(r.review_role)}</td>
                  <td style={{ padding: "8px" }}><DecisionChip decision={r.decision} /></td>
                  <td style={{ padding: "8px", color: muted, whiteSpace: "nowrap" }}>{r.reviewed_at ? fmtDate(r.reviewed_at) : "—"}</td>
                  {canManage && (
                    <td style={{ padding: "8px" }}>
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
