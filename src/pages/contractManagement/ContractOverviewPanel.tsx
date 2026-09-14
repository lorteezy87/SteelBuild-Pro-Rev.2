import { Pencil } from "lucide-react";
import {
  formatCurrencyShort,
  formatCurrencyWhole,
  formatDate,
} from "@/components/shared/formatters";
import {
  CONTRACT_TYPES,
  type ContractEditForm,
  type ContractProject,
} from "./contractManagement.derive";

interface ContractOverviewPanelProps {
  project?: ContractProject;
  approvedCOTotal: number;
  pendingCOTotal: number;
  revisedValue: number;
  editingContract: boolean;
  contractForm: ContractEditForm;
  setContractForm: React.Dispatch<React.SetStateAction<ContractEditForm>>;
  onEditContract?: (() => void) | null;
  onSaveContract: () => void;
  onCancelContract: () => void;
  isSaving: boolean;
}

const FlowArrow = () => (
  <div style={{ display: "flex", alignItems: "center", padding: "0 4px", color: "var(--text-muted)", fontSize: 18 }}>
    &rarr;
  </div>
);

export function ContractOverviewPanel({
  project,
  approvedCOTotal,
  pendingCOTotal,
  revisedValue,
  editingContract,
  contractForm,
  setContractForm,
  onEditContract,
  onSaveContract,
  onCancelContract,
  isSaving,
}: ContractOverviewPanelProps) {
  const originalValue = Number(project?.original_contract_value) || 0;
  const details = [
    { label: "Start Date", value: formatDate(project?.start_date) },
    { label: "Target Completion", value: formatDate(project?.target_completion_date) },
    { label: "Project Manager", value: project?.project_manager || "N/A" },
    { label: "Superintendent", value: project?.superintendent || "N/A" },
  ];

  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-card)", padding: 20, marginBottom: 18,
      boxShadow: "var(--shadow-card)", position: "relative",
    }}>
      {!editingContract && onEditContract && (
        <button
          onClick={onEditContract}
          title="Edit contract details"
          style={{
            position: "absolute", top: 12, right: 12,
            background: "transparent", border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-btn)", padding: "4px 10px", cursor: "pointer",
            color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4,
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            letterSpacing: "0.10em", textTransform: "uppercase",
          }}
        >
          <Pencil size={11} /> Edit
        </button>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Original Contract</div>
          {editingContract ? (
            <input
              type="number"
              value={contractForm.original_contract_value ?? ""}
              onChange={(event) => setContractForm((current) => ({
                ...current,
                original_contract_value: event.target.value,
              }))}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800,
                color: "var(--text-primary)", background: "var(--bg-surface-low)",
                border: "1px solid var(--accent)", borderRadius: 6, padding: "4px 10px",
                width: 160, textAlign: "center",
              }}
            />
          ) : (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>{formatCurrencyShort(originalValue)}</div>
          )}
        </div>
        <FlowArrow />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--status-success)", marginBottom: 4 }}>+Approved COs</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color: "var(--status-success)" }}>+{formatCurrencyShort(approvedCOTotal)}</div>
        </div>
        <FlowArrow />
        <div style={{ textAlign: "center", padding: "8px 16px", background: "rgba(234,88,12,0.08)", borderRadius: 8, border: "1px solid rgba(234,88,12,0.25)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>Revised Contract</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800, color: "var(--accent)" }}>{formatCurrencyShort(revisedValue)}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center", borderTop: "1px solid var(--divider)", paddingTop: 14 }}>
        {editingContract ? (
          <>
            <div style={{ textAlign: "center", minWidth: 100 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 2 }}>Contract Type</div>
              <select
                value={contractForm.contract_type || ""}
                onChange={(event) => setContractForm((current) => ({
                  ...current,
                  contract_type: event.target.value,
                }))}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                  color: "var(--text-primary)", background: "var(--bg-surface-low)",
                  border: "1px solid var(--accent)", borderRadius: 6, padding: "3px 8px",
                }}
              >
                <option value="">Select...</option>
                {CONTRACT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            {details.map((detail) => (
              <div key={detail.label} style={{ textAlign: "center", minWidth: 100 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 2 }}>{detail.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{detail.value}</div>
              </div>
            ))}
          </>
        ) : (
          [{ label: "Contract Type", value: project?.contract_type || "N/A" }, ...details].map((detail) => (
            <div key={detail.label} style={{ textAlign: "center", minWidth: 100 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 2 }}>{detail.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{detail.value}</div>
            </div>
          ))
        )}
      </div>

      {editingContract && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
          <button onClick={onCancelContract} style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.10em", textTransform: "uppercase", padding: "6px 16px",
            background: "transparent", color: "var(--text-muted)",
            border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)",
            cursor: "pointer",
          }}>Cancel</button>
          <button onClick={onSaveContract} disabled={isSaving} style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.10em", textTransform: "uppercase", padding: "6px 16px",
            background: "var(--accent)", color: "var(--bg-base)", border: "none",
            borderRadius: "var(--radius-btn)", cursor: isSaving ? "wait" : "pointer",
            opacity: isSaving ? 0.6 : 1,
          }}>{isSaving ? "Saving..." : "Save Changes"}</button>
        </div>
      )}

      {pendingCOTotal > 0 && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", padding: "3px 10px", borderRadius: 3, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {formatCurrencyWhole(pendingCOTotal)} in Pending Change Orders
          </span>
        </div>
      )}
    </div>
  );
}
