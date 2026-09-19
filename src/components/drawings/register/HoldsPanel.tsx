/**
 * HoldsPanel — the on-skin Doc Control "Holds & Blockers" view.
 *
 * A hold is a per-sheet blocker with a REQUIRED reason and a full
 * placed/released audit trail (drawing_holds, migration 20260908045525).
 * It is distinct from drawing_sets.is_locked — that's a whole-set admin
 * write-barrier; a hold is workflow-meaningful and operational.
 *
 * Placing a hold snapshots the sheet's current revision release_status and
 * flips it to 'on_hold' (a value that already existed in the CHECK
 * constraint and the register's status filter but nothing wrote — this
 * feature is what finally produces it). Releasing restores the snapshot.
 * drawing_holds stays the durable source of truth; the release_status
 * sync is best-effort and surfaced as a warning if it fails.
 */
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { usePermissions } from "@/services/permissions";
import { useAuth } from "@/lib/AuthContext";
import { useDrawingRegister } from "@/hooks/useDrawingRegister";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import { DRAWING_HOLDS_QUERY_KEY, useDrawingHolds } from "@/hooks/useDrawingHolds";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";
import { Pill } from "@/components/command";

const ON_HOLD_STATUS = "on_hold";

/** Stable identity so the `register` memos don't re-run on every render. */
const EMPTY_REGISTER: DrawingRegisterRow[] = [];

/**
 * What the sheet picker should say when it has no options to offer. Split out
 * so the three causes stay distinguishable and testable:
 * unread register ≠ failed register ≠ genuinely every sheet already held.
 */
export function holdPickerEmptyMessage(args: {
  registerKnown: boolean;
  registerLoading: boolean;
  registerError: boolean;
  optionCount: number;
}): string {
  if (args.registerError) return "Couldn't load the sheet list, so no sheets can be offered. Retry in a moment.";
  if (!args.registerKnown || args.registerLoading) return "Loading sheets…";
  if (args.optionCount === 0) return "Every sheet already has an active hold.";
  return "No sheets match.";
}

type Scope = "active" | "released" | "all";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "released", label: "Released" },
  { key: "all", label: "All" },
];

interface SheetOption {
  drawingId: string;
  sheetNumber: string;
  sheetTitle: string;
  currentRevisionId: string | null;
  currentStatus: string | null;
}

/** Sheets that can take a NEW hold: those without an active one already. */
export function holdableSheets(register: DrawingRegisterRow[]): SheetOption[] {
  return register
    .filter((row) => !row.active_hold_id)
    .map((row) => ({
      drawingId: row.drawing_id,
      sheetNumber: row.sheet_number || "",
      sheetTitle: row.sheet_title || "",
      currentRevisionId: row.current_revision_id,
      currentStatus: row.current_status,
    }))
    .sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber, undefined, { numeric: true }));
}

export function filterHoldsByScope(holds: DrawingHoldRow[], scope: Scope): DrawingHoldRow[] {
  if (scope === "active") return holds.filter((hold) => hold.is_active);
  if (scope === "released") return holds.filter((hold) => !hold.is_active);
  return holds;
}

function sheetLabel(row: DrawingRegisterRow | undefined, drawingId: string): string {
  if (!row) return `Sheet ${drawingId.slice(0, 8)}`;
  return row.sheet_number || "Unnumbered sheet";
}

export function HoldsPanel({ projectId }: { projectId: string | null }) {
  const { data: holds = [], isLoading, error } = useDrawingHolds(projectId);
  // The register is a SEPARATE query from the holds one, and the guards below
  // only cover holds. An unread register is `[]`, and `holdableSheets([])` is
  // also `[]` — which the picker rendered as "Every sheet already has an active
  // hold." With zero holds live, the holds query answers first on every visit,
  // so that false claim was what a PM saw while the register was still landing.
  // Absence is not evidence: carry the unknown through instead of defaulting.
  const { data: registerData, isLoading: registerLoading, error: registerError } = useDrawingRegister(projectId);
  const registerKnown = registerData !== undefined;
  const register = registerData ?? EMPTY_REGISTER;
  const { can } = usePermissions();
  const { user } = useAuth();
  const canHold = can("hold", "drawing");
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<Scope>("active");
  const [placing, setPlacing] = useState(false);
  const [sheetQuery, setSheetQuery] = useState("");
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState("");

  const registerByDrawingId = useMemo(
    () => new Map(register.map((row) => [row.drawing_id, row])),
    [register],
  );
  const options = useMemo(() => holdableSheets(register), [register]);
  const visibleOptions = useMemo(() => {
    const q = sheetQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) =>
      option.sheetNumber.toLowerCase().includes(q) || option.sheetTitle.toLowerCase().includes(q),
    );
  }, [options, sheetQuery]);
  const visibleHolds = useMemo(() => filterHoldsByScope(holds, scope), [holds, scope]);
  const activeCount = useMemo(() => holds.filter((hold) => hold.is_active).length, [holds]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [DRAWING_HOLDS_QUERY_KEY, projectId] });
    queryClient.invalidateQueries({ queryKey: ["drawing-register", projectId] });
  };

  const resetPlaceForm = () => {
    setPlacing(false);
    setSheetQuery("");
    setSelectedDrawingId(null);
    setReason("");
  };

  const actorName = user?.full_name || user?.email || null;

  const placeMutation = useMutation({
    mutationFn: async () => {
      const trimmedReason = reason.trim();
      if (!selectedDrawingId) throw new Error("Pick a sheet to place the hold on");
      if (!trimmedReason) throw new Error("A reason is required to place a hold");
      const option = options.find((candidate) => candidate.drawingId === selectedDrawingId);
      if (!option) throw new Error("That sheet already has an active hold");

      await entities.DrawingHold.create(
        withProjectId({
          drawing_id: selectedDrawingId,
          reason: trimmedReason,
          prior_release_status: option.currentStatus,
          placed_by_id: user?.id ?? null,
          placed_by_name: actorName,
        }, projectId) as never,
      );

      // Best-effort: mark the current revision on_hold so the register's
      // existing status pill reflects it. The hold row is the source of truth.
      let statusSynced = true;
      if (option.currentRevisionId && option.currentStatus !== ON_HOLD_STATUS) {
        try {
          await entities.DrawingRevision.update(option.currentRevisionId, { release_status: ON_HOLD_STATUS } as never);
        } catch {
          statusSynced = false;
        }
      }
      return { sheetNumber: option.sheetNumber, statusSynced };
    },
    onSuccess: ({ sheetNumber, statusSynced }) => {
      invalidate();
      toast.success(`Hold placed on ${sheetNumber || "sheet"}`);
      if (!statusSynced) toast.warning("Hold recorded, but the register status could not be updated to on-hold.");
      resetPlaceForm();
    },
    onError: (mutationError) => {
      invalidate();
      toast.error(`Failed to place hold: ${toUserErrorMessage(mutationError, "unknown")}`);
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (hold: DrawingHoldRow) => {
      await entities.DrawingHold.update(hold.id, {
        is_active: false,
        released_at: new Date().toISOString(),
        released_by_id: user?.id ?? null,
        released_by_name: actorName,
        release_notes: releaseNotes.trim() || null,
      } as never);

      // Restore the snapshot on whatever revision is current NOW (a new
      // revision may have landed while the hold was active).
      let statusSynced = true;
      const row = registerByDrawingId.get(hold.drawing_id);
      if (row?.current_revision_id && row.current_status === ON_HOLD_STATUS && hold.prior_release_status) {
        try {
          await entities.DrawingRevision.update(row.current_revision_id, { release_status: hold.prior_release_status } as never);
        } catch {
          statusSynced = false;
        }
      }
      return { sheetNumber: sheetLabel(row, hold.drawing_id), statusSynced };
    },
    onSuccess: ({ sheetNumber, statusSynced }) => {
      invalidate();
      toast.success(`Hold released on ${sheetNumber}`);
      if (!statusSynced) toast.warning("Hold released, but the register status could not be restored.");
      setReleasingId(null);
      setReleaseNotes("");
    },
    onError: (mutationError) => {
      invalidate();
      toast.error(`Failed to release hold: ${toUserErrorMessage(mutationError, "unknown")}`);
    },
  });

  if (!projectId) return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Select a project.</div>;
  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--cmd-danger)", fontSize: 13 }}>
        Failed to load holds: {toUserErrorMessage(error, "unknown")}
      </div>
    );
  }

  const labelStyle = { display: "grid", gap: 4, color: "var(--cmd-text-muted)", fontSize: 10, fontWeight: 800 } as const;

  return (
    <section className="detailing-cc" style={{ padding: 0, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--cmd-text)", fontSize: 16, fontWeight: 700 }}>
            Holds &amp; Blockers
            {activeCount > 0 && (
              <span style={{ marginLeft: 8, fontSize: 11, fontVariantNumeric: "tabular-nums", color: "var(--cmd-warn)" }}>
                {activeCount} active
              </span>
            )}
          </h3>
          <p style={{ margin: "4px 0 0", color: "var(--cmd-text-muted)", fontSize: 12 }}>
            Per-sheet blockers with a required reason. Releasing restores the sheet&apos;s prior status.
          </p>
        </div>
        {canHold && (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={() => (placing ? resetPlaceForm() : setPlacing(true))}>
            {placing ? "Cancel" : "Place hold"}
          </button>
        )}
      </div>

      {canHold && placing && (
        <div style={{ padding: 14, borderRadius: 2, background: "var(--cmd-surface)", border: "1px solid var(--cmd-border)" }}>
          <div style={{ marginBottom: 10, color: "var(--cmd-text)", fontSize: 13, fontWeight: 800 }}>Place hold</div>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={labelStyle}>
              Find sheet
              <input className="sbd-input" aria-label="Search sheets" placeholder="Sheet # or title"
                value={sheetQuery} onChange={(event) => setSheetQuery(event.target.value)} />
            </label>
            <div role="listbox" aria-label="Sheets without an active hold"
              style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--cmd-border)", borderRadius: 2, padding: 6 }}>
              {visibleOptions.length === 0 ? (
                <div style={{ color: "var(--cmd-text-muted)", fontSize: 12, padding: 8 }}>
                  {holdPickerEmptyMessage({
                    registerKnown,
                    registerLoading,
                    registerError: Boolean(registerError),
                    optionCount: options.length,
                  })}
                </div>
              ) : visibleOptions.map((option) => {
                const selected = option.drawingId === selectedDrawingId;
                return (
                  <button key={option.drawingId} type="button" role="option" aria-selected={selected}
                    onClick={() => setSelectedDrawingId(option.drawingId)}
                    style={{
                      display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "4px 6px",
                      cursor: "pointer", fontSize: 12, textAlign: "left", border: "none", borderRadius: 2,
                      background: selected ? "var(--cmd-row-hover)" : "transparent", color: "var(--cmd-text)",
                    }}>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{option.sheetNumber || "Unnumbered"}</span>
                    <span style={{ color: "var(--cmd-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{option.sheetTitle}</span>
                  </button>
                );
              })}
            </div>
            <label style={labelStyle}>
              Reason *
              <textarea className="sbd-input" aria-label="Hold reason" rows={3} value={reason}
                placeholder="Why is this sheet blocked? (required)"
                onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={resetPlaceForm}>Cancel</button>
            <button type="button" className="cmd-btn cmd-btn--primary"
              disabled={placeMutation.isPending || !selectedDrawingId || !reason.trim()}
              onClick={() => placeMutation.mutate()}>
              {placeMutation.isPending ? "Placing…" : "Place hold"}
            </button>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Hold scope" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SCOPES.map((option) => {
          const active = scope === option.key;
          return (
            <button key={option.key} role="tab" aria-selected={active} type="button"
              className={`cmd-chip-btn${active ? " is-active" : ""}`}
              onClick={() => setScope(option.key)}>
              {option.label}
            </button>
          );
        })}
      </div>

      {visibleHolds.length === 0 ? (
        <div className="cmd-table-wrap">
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--cmd-text-muted)", fontSize: 13 }}>
            {scope === "active" ? "No active holds — nothing is blocked." : "No holds to show."}
          </div>
        </div>
      ) : (
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                <th>Sheet</th>
                <th>Reason</th>
                <th>Placed</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleHolds.map((hold) => {
                const row = registerByDrawingId.get(hold.drawing_id);
                const releasing = releasingId === hold.id;
                return (
                  <Fragment key={hold.id}>
                    <tr>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 700, color: "var(--cmd-text)", fontVariantNumeric: "tabular-nums" }}>{sheetLabel(row, hold.drawing_id)}</div>
                        {row?.sheet_title && <div style={{ color: "var(--cmd-text-muted)", fontSize: 11 }}>{row.sheet_title}</div>}
                      </td>
                      <td style={{ color: "var(--cmd-text)", maxWidth: 360, whiteSpace: "pre-wrap" }}>{hold.reason}</td>
                      <td style={{ color: "var(--cmd-text-muted)", whiteSpace: "nowrap" }}>
                        <div>{fmtDate(hold.placed_at)}</div>
                        {hold.placed_by_name && <div style={{ fontSize: 11 }}>{hold.placed_by_name}</div>}
                      </td>
                      <td>
                        {hold.is_active ? (
                          <Pill tone="warn">on hold</Pill>
                        ) : (
                          <div>
                            <Pill tone="good">released</Pill>
                            <div style={{ color: "var(--cmd-text-muted)", fontSize: 11, marginTop: 4, whiteSpace: "nowrap" }}>
                              {hold.released_at ? fmtDate(hold.released_at) : ""}
                              {hold.released_by_name ? ` · ${hold.released_by_name}` : ""}
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {hold.is_active && canHold && (
                          <button type="button" className="cmd-btn cmd-btn--ghost"
                            aria-expanded={releasing} aria-controls={`hold-${hold.id}-release`}
                            onClick={() => { setReleasingId(releasing ? null : hold.id); setReleaseNotes(""); }}>
                            {releasing ? "Cancel" : "Release"}
                            <span className="sr-only"> hold on {sheetLabel(row, hold.drawing_id)}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                    {releasing && (
                      <tr id={`hold-${hold.id}-release`}>
                        <td colSpan={5} style={{ padding: 12, background: "var(--cmd-surface)" }}>
                          <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ color: "var(--cmd-text)", fontSize: 13, fontWeight: 800 }}>
                              Release hold on {sheetLabel(row, hold.drawing_id)}
                            </div>
                            <label style={labelStyle}>
                              Release notes (optional)
                              <textarea className="sbd-input" aria-label="Release notes" rows={2} value={releaseNotes}
                                placeholder="What resolved it?" onChange={(event) => setReleaseNotes(event.target.value)} />
                            </label>
                            {hold.prior_release_status && (
                              <div style={{ color: "var(--cmd-text-muted)", fontSize: 11 }}>
                                Sheet status will return to <strong>{hold.prior_release_status.replace(/_/g, " ")}</strong>.
                              </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { setReleasingId(null); setReleaseNotes(""); }}>Cancel</button>
                              <button type="button" className="cmd-btn cmd-btn--primary"
                                disabled={releaseMutation.isPending}
                                onClick={() => releaseMutation.mutate(hold)}>
                                {releaseMutation.isPending ? "Releasing…" : "Confirm release"}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {!hold.is_active && hold.release_notes && (
                      <tr>
                        <td colSpan={5} style={{ padding: "4px 12px 10px", color: "var(--cmd-text-muted)", fontSize: 11, background: "var(--cmd-surface)" }}>
                          <span style={{ fontWeight: 800, textTransform: "uppercase", fontSize: 9, marginRight: 6 }}>Release notes</span>
                          {hold.release_notes}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
