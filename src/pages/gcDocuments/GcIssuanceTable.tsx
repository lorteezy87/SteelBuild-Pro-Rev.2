/**
 * GcIssuanceTable — the register body: one row per issuance, expandable to the
 * sheets it carried.
 *
 * Colors come from CSS variables only (design-system rule); nothing here
 * hardcodes a surface, text or border hex.
 */

import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
  GC_DOC_TYPE_LABELS,
  STEEL_IMPACT_SHORT_LABELS,
  STEEL_IMPACT_TOKENS,
  steelImpactLabel,
} from "@/lib/gcDocuments/gcDocTypes";
import type { GcDrawingRow, GcIssuance } from "./gcDocumentsPageDerive";

const cell: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 12.5,
  color: "var(--text-primary)",
  borderBottom: "1px solid var(--border-default)",
  verticalAlign: "top",
};

const head: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 10.5,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  textAlign: "left",
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border-default)",
  whiteSpace: "nowrap",
};

function ImpactChip({ issuance }: { issuance: GcIssuance }) {
  const token = STEEL_IMPACT_TOKENS[issuance.steelImpact];
  return (
    <span
      title={steelImpactLabel(issuance.steelImpact)}
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: token,
        border: `1px solid ${token}`,
        background: "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {STEEL_IMPACT_SHORT_LABELS[issuance.steelImpact]}
    </span>
  );
}

/**
 * Notice = issued → received. Renders an em dash when either date is missing:
 * unknown notice is not zero notice, and "0 days" would read as same-day
 * delivery on an issuance whose dates nobody filled in.
 */
function NoticeCell({ days }: { days: number | null }) {
  if (days == null) {
    return <span style={{ color: "var(--text-muted)" }} title="Issued or received date not recorded">—</span>;
  }
  return <span>{days}d</span>;
}

function SheetRow({ sheet }: { sheet: GcDrawingRow }) {
  const superseded = sheet.is_superseded === true;
  return (
    <tr>
      <td style={cell} />
      <td style={{ ...cell, fontFamily: "var(--font-mono, monospace)" }}>
        {String(sheet.drawing_number ?? "—")}
      </td>
      <td style={cell} colSpan={3}>
        {String(sheet.title ?? "")}
      </td>
      <td style={cell}>{String(sheet.revision ?? "—")}</td>
      <td style={cell} colSpan={2}>
        {superseded ? (
          <span style={{ color: "var(--text-muted)" }}>Superseded</span>
        ) : (
          <span style={{ color: "var(--status-success)" }}>Current</span>
        )}
      </td>
      <td style={cell}>
        {/* Only offered when a PDF actually exists. A register row can be
            logged before its file lands, and a View link that opens an empty
            viewer is worse than no link. */}
        {sheet.file_url ? (
          <Link
            to={`/GcDrawingViewer?doc=${encodeURIComponent(String(sheet.id))}`}
            className="sbd-btn-ghost"
            style={{ fontSize: 11, textDecoration: "none" }}
          >
            View
          </Link>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No file</span>
        )}
      </td>
    </tr>
  );
}

export default function GcIssuanceTable({
  issuances,
  expanded,
  canEdit,
  canDelete,
  onToggleExpand,
  onEdit,
  onSetImpact,
  onDelete,
}: {
  issuances: GcIssuance[];
  expanded: ReadonlySet<string>;
  canEdit: boolean;
  canDelete: boolean;
  onToggleExpand: (id: string) => void;
  onEdit: (issuance: GcIssuance) => void;
  onSetImpact: (issuance: GcIssuance) => void;
  onDelete: (issuance: GcIssuance) => void;
}) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card, 8px)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--bg-surface-low)" }}>
        <caption className="sr-only">
          GC-issued documents, newest first. Each row expands to the sheets it carried.
        </caption>
        <thead>
          <tr>
            <th style={{ ...head, width: 32 }} aria-label="Expand" />
            <th style={head}>Reference</th>
            <th style={head}>Type</th>
            <th style={head}>Name</th>
            <th style={head}>Issued by</th>
            <th style={head}>Received</th>
            <th style={head} title="Days between the date on the document and the day we received it">Notice</th>
            <th style={head}>Sheets</th>
            <th style={head}>Steel impact</th>
            <th style={head} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {issuances.map((issuance) => {
            const isOpen = expanded.has(issuance.id);
            return (
              <Fragment key={issuance.id}>
                <tr>
                  <td style={cell}>
                    <button
                      type="button"
                      onClick={() => onToggleExpand(issuance.id)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${issuance.label}`}
                      disabled={issuance.sheets.length === 0}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: issuance.sheets.length ? "var(--text-primary)" : "var(--text-muted)",
                        cursor: issuance.sheets.length ? "pointer" : "default",
                        fontSize: 12,
                        padding: 0,
                      }}
                    >
                      {issuance.sheets.length ? (isOpen ? "▾" : "▸") : "·"}
                    </button>
                  </td>
                  <td style={{ ...cell, fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                    {String(issuance.set.doc_number ?? "—")}
                  </td>
                  <td style={cell}>{GC_DOC_TYPE_LABELS[issuance.docType]}</td>
                  <td style={cell}>
                    {String(issuance.set.set_name ?? "")}
                    {issuance.supersededCount > 0 && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        supersedes {issuance.supersededCount} sheet(s)
                      </div>
                    )}
                  </td>
                  <td style={cell}>{String(issuance.set.issued_by ?? "—")}</td>
                  <td style={{ ...cell, fontFamily: "var(--font-mono, monospace)", whiteSpace: "nowrap" }}>
                    {String(issuance.set.received_date ?? "—")}
                  </td>
                  <td style={cell}><NoticeCell days={issuance.noticeDays} /></td>
                  <td style={cell}>{issuance.sheets.length || "—"}</td>
                  <td style={cell}><ImpactChip issuance={issuance} /></td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      className="sbd-btn"
                      onClick={() => onSetImpact(issuance)}
                      disabled={!canEdit}
                      title={canEdit ? "Record the steel-impact disposition" : "Needs PM access"}
                      style={{ fontSize: 11, marginRight: 6 }}
                    >
                      Impact
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        className="sbd-btn"
                        onClick={() => onEdit(issuance)}
                        style={{ fontSize: 11, marginRight: 6 }}
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="sbd-btn"
                        onClick={() => onDelete(issuance)}
                        style={{ fontSize: 11 }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen && issuance.sheets.map((sheet) => (
                  <SheetRow key={String(sheet.id)} sheet={sheet} />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
