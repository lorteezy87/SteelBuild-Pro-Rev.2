import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { buildReplaceSentence, joinSheetNumbers } from "@/lib/crossSetSupersede";
import type { CrossSetGroup, CrossSetPlan, CrossSetRow } from "@/lib/crossSetSupersede";
import type { CrossSetStatus } from "@/components/drawings/upload/useCrossSetSupersede";

// ─── Review step: pages this upload replaces in OTHER sets ─────────────
//
// Presentational only — useCrossSetSupersede owns the fetch, the plan and the
// user's toggles. Native checkboxes and <details>; no dialog, no <form>.

export interface CrossSetSupersedePanelProps {
  status: CrossSetStatus;
  plan: CrossSetPlan;
  canSupersede: boolean;
  isChecked: (row: CrossSetRow) => boolean;
  onToggle: (id: string) => void;
  onToggleGroup: (setId: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onRetry: () => void;
}

const bodyText: CSSProperties = { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45 };
const monoLabel: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase" };
const textButton: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, background: "none", borderRadius: 6,
  padding: "3px 8px", cursor: "pointer", letterSpacing: "0.08em",
};
const cell: CSSProperties = { padding: "5px 8px", textAlign: "left", verticalAlign: "top", borderBottom: "1px solid var(--divider)" };
const headCell: CSSProperties = { ...cell, ...monoLabel, fontWeight: 600, background: "var(--bg-surface-low)", position: "sticky", top: 0 };

function RowsTable({ rows, caption, canSupersede, isChecked, onToggle, idPrefix }: {
  rows: readonly CrossSetRow[];
  caption: string;
  canSupersede: boolean;
  isChecked: (row: CrossSetRow) => boolean;
  onToggle: (id: string) => void;
  idPrefix: string;
}) {
  return (
    <div style={{ overflowX: "auto", maxHeight: 220, overflowY: "auto", border: "1px solid var(--bg-surface-high)", borderRadius: 6, marginTop: 6 }}>
      <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", background: "var(--bg-surface-low)" }}>
        <caption style={{ ...monoLabel, textAlign: "left", padding: "5px 8px", captionSide: "top" }}>{caption}</caption>
        <thead>
          <tr>
            {canSupersede && <th scope="col" style={{ ...headCell, width: 28 }}><span className="sr-only">Supersede</span></th>}
            <th scope="col" style={headCell}>Sheet</th>
            <th scope="col" style={headCell}>Old set</th>
            <th scope="col" style={headCell}>Title (old / new)</th>
            <th scope="col" style={headCell}>Rev (old → new)</th>
            <th scope="col" style={headCell}>Stage</th>
            <th scope="col" style={headCell}>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const noteId = `${idPrefix}-${row.oldId}-note`;
            const sameTitle = row.titleRelation === "same";
            return (
              <tr key={row.oldId}>
                {canSupersede && (
                  <td style={cell}>
                    <input
                      type="checkbox"
                      checked={isChecked(row)}
                      disabled={row.disabled}
                      onChange={() => onToggle(row.oldId)}
                      aria-label={`Mark ${row.oldSheetNumber} in ${row.oldSetName} superseded`}
                      aria-describedby={row.note ? noteId : undefined}
                      style={{ accentColor: "var(--accent)", cursor: row.disabled ? "not-allowed" : "pointer" }}
                    />
                  </td>
                )}
                <td style={{ ...cell, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                  {row.oldSheetNumber}
                  {row.newSheetNumber && row.newSheetNumber !== row.oldSheetNumber && (
                    <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> → {row.newSheetNumber}</span>
                  )}
                </td>
                <td style={{ ...cell, ...bodyText }}>{row.oldSetName}</td>
                <td style={{ ...cell, ...bodyText, color: "var(--text-primary)" }}>
                  {sameTitle ? row.oldTitle : (
                    <>
                      <div>{row.oldTitle || "— no title —"}</div>
                      <div style={{ color: "var(--text-muted)" }}>{row.newTitle || "— no title —"}</div>
                    </>
                  )}
                </td>
                <td style={{ ...cell, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  {row.oldRevision || "—"} → {row.newRevision || "—"}
                </td>
                <td style={{ ...cell, ...bodyText }}>{row.oldStage || "—"}</td>
                <td id={noteId} style={{ ...cell, ...bodyText, color: row.defaultChecked ? "var(--text-muted)" : "var(--status-warning)" }}>
                  {row.note || ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Group({ group, canSupersede, isChecked, onToggle, onToggleGroup, idPrefix }: {
  group: CrossSetGroup;
  canSupersede: boolean;
  isChecked: (row: CrossSetRow) => boolean;
  onToggle: (id: string) => void;
  onToggleGroup: (setId: string, checked: boolean) => void;
  idPrefix: string;
}) {
  const enabled = group.rows.filter((row) => !row.disabled);
  const ticked = group.rows.filter(isChecked);
  const all = enabled.length > 0 && enabled.every(isChecked);
  const indeterminate = ticked.length > 0 && !all;
  // Tri-state: a native checkbox's mixed state is only settable as a DOM property.
  const groupRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (groupRef.current) groupRef.current.indeterminate = indeterminate;
  }, [indeterminate, canSupersede]);
  // The approved copy, built from the ticked rows; with none ticked it still names the candidates.
  const numbers = (ticked.length ? ticked : group.rows).map((row) => row.newSheetNumber || row.oldSheetNumber);
  const groupId = `${idPrefix}-group`;
  return (
    <div style={{ marginTop: 10 }}>
      {canSupersede ? (
        <label htmlFor={groupId} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: enabled.length ? "pointer" : "default" }}>
          <input
            ref={groupRef}
            id={groupId}
            type="checkbox"
            checked={all}
            disabled={enabled.length === 0}
            onChange={(event) => onToggleGroup(group.setId, event.target.checked)}
            style={{ accentColor: "var(--accent)", cursor: enabled.length ? "pointer" : "not-allowed", marginTop: 2, flexShrink: 0 }}
          />
          <span style={{ ...bodyText, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
            {buildReplaceSentence(numbers, group.setName, { ask: true })}
          </span>
        </label>
      ) : (
        <p style={{ ...bodyText, fontSize: 12, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          {buildReplaceSentence(numbers, group.setName)}
        </p>
      )}
      <RowsTable
        rows={group.rows}
        caption={group.setName}
        canSupersede={canSupersede}
        isChecked={isChecked}
        onToggle={onToggle}
        idPrefix={idPrefix}
      />
    </div>
  );
}

export default function CrossSetSupersedePanel({
  status, plan, canSupersede, isChecked, onToggle, onToggleGroup, onSelectAll, onClear, onRetry,
}: CrossSetSupersedePanelProps) {
  const baseId = useId();
  const titleId = `${baseId}-xset-title`;

  if (status === "loading") {
    return (
      <p role="status" style={{ ...bodyText, color: "var(--text-muted)", margin: "0 0 14px" }}>
        Checking other sets for these sheet numbers…
      </p>
    );
  }
  if (status === "error") {
    return (
      <div role="alert" style={{
        ...bodyText, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        padding: "8px 12px", marginBottom: 14, borderRadius: 8,
        background: "var(--bg-surface-low)", border: "1px solid var(--status-error-bright)",
      }}>
        <span>Couldn&apos;t check other sets — no pages will be superseded.</span>
        <button type="button" onClick={onRetry} style={{ ...textButton, color: "var(--text-primary)", border: "1px solid var(--bg-surface-high)" }}>
          Retry
        </button>
      </div>
    );
  }
  if (status !== "ready" || plan.rows.length === 0) return null;

  const selectable = plan.rows.filter((row) => !row.disabled);
  const checkedRows = plan.rows.filter(isChecked);
  const tickedSetNames = [...new Set(checkedRows.map((row) => row.oldSetName))];
  const differentCount = plan.differentRows.length;

  return (
    <section aria-labelledby={titleId} style={{
      padding: "10px 12px", marginBottom: 14, borderRadius: 8,
      background: "var(--bg-surface-low)", border: "1px solid var(--warning-border)",
    }}>
      <h3 id={titleId} style={{
        margin: 0, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
        textTransform: "uppercase", fontWeight: 700, color: "var(--status-warning)",
      }}>
        Pages this upload replaces
      </h3>

      {plan.setNameCaseConflict && (
        <div role="note" style={{
          ...bodyText, marginTop: 8, padding: "6px 10px", borderRadius: 6,
          background: "var(--warning-muted)", border: "1px solid var(--warning-border)",
        }}>
          You typed &ldquo;{plan.setNameCaseConflict.typed}&rdquo;, which creates a NEW set; the existing set is
          &ldquo;{plan.setNameCaseConflict.existing}&rdquo;. Its pages are left unticked — to add these sheets to
          it, change the set name above to match it exactly.
        </div>
      )}

      {canSupersede ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <span aria-live="polite" style={{ ...bodyText, color: "var(--text-primary)", marginRight: "auto" }}>
            {checkedRows.length} of {selectable.length} will be marked superseded
          </span>
          <button type="button" onClick={onSelectAll} aria-label="Select all pages to supersede"
            style={{ ...textButton, color: "var(--status-warning)", border: "1px solid var(--warning-border)" }}>
            Select all
          </button>
          <button type="button" onClick={onClear} aria-label="Clear all pages to supersede"
            style={{ ...textButton, color: "var(--text-secondary)", border: "1px solid var(--bg-surface-high)" }}>
            Clear
          </button>
        </div>
      ) : (
        <p style={{ ...bodyText, margin: "8px 0 0" }}>
          You need PM access to mark pages superseded — the old pages will stay live.
        </p>
      )}

      {plan.groups.map((group) => (
        <Group
          key={group.setId}
          group={group}
          canSupersede={canSupersede}
          isChecked={isChecked}
          onToggle={onToggle}
          onToggleGroup={onToggleGroup}
          idPrefix={`${baseId}-${group.setId}`}
        />
      ))}

      {differentCount > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ ...bodyText, cursor: "pointer" }}>
            {differentCount} {differentCount === 1 ? "sheet shares" : "sheets share"} a number with a different drawing — not superseded
          </summary>
          <RowsTable
            rows={plan.differentRows}
            caption="Same number, different drawing"
            canSupersede={canSupersede}
            isChecked={isChecked}
            onToggle={onToggle}
            idPrefix={`${baseId}-different`}
          />
        </details>
      )}

      {canSupersede && (
        <p style={{ ...bodyText, color: "var(--text-muted)", margin: "10px 0 0" }}>
          Superseded pages can&apos;t be released for fabrication.
          {tickedSetNames.length > 0 && (
            <> Releasing {joinSheetNumbers(tickedSetNames)} again as a set will need an admin override.</>
          )}
        </p>
      )}
    </section>
  );
}
