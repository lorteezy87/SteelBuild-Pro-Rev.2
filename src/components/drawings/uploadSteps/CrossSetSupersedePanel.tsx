import type { CrossSetPlan, CrossSetRow } from "@/lib/crossSetSupersede";
import type { CrossSetStatus } from "@/components/drawings/upload/useCrossSetSupersede";

export interface CrossSetSupersedePanelProps {
  status: CrossSetStatus;
  plan: CrossSetPlan;
  canSupersede?: boolean;
  isChecked?: (row: CrossSetRow) => boolean;
  onToggle?: (id: string) => void;
  onToggleGroup?: (setId: string, checked: boolean) => void;
  onSelectAll?: () => void;
  onClear?: () => void;
  onRetry: () => void;
}

/** Read-only collision preview. No selection can imply a supersession write. */
export default function CrossSetSupersedePanel({ status, plan, onRetry }: CrossSetSupersedePanelProps) {
  return (
    <section aria-label="Other drawing sets" style={{ padding: 12, marginBottom: 14, color: "var(--text-secondary)", border: "1px solid var(--warning-border)", borderRadius: 8 }}>
      <p>Cross-set supersession is unavailable until its reviewed server command is released. Existing sets remain live.</p>
      {status === "loading" && <p role="status">Checking other sets for these sheet numbers…</p>}
      {status === "error" && <p role="alert">Could not load the other-set preview. <button type="button" onClick={onRetry}>Retry preview</button></p>}
      {status === "ready" && plan.rows.length > 0 && (
        <table style={{ width: "100%", textAlign: "left" }}>
          <caption>Existing pages with matching sheet numbers — read-only preview</caption>
          <thead><tr><th>Existing set</th><th>Sheet</th><th>Drawing</th><th>Status</th></tr></thead>
          <tbody>{plan.rows.map(row => (
            <tr key={row.oldId}><td>{row.oldSetName}</td><td>{row.oldSheetNumber}</td><td>{row.oldTitle}</td><td>Remains live</td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
