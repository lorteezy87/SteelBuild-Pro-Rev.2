import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "../shared/formatters";

/**
 * SovImportReviewModal — pre-import review for the SOV importer.
 *
 * Shows everything that was parsed from the CSV/XLSX before anything is
 * written: valid vs invalid rows (with the reason invalid ones are skipped),
 * the auto-mapped steel cost code per line, and the totals. Nothing is created
 * until the user confirms — invalid rows are never imported.
 *
 * Props:
 *  - open, onClose
 *  - staged: Array<{ record, valid, reason, autoMapped }> from buildSovStaged
 *  - onConfirm(validRecords): commits the valid rows
 *  - importing: boolean (disables/labels the confirm button while writing)
 */
export default function SovImportReviewModal({ open, onClose, staged = [], onConfirm, importing = false }) {
  const { valid, invalid, autoMapped, validRecords } = useMemo(() => {
    const v = staged.filter((s) => s.valid);
    return {
      valid: v.length,
      invalid: staged.length - v.length,
      autoMapped: staged.filter((s) => s.valid && s.autoMapped).length,
      validRecords: v.map((s) => s.record),
    };
  }, [staged]);

  const costLabel = (r) =>
    r.cost_code ? `${r.cost_code}${r.cost_code_name ? ` — ${r.cost_code_name}` : ""}` : "—";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>Review SOV import</DialogTitle>
        </DialogHeader>

        {/* Summary chips */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em" }}>
          <span style={{ color: "var(--text-secondary)" }}>{staged.length} PARSED</span>
          <span style={{ color: "var(--accent)" }}>{valid} TO IMPORT</span>
          <span style={{ color: "var(--text-secondary)" }}>{autoMapped} COST-CODE AUTO-MAPPED</span>
          {invalid > 0 && <span style={{ color: "var(--danger)" }}>{invalid} SKIPPED</span>}
        </div>

        <div style={{ maxHeight: "48vh", overflowY: "auto", marginTop: 8, border: "1px solid var(--border-default)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)", zIndex: 1 }}>
                {["#", "Description", "Scheduled Value", "Cost Code", "Status"].map((h, i) => (
                  <th key={h} style={{
                    textAlign: i === 2 ? "right" : "left", padding: "8px 10px",
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "var(--text-muted)", borderBottom: "1px solid var(--border-default)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staged.map((s, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--divider)", opacity: s.valid ? 1 : 0.55 }}>
                  <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{s.record.line_item_number}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-primary)" }}>{s.record.description || <em style={{ color: "var(--text-muted)" }}>(blank)</em>}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{formatCurrency(s.record.scheduled_value)}</td>
                  <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", color: s.record.cost_code ? "var(--accent)" : "var(--text-muted)" }}>
                    {costLabel(s.record)}{s.autoMapped ? " *" : ""}
                  </td>
                  <td style={{ padding: "7px 10px", fontSize: 11, color: s.valid ? "var(--status-success, #3FB950)" : "var(--danger)" }}>
                    {s.valid ? "Ready" : s.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
          * = cost code auto-mapped from the description. Skipped rows are not imported.
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={importing}>Cancel</Button>
          <Button onClick={() => onConfirm(validRecords)} disabled={importing || valid === 0}>
            {importing ? "Importing…" : `Import ${valid} item${valid === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
