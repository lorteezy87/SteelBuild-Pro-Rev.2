/**
 * GcIssuanceTable — the register body: one row per issuance, expandable to the
 * sheets it carried.
 *
 * Colors come from CSS variables only (design-system rule); nothing here
 * hardcodes a surface, text or border hex.
 */

import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resolveFileUrl } from "@/api/client/storage";
import { hubHref } from "@/pages/drawingSubmittalHub/hubLinks";
import type { RowWithAliases } from "@/api/supabaseClient";
import type { GcShopImpactLink } from "@/lib/gcDocuments/gcShopImpactLinks";
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

function SourcePdfPanel({ fileUrl }: { fileUrl: string }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setResolvedUrl(null);
    setError(false);
    void resolveFileUrl(fileUrl).then((url) => {
      if (!active) return;
      if (url) setResolvedUrl(url);
      else setError(true);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [fileUrl]);

  if (error) return <div role="alert" style={{ color: "var(--status-error)", fontSize: 12 }}>The source PDF could not be opened. Check your access or retry the register.</div>;
  if (!resolvedUrl) return <div role="status" style={{ color: "var(--text-muted)", fontSize: 12 }}>Preparing private GC source PDF…</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12, justifySelf: "start" }}>Open GC source PDF</a>
      <iframe title="GC source PDF preview" src={resolvedUrl} style={{ width: "100%", height: 360, border: "1px solid var(--border-default)", borderRadius: 6, background: "#fff" }} />
    </div>
  );
}

export default function GcIssuanceTable({
  issuances,
  expanded,
  linksByIssuance = new Map(),
  shopSets = [],
  impactLinksStatus = "unavailable",
  canEdit,
  canDelete,
  onToggleExpand,
  onEdit,
  onSetImpact,
  onDelete,
}: {
  issuances: GcIssuance[];
  expanded: ReadonlySet<string>;
  linksByIssuance?: ReadonlyMap<string, GcShopImpactLink[]>;
  shopSets?: RowWithAliases<"drawing_sets">[];
  impactLinksStatus?: "loading" | "available" | "unavailable";
  canEdit: boolean;
  canDelete: boolean;
  onToggleExpand: (id: string) => void;
  onEdit: (issuance: GcIssuance) => void;
  onSetImpact: (issuance: GcIssuance) => void;
  onDelete: (issuance: GcIssuance) => void;
}) {
  const shopById = new Map(shopSets.map((set) => [set.id, set]));
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
            const linked = impactLinksStatus === "available"
              ? linksByIssuance.get(issuance.id) ?? []
              : [];
            const expandable = issuance.sheets.length > 0 || linked.length > 0 || !!issuance.set.file_url;
            return (
              <Fragment key={issuance.id}>
                <tr>
                  <td style={cell}>
                    <button
                      type="button"
                      onClick={() => onToggleExpand(issuance.id)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${issuance.label}`}
                      disabled={!expandable}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: expandable ? "var(--text-primary)" : "var(--text-muted)",
                        cursor: expandable ? "pointer" : "default",
                        fontSize: 12,
                        padding: 0,
                      }}
                    >
                      {expandable ? (isOpen ? "▾" : "▸") : "·"}
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
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                      {impactLinksStatus === "loading"
                        ? "Affected shop links: verifying"
                        : impactLinksStatus === "unavailable"
                          ? "Affected shop links: unavailable"
                          : linked.length > 0
                            ? `${linked.length} affected shop set${linked.length === 1 ? "" : "s"} explicitly linked`
                            : "No shop sets explicitly linked"}
                    </div>
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
                {isOpen && issuance.set.file_url && (
                  <tr>
                    <td style={cell} />
                    <td style={cell} colSpan={9}>
                      <strong style={{ display: "block", marginBottom: 7, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Original GC issuance PDF</strong>
                      <SourcePdfPanel fileUrl={String(issuance.set.file_url)} />
                    </td>
                  </tr>
                )}
                {isOpen && issuance.sheets.map((sheet) => (
                  <SheetRow key={String(sheet.id)} sheet={sheet} />
                ))}
                {isOpen && linked.length > 0 && (
                  <tr>
                    <td style={cell} />
                    <td style={cell} colSpan={9}>
                      <strong style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Affected shop drawing sets</strong>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                        {linked.map((link) => {
                          const shopSet = shopById.get(link.drawing_set_id);
                          return shopSet ? (
                            <Link key={link.id} to={hubHref("drawings", { hub_view: "sets", set: link.drawing_set_id })}
                              style={{ color: "var(--accent)", fontSize: 12 }}>
                              {String(shopSet.set_name ?? link.drawing_set_id)}
                            </Link>
                          ) : (
                            <span key={link.id} style={{ color: "var(--status-review)", fontSize: 12 }}>
                              Archived or unavailable set {link.drawing_set_id}
                            </span>
                          );
                        })}
                      </div>
                      <small style={{ display: "block", color: "var(--text-muted)", marginTop: 5 }}>
                        Impact mapping only. Shop approval and fabrication release have their own gates.
                      </small>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
