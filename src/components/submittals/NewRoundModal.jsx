import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

/**
 * NewRoundModal — create a new submittal round.
 *
 * Triggered when a submittal transitions to "Revise and Resubmit" or
 * the user explicitly clicks "New Round". Carries forward drawing sets
 * from the previous round and increments the round number.
 *
 * Props:
 *   open          — boolean controlling visibility
 *   submittal     — parent submittal record
 *   previousRound — most recent submittal_round (to carry forward drawing_set_ids)
 *   carryItems    — open reviewer items from the prior round (OpenItem[] from
 *                   submittalResubmittal.collectOpenItems) to show + address
 *   carryFromRound— round number the carried items came from (for the heading)
 *   seededNotes   — pre-filled response_notes (carry-forward checklist string)
 *   onClose       — void callback
 *   onSubmit      — callback(roundData) with the new round payload
 */

// Standardized across the submittal modals — see src/pages/Submittals.jsx
// for the canonical list and stage-mapping rationale.
const BIC_CHOICES = [
  "Detailer", "S&H", "Contractor", "Subcontractor",
  "EOR", "Architect", "AOR",
  "GC", "Owner",
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function NewRoundModal({
  open,
  submittal,
  previousRound,
  carryItems = [],
  carryFromRound = null,
  seededNotes = "",
  onClose,
  onSubmit,
  busy = false,
}) {
  const nextRoundNum = (previousRound?.round_number || submittal?.round_number || 0) + 1;
  const carriedSetIds = previousRound?.drawing_set_ids || submittal?.drawing_set_ids || [];
  const openItems = Array.isArray(carryItems) ? carryItems : [];

  const [form, setForm] = useState({
    submitted_date: todayISO(),
    ball_in_court: "EOR",
    submitted_by: previousRound?.submitted_by || submittal?.submitted_by || "",
    reviewer: previousRound?.reviewer || submittal?.reviewer || "",
    response_notes: seededNotes || "",
  });

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (busy) return;
    if (!form.submitted_date) {
      toast.error("Submitted date is required");
      return;
    }
    const roundData = {
      submittal_id: submittal?.id,
      round_number: nextRoundNum,
      submitted_date: form.submitted_date,
      ball_in_court: form.ball_in_court,
      submitted_by: form.submitted_by || null,
      reviewer: form.reviewer || null,
      drawing_set_ids: carriedSetIds,
      response_notes: form.response_notes || null,
      status: "Submitted",
    };
    await onSubmit(roundData);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px] sbd-card-strong">
        <DialogHeader>
          <DialogTitle>New Submittal Round</DialogTitle>
        </DialogHeader>

        {/* Submittal context header */}
        {submittal && (
          <div style={{
            display: "flex",
            gap: 8,
            alignItems: "baseline",
            marginBottom: 4,
            padding: "6px 10px",
            background: "var(--bg-surface-low)",
            borderRadius: 4,
            border: "1px solid var(--border-default)",
          }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 800,
              color: "var(--accent)",
              letterSpacing: "0.06em",
            }}>
              {submittal.submittal_number}
            </span>
            <span style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {submittal.title}
            </span>
          </div>
        )}

        {/* Carry-forward — open reviewer comments from the prior round that
            this resubmittal must address. Read-only; the editable checklist
            is seeded into Response Notes below so nothing gets dropped. */}
        {openItems.length > 0 && (
          <div style={{
            marginBottom: 10,
            padding: "8px 10px",
            background: "var(--status-review-muted)",
            border: "1px solid var(--status-review-border)",
            borderRadius: 6,
          }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--status-review)",
              marginBottom: 6,
            }}>
              {openItems.length} comment{openItems.length === 1 ? "" : "s"} to address
              {carryFromRound ? ` · from Round ${carryFromRound}` : ""}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 132, overflowY: "auto" }}>
              {openItems.map((it, idx) => (
                <div key={`${it.drawing_id || it.sheet_number}-${idx}`} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    whiteSpace: "nowrap",
                    minWidth: 56,
                  }}>
                    {it.sheet_number}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 3,
                    color: "var(--status-review)",
                    background: "var(--status-review-muted)",
                    whiteSpace: "nowrap",
                  }}>
                    {it.response_status}
                  </span>
                  {it.reviewer_comment && (
                    <span style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                      title={it.reviewer_comment}
                    >
                      {it.reviewer_comment}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
          {/* Round number — read-only, auto-incremented */}
          <div>
            <Label>Round #</Label>
            <Input
              value={nextRoundNum}
              readOnly
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                color: "var(--accent)",
                background: "var(--bg-surface-low)",
                cursor: "default",
              }}
            />
          </div>

          {/* Submitted Date */}
          <div>
            <Label>Submitted Date *</Label>
            <Input
              type="date"
              value={form.submitted_date}
              onChange={(e) => setField("submitted_date", e.target.value)}
            />
          </div>

          {/* Ball-in-court */}
          <div>
            <Label>Ball-in-court</Label>
            <Select value={form.ball_in_court} onValueChange={(v) => setField("ball_in_court", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BIC_CHOICES.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submitted By */}
          <div>
            <Label>Submitted By</Label>
            <Input
              value={form.submitted_by}
              onChange={(e) => setField("submitted_by", e.target.value)}
              placeholder="Detailer / fabricator"
            />
          </div>

          {/* Reviewer */}
          <div>
            <Label>Reviewer</Label>
            <Input
              value={form.reviewer}
              onChange={(e) => setField("reviewer", e.target.value)}
              placeholder="EOR / Architect"
            />
          </div>

          {/* Drawing Set IDs — carried forward, read-only display */}
          <div>
            <Label>Drawing Sets</Label>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              padding: "6px 8px",
              minHeight: 36,
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              alignItems: "center",
            }}>
              {carriedSetIds.length === 0 ? (
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}>
                  No drawing sets linked
                </span>
              ) : (
                carriedSetIds.map((id) => (
                  <span
                    key={id}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "var(--accent-muted)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      letterSpacing: "0.04em",
                      maxWidth: 160,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={id}
                  >
                    {id.slice(0, 8)}...
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Response Notes */}
          <div style={{ gridColumn: "1 / span 2" }}>
            <Label>Response Notes</Label>
            <textarea
              rows={3}
              value={form.response_notes}
              onChange={(e) => setField("response_notes", e.target.value)}
              placeholder="Notes on this resubmission, reviewer comments from prior round, etc."
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 12,
                fontFamily: "var(--font-body)",
                borderRadius: 4,
                resize: "vertical",
                background: "var(--bg-input, var(--bg-surface-low))",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.06em",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            style={{
              padding: "8px 14px",
              background: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.06em",
            }}
          >
            {busy ? "CREATING..." : "CREATE ROUND"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
