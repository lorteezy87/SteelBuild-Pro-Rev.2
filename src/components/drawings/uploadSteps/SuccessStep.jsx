import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check } from "lucide-react";
import {
  describeSupersedeProblem,
  describeSupersededSet,
  groupSupersedeItemsBySet,
} from "@/lib/crossSetSupersede";

// ─── Step 5: Success ─────────────────────────────────────────────────
// processError carries "N sheet(s) failed to save" from the create step, and
// supersedeResult what happened to the pages this upload replaces in other
// sets. Neither is ever silent: every page left live is listed.
export default function SuccessStep({ createdCount, fileResults, processError, supersedeResult, onViewLog, onUploadAnother }) {
  const supersededSets = groupSupersedeItemsBySet(supersedeResult?.superseded || []);
  const problems = [...(supersedeResult?.failed || []), ...(supersedeResult?.skipped || [])];
  const hasProblems = Boolean(processError) || problems.length > 0;

  return (
    <div style={{ textAlign: "center", padding: "30px 0" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: hasProblems ? "var(--warning-muted)" : "var(--success-muted)",
        border: `2px solid ${hasProblems ? "var(--warning-border)" : "var(--success-border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
      }}>
        {hasProblems
          ? <AlertTriangle style={{ width: 24, height: 24, color: "var(--status-warning)" }} />
          : <Check style={{ width: 24, height: 24, color: "var(--status-success)" }} />}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>
        {hasProblems ? "Upload finished with problems" : "Upload Complete"}
      </div>
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
        {supersededSets.map(summary => (
          <div key={summary.setId || summary.setName} style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>
            ✓ {describeSupersededSet(summary)}
          </div>
        ))}
        {hasProblems && (
          <div role="alert" style={{
            marginTop: 8, padding: "8px 12px", maxWidth: "100%", boxSizing: "border-box", textAlign: "left",
            fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)",
            background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderRadius: 8,
          }}>
            {processError && <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{processError}</div>}
            {problems.length > 0 && (
              <ul style={{ margin: processError ? "6px 0 0" : 0, paddingLeft: 18 }}>
                {problems.map(item => <li key={item.id}>{describeSupersedeProblem(item)}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <Button variant="outline" onClick={onUploadAnother}>Upload Another Set</Button>
        <Button onClick={onViewLog} style={{ background: "var(--accent)", color: "var(--on-accent)", border: "none" }}>
          View Drawing Log
        </Button>
      </div>
    </div>
  );
}
