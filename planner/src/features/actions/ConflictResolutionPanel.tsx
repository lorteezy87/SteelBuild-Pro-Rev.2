type ConflictResolutionPanelProps = {
  currentValue: string | null | undefined;
  proposedValue: string | null | undefined;
  onRetry: () => void;
  onDismiss: () => void;
  operation?: "save" | "archive";
};

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "Not set";
}

/** Makes optimistic-lock conflicts explicit instead of silently overwriting another Planner user. */
export default function ConflictResolutionPanel({ currentValue, proposedValue, onRetry, onDismiss, operation = "save" }: ConflictResolutionPanelProps) {
  return (
    <section className="planner-action-panel" aria-labelledby="planner-conflict-heading" role="alert">
      <h3 id="planner-conflict-heading">This record changed on the server.</h3>
      <p>{operation === "archive" ? "Refresh the record before archiving. Retrying requires a new archive confirmation." : "Refresh the record before saving. Re-applying this proposed change requires a fresh confirmation."}</p>
      <p>Server/current value: {displayValue(currentValue)}</p>
      <p>Your proposed value: {displayValue(proposedValue)}</p>
      <div className="planner-action-panel__actions">
        <button className="planner-button" type="button" onClick={onDismiss}>Keep editing</button>
        <button className="planner-button planner-button--primary" type="button" onClick={onRetry}>{operation === "archive" ? "Retry archive" : "Try again with confirmation"}</button>
      </div>
    </section>
  );
}
