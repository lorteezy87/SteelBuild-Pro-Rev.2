import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const today = () => new Date().toISOString().split("T")[0];

const STATUS_OPTS = ["approved", "rejected", "superseded"];
const STATUS_LABELS = { approved: "Approved", rejected: "Rejected", superseded: "Superseded" };

export default function SetApprovalModal({ open, onClose, setName, sheetCount, existingRevision, onConfirm, saving }) {
  const [status, setStatus] = useState("approved");
  const [revision, setRevision] = useState(existingRevision || "");
  const [approvedBy, setApprovedBy] = useState("");
  const [approvalDate, setApprovalDate] = useState(today());
  const [applyToSheets, setApplyToSheets] = useState(true);
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    onConfirm({ status, revision, approvedBy, approvalDate, applyToSheets, notes });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 480, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 16 }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--text-primary)", letterSpacing: "0.06em" }}>
            Approve Drawing Set
          </DialogTitle>
          <DialogDescription style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
            Confirm set approval status, revision, approver, and whether the decision should update all included sheets.
          </DialogDescription>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 2 }}>
            {setName} · {sheetCount} SHEETS
          </p>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
          {/* Status */}
          <div>
            <label>Approval Status</label>
            <div style={{ display: "flex", gap: 6 }}>
              {STATUS_OPTS.map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 7, cursor: "pointer",
                    background: status === s
                       ? s === "approved" ? "rgba(0,230,118,0.12)" : s === "rejected" ? "rgba(255,23,68,0.12)" : "var(--info-muted)"
                       : "rgba(255,255,255,0.04)",
                     border: `1px solid ${status === s
                       ? s === "approved" ? "rgba(0,230,118,0.25)" : s === "rejected" ? "rgba(255,23,68,0.25)" : "var(--info-border)"
                       : "rgba(255,255,255,0.08)"}`,
                     color: status === s
                       ? s === "approved" ? "var(--status-success)" : s === "rejected" ? "var(--status-error)" : "var(--accent)"
                       : "var(--text-muted)",
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em"
                  }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>Revision Being Approved</label>
              <input value={revision} onChange={e => setRevision(e.target.value)} placeholder="e.g. 2" />
            </div>
            <div>
              <label>Approval Date</label>
              <input type="date" value={approvalDate} onChange={e => setApprovalDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label>Approved By</label>
            <input value={approvedBy} onChange={e => setApprovedBy(e.target.value)} placeholder="Name or initials" />
          </div>

          {/* Toggle: apply to sheets */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "10px 14px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>
                Apply to all sheets in this set
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 2, letterSpacing: "0.08em" }}>
                Update all {sheetCount} sheets with this approval status
              </div>
            </div>
            <button
              onClick={() => setApplyToSheets(v => !v)}
              style={{
                width: 40, height: 22, borderRadius: 11, cursor: "pointer",
                background: applyToSheets ? "var(--accent)" : "rgba(255,255,255,0.10)",
                border: "none", position: "relative", flexShrink: 0, transition: "background 0.2s"
              }}
            >
              <span style={{
                position: "absolute", top: 3, width: 16, height: 16, borderRadius: "50%", background: "#fff",
                left: applyToSheets ? "calc(100% - 19px)" : 3, transition: "left 0.2s"
              }} />
            </button>
          </div>

          <div>
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Approval notes, conditions, or rejection reason..."
              rows={3}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 8, cursor: "pointer",
            background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em"
          }}>Cancel</button>
          <button onClick={handleConfirm} disabled={saving} style={{
            padding: "8px 18px", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
            background: "var(--accent)", border: "none",
            color: "#fff", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em",
            opacity: saving ? 0.7 : 1
          }}>
            {saving ? "Saving..." : "Approve Set →"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
