import React from "react";
import { Button } from "@/components/ui/button";

// Rendered only after a verified committed command result.
export default function SuccessStep({ createdCount, fileResults, processError,
  commandWarning = /** @type {string | null} */ (null), onViewLog, onUploadAnother,
  onReconcile = /** @type {(() => void) | null} */ (null) }) {
  return (
    <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-primary)" }}>
      <h3>Drawing save committed</h3>
      <p>{createdCount} Drawing Log {createdCount === 1 ? "entry" : "entries"} created.</p>
      {fileResults.filter(result => result.status === "failed").map(result => <p key={result.fileName}>{result.fileName}: upload failed; excluded from the committed save.</p>)}
      {(processError || commandWarning) && <div role="alert" style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
        {processError && <p>{processError}</p>}
        {commandWarning && <p>{commandWarning} The drawing save committed; do not create a second copy.</p>}
      </div>}
      <p>Existing sets remain live. New revisions are received; no engineering approval or release was inferred.</p>
      <a href="/ScheduleHub">Open Schedule to review and link tasks</a>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
        {onUploadAnother && <Button variant="outline" onClick={onUploadAnother}>Upload Another Set</Button>}
        {onReconcile && <Button variant="outline" onClick={onReconcile}>Reconcile committed receipt</Button>}
        <Button onClick={onViewLog}>View Drawing Log</Button>
      </div>
    </div>
  );
}
