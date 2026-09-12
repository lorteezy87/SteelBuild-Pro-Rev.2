import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { buildReplaceSentence, buildSharedNumberSentence } from "@/lib/crossSetSupersede";
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
const headlineText: CSSProperties = { ...bodyText, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" };
const monoLabel: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase" };
const textButton: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, background: "none", borderRadius: 6,
  padding: "3px 8px", cursor: "pointer", letterSpacing: "0.08em",
};
const cell: CSSProperties = { padding: "5px 8px", textAlign: "left", verticalAlign: "top", borderBottom: "1px solid var(--divider)" };
const headCell: CSSProperties = { ...cell, ...monoLabel, fontWeight: 600, background: "var(--bg-surface-low)", position: "sticky", top: 0 };

const sheetLabels = (rows: readonly CrossSetRow[]) => rows.map((row) => row.newSheetNumber || row.oldSheetNumber);

// "A", "A or B", "A, B or C": a submittal or export holding any one of them is blocked.
const joinOr = (names: readonly string[]) =>
  names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;

/**
 * What superseding does to releasing the old sets, as the shared production
 * database enforces it. Shown only while pages are ticked.
 * - Fab-release and turnover exports leave superseded pages out
 *   (isApprovedForFab).
 * - Exports: every fab_release_log insert re-evaluates each drawing set its
 *   drawing_ids touch (enforce_fab_release_gate → evaluate_fab_release_set), and
 *   one superseded sheet anywhere in a set blocks it. Only a project admin (or
 *   owner) with a reason may override, and that override waives every blocker
 *   (open RFIs, holds, missing files, the governing submittal's stage).
 * - Submittals: enforce_submittal_fab_release_gate still refuses a move INTO
 *   Released for Fabrication while any sheet in its sets is superseded; an
 *   already-released submittal is never re-checked. A non-blank override reason
 *   passes it — writing the status needs pm up — and also skips its open-RFI and
 *   rejected-sheet checks, but not the separate OFS-checklist workflow gate.
 */
function releaseNote(tickedSetNames: readonly string[]): string | null {
  if (tickedSetNames.length === 0) return null;
  const sets = joinOr(tickedSetNames);
  return (
    `Superseded pages are left out of fab-release and turnover exports, but they block release: any such export that includes other pages from ${sets} ` +
    `needs an override reason from someone with project admin access, and moving a submittal that includes ${sets} to Released for Fabrication ` +
    "(if it isn't there yet) needs one from someone with PM access. " +
    "The export override also waives every other export check, including open RFIs and holds; the submittal override also waives open RFIs and rejected sheets."
  );
}

// No Stage column: drawings.stage is seeded "Not Started" by the wizard and
// nothing syncs it from the submittal, so it would say "Not Started" on pages
// the shop may already be cutting.
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
      <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse", background: "var(--bg-surface-low)" }}>
        <caption style={{ ...monoLabel, textAlign: "left", padding: "5px 8px", captionSide: "top" }}>{caption}</caption>
        <thead>
          <tr>
            {canSupersede && <th scope="col" style={{ ...headCell, width: 28 }}><span className="sr-only">Supersede</span></th>}
            <th scope="col" style={headCell}>Sheet</th>
            <th scope="col" style={headCell}>Old set</th>
            <th scope="col" style={headCell}>Title (old / new)</th>
            <th scope="col" style={headCell}>Rev (old → new)</th>
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
  // The group question names the likely replacements only — the rows ticked by
  // default — and its checkbox ticks and unticks only those. A row left
  // unticked for a reason (title missing, short number, older revision,
  // set-name case) needs its own tick.
  const likely = group.rows.filter((row) => row.defaultChecked);
  const hasLikely = likely.length > 0;
  const all = hasLikely && likely.every(isChecked);
  const indeterminate = !all && likely.some(isChecked);
  // Tri-state: a native checkbox's mixed state is only settable as a DOM property.
  const groupRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (groupRef.current) groupRef.current.indeterminate = indeterminate;
  }, [indeterminate, canSupersede, hasLikely]);
  const groupId = `${idPrefix}-group`;
  return (
    <div style={{ marginTop: 10 }}>
      {!hasLikely ? (
        // Every match here is unlikely or locked: say only what the data shows.
        <p style={{ ...headlineText, margin: 0 }}>
          {buildSharedNumberSentence(sheetLabels(group.rows), group.setName, {
            compare: canSupersede && group.rows.some((row) => !row.disabled),
          })}
        </p>
      ) : canSupersede ? (
        <label htmlFor={groupId} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            ref={groupRef}
            id={groupId}
            type="checkbox"
            checked={all}
            onChange={(event) => onToggleGroup(group.setId, event.target.checked)}
            style={{ accentColor: "var(--accent)", cursor: "pointer", marginTop: 2, flexShrink: 0 }}
          />
          <span style={headlineText}>
            {buildReplaceSentence(sheetLabels(likely), group.setName, { ask: true })}
          </span>
        </label>
      ) : (
        <p style={{ ...headlineText, margin: 0 }}>
          {buildReplaceSentence(sheetLabels(likely), group.setName)}
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

function DifferentDrawings({ rows, canSupersede, isChecked, onToggle, idPrefix }: {
  rows: readonly CrossSetRow[];
  canSupersede: boolean;
  isChecked: (row: CrossSetRow) => boolean;
  onToggle: (id: string) => void;
  idPrefix: string;
}) {
  const ticked = rows.filter(isChecked).length;
  // A ticked page is never tucked away: the section opens whenever one is
  // ticked, and the summary says it will be superseded. It never auto-closes.
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ticked > 0 && detailsRef.current) detailsRef.current.open = true;
  }, [ticked]);
  return (
    <details ref={detailsRef} style={{ marginTop: 10 }}>
      <summary style={{ ...bodyText, cursor: "pointer" }}>
        {rows.length} {rows.length === 1 ? "sheet shares" : "sheets share"} a number with a different drawing —{" "}
        {ticked > 0
          ? <span style={{ color: "var(--status-warning)", fontWeight: 600 }}>{ticked} ticked, will be superseded</span>
          : "not superseded"}
      </summary>
      <RowsTable
        rows={rows}
        caption="Same number, different drawing"
        canSupersede={canSupersede}
        isChecked={isChecked}
        onToggle={onToggle}
        idPrefix={idPrefix}
      />
    </details>
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
  const note = canSupersede ? releaseNote(tickedSetNames) : null;

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

      {plan.differentRows.length > 0 && (
        <DifferentDrawings
          rows={plan.differentRows}
          canSupersede={canSupersede}
          isChecked={isChecked}
          onToggle={onToggle}
          idPrefix={`${baseId}-different`}
        />
      )}

      {note && (
        <p style={{ ...bodyText, color: "var(--text-muted)", margin: "10px 0 0" }}>
          {note}
        </p>
      )}
    </section>
  );
}
