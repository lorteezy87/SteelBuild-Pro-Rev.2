import React from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

// ─── Step 5: Success ─────────────────────────────────────────────────
export default function StepSuccess({ createdCount, fileResults, onViewLog, onUploadAnother }) {
  return (
    <div style={{ textAlign: "center", padding: "30px 0" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--success-muted)", border: "2px solid var(--success-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Check style={{ width: 24, height: 24, color: "var(--status-success)" }} />
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Upload Complete</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginBottom: 24 }}>
        {fileResults.map(r => (
          <div key={r.fileName} style={{ fontFamily: "var(--font-body)", fontSize: 12, color: r.status === "failed" ? "var(--status-error-bright)" : "var(--text-muted)" }}>
            {r.status === "failed" ? "✗" : "✓"} {r.fileName} — {r.status === "failed" ? `failed: ${r.error}` : `${r.sheetCount} sheets`}
          </div>
        ))}
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--status-success)", marginTop: 6, fontWeight: 600 }}>
          ✓ {createdCount} Drawing Log {createdCount === 1 ? "entry" : "entries"} created
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>✓ Drawing Log updated</div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <Button variant="outline" onClick={onUploadAnother}>Upload Another Set</Button>
        <Button onClick={onViewLog} style={{ background: "var(--accent)", color: "#fff", border: "none" }}>
          View Drawing Log
        </Button>
      </div>
    </div>
  );
}
