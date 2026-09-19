import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CornerUpLeft, FileText, Layers, Link2, X } from "lucide-react";
import {
  backLinkTooltip,
  buildSectionCutLinkIndex,
  linkLabel,
  linkTooltip,
} from "@/lib/sectionCutLinks";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import SignoffStampPanel from "@/components/drawings/SignoffStampPanel";
import { DEFAULT_LIST_CAP } from "@/components/shared/ListTruncationNotice";

const mono = { fontFamily: "var(--font-mono)" };
const SHEET_REF_RE = /[A-Z]{1,3}[-\s]?\d{1,5}/gi;

function normalizeSN(value) {
  return String(value || "").toUpperCase().replace(/[\s\-_.]/g, "");
}

export default function ContextPanel({
  activeDrawing,
  allDrawings,
  onSelect,
  onClose,
  drawingRevisionId,
  isSetLocked = false,
}) {
  const navigate = useNavigate();

  const projectId = activeDrawing?.project_id;
  const sheetNumber = activeDrawing?.sheet_number;
  const setId = activeDrawing?.drawing_set_id;
  const setName = activeDrawing?.drawing_set_name;

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () =>
      projectId ? entities.RFI.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const linkedRfis = useMemo(() => {
    if (!sheetNumber) return [];
    const target = normalizeSN(sheetNumber);
    return rfis.filter((rfi) => {
      const reference = String(rfi.drawing_reference || "").toUpperCase();
      if (!reference) return false;
      const matches = reference.match(SHEET_REF_RE) || [];
      for (const match of matches) {
        if (normalizeSN(match) === target) return true;
      }
      return normalizeSN(reference).includes(target);
    });
  }, [rfis, sheetNumber]);

  const siblingSheets = useMemo(() => {
    if (!setId && !setName) return [];
    return allDrawings
      .filter((drawing) => {
        if (drawing.id === activeDrawing?.id) return false;
        if (setId) return drawing.drawing_set_id === setId;
        return drawing.drawing_set_name === setName;
      })
      .slice(0, 12);
  }, [allDrawings, setId, setName, activeDrawing?.id]);

  // Both directions in one O(links) build, replacing the per-callout
  // allDrawings.find() below. `incoming` is new: until now nothing could answer
  // "what references THIS sheet?".
  //
  // allDrawings is the project register read, which is row-capped. A sheet past
  // the cap was never read, so its callouts were never seen — which is why the
  // reverse section must never print a bare "nothing references this sheet".
  const linkIndex = useMemo(
    () => buildSectionCutLinkIndex(allDrawings || [], {
      registerComplete: (allDrawings?.length ?? 0) < DEFAULT_LIST_CAP,
    }),
    [allDrawings],
  );
  const outgoing = linkIndex.outgoing(activeDrawing?.id);
  const incoming = linkIndex.incoming(activeDrawing?.id);
  const outgoingLinks = [...outgoing.resolved, ...outgoing.unresolved];

  if (!activeDrawing) return null;

  return (
    <aside
      className="drawing-context-panel"
      style={{
        width: "var(--viewer-context-width)",
        flexShrink: 0,
        borderLeft: "1px solid var(--viewer-line, var(--border-default))",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 0,
        minWidth: 0,
      }}
    >
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={kickerStyle}>Sheet Intelligence</div>
          <div style={titleStyle}>{sheetNumber || "Sheet"}</div>
          <div style={subtitleStyle}>{activeDrawing.title || "Untitled drawing"}</div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close context panel" style={closeButtonStyle}>
            <X size={15} />
          </button>
        )}
      </div>

      <div style={scorecardStyle}>
        <Signal label="RFIs" value={linkedRfis.length} tone={linkedRfis.length ? "risk" : "neutral"} />
        <Signal label="Refs out" value={outgoingLinks.length} />
        <Signal label="Refs in" value={incoming.links.length} />
        <Signal label="Set Sheets" value={siblingSheets.length + 1} />
      </div>

      <div style={bodyStyle}>
        <Section icon={<FileText size={13} />} title="Drawing Details">
          <MetaRow label="Set" value={setName} />
          <MetaRow label="Discipline" value={activeDrawing.discipline} />
          <MetaRow label="Revision" value={activeDrawing.revision_number != null ? `R${activeDrawing.revision_number}` : "R0"} />
          <MetaRow label="Stage" value={activeDrawing.stage} />
          <MetaRow label="Spec" value={activeDrawing.spec_section} />
          <MetaRow label="Reviewer" value={activeDrawing.reviewer} />
          <MetaRow label="Submitted" value={activeDrawing.submitted_date} />
          <MetaRow label="Due" value={activeDrawing.due_date} />
          <MetaRow label="Approved" value={activeDrawing.approved_date} />
        </Section>

        {drawingRevisionId && (
          <div style={signoffShellStyle}>
            <SignoffStampPanel
              projectId={projectId}
              drawingId={activeDrawing.id}
              drawingRevisionId={drawingRevisionId}
              isLocked={isSetLocked}
              compact
            />
          </div>
        )}

        <Section icon={<AlertTriangle size={13} />} title={`Linked RFIs (${linkedRfis.length})`}>
          {linkedRfis.length === 0 ? (
            <EmptyLine>No RFIs reference this sheet.</EmptyLine>
          ) : (
            linkedRfis.slice(0, 8).map((rfi) => (
              <button
                key={rfi.id}
                type="button"
                onClick={() => navigate(`${createPageUrl("RFIs")}?id=${rfi.id}`)}
                className="drawing-context-link"
                style={linkRowStyle}
              >
                <div style={rowTopStyle}>
                  <span style={rowPrimaryStyle}>{rfi.rfi_number || "RFI"}</span>
                  <span style={{ ...statusTextStyle, color: statusColorFor(rfi.status) }}>{rfi.status || "Status TBD"}</span>
                </div>
                <div style={rowTitleStyle}>{rfi.title || "Untitled RFI"}</div>
              </button>
            ))
          )}
          {linkedRfis.length > 8 && <div style={moreStyle}>+{linkedRfis.length - 8} more linked RFIs</div>}
        </Section>

        <Section icon={<Link2 size={13} />} title={`References Out (${outgoingLinks.length})`}>
          {!outgoing.sourceHarvested ? (
            <EmptyLine>This sheet has not been scanned for callouts yet.</EmptyLine>
          ) : outgoingLinks.length === 0 ? (
            <EmptyLine>No cross-sheet callouts detected on this sheet.</EmptyLine>
          ) : (
            outgoingLinks.slice(0, 10).map((link, index) => {
              const resolved = !!link.targetDrawingId;
              return (
                <button
                  key={`out-${link.targetKey}-${link.detailNumber || ""}-${index}`}
                  type="button"
                  disabled={!resolved}
                  onClick={() => resolved && onSelect(link.targetDrawingId)}
                  title={linkTooltip(link)}
                  className="drawing-context-link"
                  style={{
                    ...linkRowStyle,
                    opacity: resolved ? 1 : 0.52,
                    cursor: resolved ? "pointer" : "not-allowed",
                  }}
                >
                  <div style={rowTopStyle}>
                    <span style={rowPrimaryStyle}>
                      <Link2 size={11} aria-hidden="true" style={{ marginRight: 5, verticalAlign: "-1px" }} />
                      {linkLabel(link)}
                    </span>
                    <span style={statusTextStyle}>
                      {resolved ? (link.origin === "manual" ? "Manual" : "Resolved") : "Unmatched"}
                    </span>
                  </div>
                  <div style={rowTitleStyle}>
                    {resolved
                      ? `${link.targetSheetNumber}${link.targetSheetTitle ? ` - ${link.targetSheetTitle}` : ""}`
                      : `${link.targetAsPrinted} not in this register`}
                  </div>
                </button>
              );
            })
          )}
          {outgoingLinks.length > 10 && <div style={moreStyle}>+{outgoingLinks.length - 10} more references</div>}
        </Section>

        <Section icon={<CornerUpLeft size={13} />} title={`Referenced By (${incoming.links.length})`}>
          {incoming.links.length === 0 ? (
            <EmptyLine>
              {incoming.complete
                ? "No other sheet in this register calls out this sheet."
                : "None found — but the register read was capped, so a referencing sheet may not have been read."}
            </EmptyLine>
          ) : (
            incoming.links.slice(0, 10).map((link, index) => (
              <button
                key={`in-${link.sourceDrawingId}-${link.detailNumber || ""}-${index}`}
                type="button"
                onClick={() => onSelect(link.sourceDrawingId)}
                title={backLinkTooltip(link)}
                className="drawing-context-link"
                style={linkRowStyle}
              >
                <div style={rowTopStyle}>
                  <span style={rowPrimaryStyle}>
                    <CornerUpLeft size={11} aria-hidden="true" style={{ marginRight: 5, verticalAlign: "-1px" }} />
                    {link.sourceSheetNumber || "Sheet"}
                  </span>
                  <span style={statusTextStyle}>
                    {link.detailNumber ? `Detail ${link.detailNumber}` : "Reference"}
                  </span>
                </div>
                <div style={rowTitleStyle}>{link.sourceSheetTitle || "Untitled sheet"}</div>
              </button>
            ))
          )}
          {incoming.links.length > 10 && <div style={moreStyle}>+{incoming.links.length - 10} more referencing sheets</div>}
          {incoming.links.length > 0 && !incoming.complete && (
            <div style={moreStyle}>Register read was capped — more may reference this sheet.</div>
          )}
        </Section>

        {siblingSheets.length > 0 && (
          <Section icon={<Layers size={13} />} title="Same Drawing Set">
            {siblingSheets.map((drawing) => (
              <button
                key={drawing.id}
                type="button"
                onClick={() => onSelect(drawing.id)}
                className="drawing-context-link"
                style={linkRowStyle}
              >
                <div style={rowTopStyle}>
                  <span style={rowPrimaryStyle}>{drawing.sheet_number || drawing.drawing_number || "Sheet"}</span>
                  <span style={statusTextStyle}>{drawing.stage || "Stage TBD"}</span>
                </div>
                <div style={rowTitleStyle}>{drawing.title || "Untitled drawing"}</div>
              </button>
            ))}
          </Section>
        )}
      </div>
    </aside>
  );
}

function Signal({ label, value, tone = "neutral" }) {
  return (
    <div style={{
      ...signalStyle,
      borderColor: tone === "risk" ? "rgba(239,68,68,0.34)" : "var(--viewer-line, var(--border-default))",
    }}>
      <strong style={{ color: tone === "risk" ? "var(--status-error)" : "var(--text-primary)" }}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <section style={sectionStyle}>
      <div style={sectionTitleStyle}>
        {icon}
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </section>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={metaRowStyle}>
      <span style={metaLabelStyle}>{label}</span>
      <span style={metaValueStyle}>{value || "TBD"}</span>
    </div>
  );
}

function EmptyLine({ children }) {
  return <div style={emptyStyle}>{children}</div>;
}

const headerStyle = {
  flexShrink: 0,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px",
  borderBottom: "1px solid var(--viewer-line, var(--border-default))",
  background: "var(--viewer-panel-bg)",
};

const kickerStyle = {
  ...mono,
  marginBottom: 4,
  color: "var(--text-muted)",
  fontSize: 10,
  fontWeight: 850,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const titleStyle = {
  ...mono,
  color: "var(--accent)",
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: 0,
};

const subtitleStyle = {
  maxWidth: 232,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  marginTop: 4,
  color: "var(--text-secondary)",
  fontSize: 12,
};

const closeButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 30,
  height: 30,
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 8,
  background: "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
  color: "var(--text-muted)",
  cursor: "pointer",
};

const scorecardStyle = {
  flexShrink: 0,
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
  padding: "12px 14px",
  borderBottom: "1px solid var(--viewer-line, var(--border-default))",
  background: "var(--viewer-panel-bg)",
};

const signalStyle = {
  ...mono,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "8px",
  border: "1px solid",
  borderRadius: 8,
  background: "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
  color: "var(--text-muted)",
  fontSize: 9,
  fontWeight: 850,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const bodyStyle = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 14,
};

const sectionStyle = {
  padding: 12,
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 8,
  background: "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
};

const sectionTitleStyle = {
  ...mono,
  display: "flex",
  alignItems: "center",
  gap: 7,
  marginBottom: 10,
  color: "var(--text-muted)",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const metaRowStyle = {
  display: "grid",
  gridTemplateColumns: "88px minmax(0, 1fr)",
  gap: 8,
  alignItems: "baseline",
  padding: "5px 0",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const metaLabelStyle = {
  ...mono,
  color: "var(--text-muted)",
  fontSize: 9,
  fontWeight: 850,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const metaValueStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-primary)",
  textAlign: "right",
  fontSize: 12,
};

const signoffShellStyle = {
  overflow: "hidden",
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 8,
  background: "var(--viewer-panel-bg-soft, var(--bg-surface-low))",
};

const linkRowStyle = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "8px 9px",
  border: "1px solid var(--viewer-line, var(--border-default))",
  borderRadius: 8,
  background: "var(--viewer-panel-bg, var(--bg-surface))",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
  transition: "border-color 120ms ease, background 120ms ease",
};

const rowTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const rowPrimaryStyle = {
  ...mono,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--accent)",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0,
};

const statusTextStyle = {
  ...mono,
  flexShrink: 0,
  color: "var(--text-muted)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const rowTitleStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-secondary)",
  fontSize: 11,
};

const emptyStyle = {
  color: "var(--text-muted)",
  fontSize: 11,
  fontStyle: "italic",
  padding: "4px 2px",
};

const moreStyle = {
  ...mono,
  color: "var(--text-muted)",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 0,
};

function statusColorFor(status) {
  switch (status) {
    case "Answered":
    case "Closed":
      return "var(--status-success)";
    case "Open":
    case "Under Review":
      return "var(--status-warning)";
    default:
      return "var(--text-muted)";
  }
}
