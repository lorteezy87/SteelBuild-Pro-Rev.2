/**
 * ContextPanel — right-rail panel for the drawing viewer.
 *
 * Turns the viewer from "just a PDF" into a work hub by surfacing
 * everything tied to the active sheet:
 *   - Metadata (discipline, spec, reviewer, revision, dates)
 *   - Linked RFIs — any RFI whose drawing_reference contains this
 *     sheet number (fuzzy match, case-insensitive)
 *   - Callouts on this sheet (cross-sheet refs extracted at upload)
 *   - Sheets in the same set (quick jump list)
 *
 * Collapsible via a toggle on the header. The viewer page owns the
 * open/closed state so it persists across sheet navigations.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { X, FileText, AlertTriangle, Link2, Layers } from "lucide-react";
import SignoffStampPanel from "@/components/drawings/SignoffStampPanel";

const mono = { fontFamily: "var(--font-mono)" };

const SHEET_REF_RE = /[A-Z]{1,3}[-\s]?\d{1,5}/gi;

function normalizeSN(s) {
  return String(s || "").toUpperCase().replace(/[\s\-_.]/g, "");
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
  const setName = activeDrawing?.drawing_set_name;

  // Linked RFIs — pull all RFIs for the project once, then filter client-side
  // by substring match on drawing_reference. Cheap at project scale (a few
  // hundred RFIs tops).
  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () =>
      projectId ? base44.entities.RFI.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const linkedRfis = useMemo(() => {
    if (!sheetNumber) return [];
    const target = normalizeSN(sheetNumber);
    return rfis.filter((r) => {
      const ref = String(r.drawing_reference || "").toUpperCase();
      if (!ref) return false;
      // Normalize any sheet ref found inside the field and match.
      const matches = ref.match(SHEET_REF_RE) || [];
      for (const m of matches) {
        if (normalizeSN(m) === target) return true;
      }
      // Also allow a pure substring match as a fallback.
      return normalizeSN(ref).includes(target);
    });
  }, [rfis, sheetNumber]);

  const siblingSheets = useMemo(() => {
    if (!setName) return [];
    return allDrawings
      .filter((d) => d.drawing_set_name === setName && d.id !== activeDrawing?.id)
      .slice(0, 12);
  }, [allDrawings, setName, activeDrawing?.id]);

  const callouts = Array.isArray(activeDrawing?.callouts)
    ? activeDrawing.callouts
    : [];

  if (!activeDrawing) return null;

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg-surface-low)",
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 12, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Sheet Context
          </div>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>
            {sheetNumber || "—"}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close context panel"
            style={{
              background: "none",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              padding: 3,
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Meta */}
        <Section icon={<FileText size={11} />} title="Metadata">
          <MetaRow label="Discipline"    value={activeDrawing.discipline} />
          <MetaRow label="Revision"      value={activeDrawing.revision_number != null ? `R${activeDrawing.revision_number}` : null} />
          <MetaRow label="Stage"         value={activeDrawing.stage} />
          <MetaRow label="Spec Section"  value={activeDrawing.spec_section} />
          <MetaRow label="Reviewer"      value={activeDrawing.reviewer} />
          <MetaRow label="Submitted"     value={activeDrawing.submitted_date} />
          <MetaRow label="Due"           value={activeDrawing.due_date} />
          <MetaRow label="Approved"      value={activeDrawing.approved_date} />
          <MetaRow label="Set"           value={activeDrawing.drawing_set_name} />
        </Section>

        {/* Sign-offs (migration 072) — append-only review stamps. */}
        {drawingRevisionId && (
          <SignoffStampPanel
            projectId={projectId}
            drawingId={activeDrawing.id}
            drawingRevisionId={drawingRevisionId}
            isLocked={isSetLocked}
            compact
          />
        )}

        {/* Linked RFIs */}
        <Section
          icon={<AlertTriangle size={11} />}
          title={`Linked RFIs (${linkedRfis.length})`}
        >
          {linkedRfis.length === 0 ? (
            <div style={emptyStyle}>No RFIs reference this sheet</div>
          ) : (
            linkedRfis.slice(0, 8).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() =>
                  navigate(`${createPageUrl("RFIs")}?id=${r.id}`)
                }
                style={linkRowStyle}
              >
                <div style={{ ...mono, fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>
                  {r.rfi_number || "RFI"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title || "Untitled"}
                </div>
                <div style={{ ...mono, fontSize: 8, color: statusColorFor(r.status), letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {r.status || "—"}
                </div>
              </button>
            ))
          )}
          {linkedRfis.length > 8 && (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
              …+{linkedRfis.length - 8} more
            </div>
          )}
        </Section>

        {/* Callouts */}
        <Section
          icon={<Link2 size={11} />}
          title={`Callouts (${callouts.length})`}
        >
          {callouts.length === 0 ? (
            <div style={emptyStyle}>No cross-sheet callouts detected</div>
          ) : (
            callouts.slice(0, 10).map((c, i) => {
              const match = allDrawings.find(
                (d) => normalizeSN(d.sheet_number) === normalizeSN(c.targetSheetNumber)
              );
              const resolved = !!match;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!resolved}
                  onClick={() => resolved && onSelect(match.id)}
                  style={{
                    ...linkRowStyle,
                    opacity: resolved ? 1 : 0.5,
                    cursor: resolved ? "pointer" : "not-allowed",
                  }}
                >
                  <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: resolved ? "var(--accent)" : "var(--text-muted)" }}>
                    {c.text || c.targetSheetNumber || "?"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                    → {c.targetSheetNumber}
                    {match?.title ? ` · ${match.title}` : ""}
                  </div>
                </button>
              );
            })
          )}
        </Section>

        {/* Sibling sheets */}
        {siblingSheets.length > 0 && (
          <Section icon={<Layers size={11} />} title={`In set: ${setName}`}>
            {siblingSheets.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect(d.id)}
                style={linkRowStyle}
              >
                <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
                  {d.sheet_number}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.title || "—"}
                </div>
              </button>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div>
      <div
        style={{
          ...mono,
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 5,
          borderLeft: "3px solid var(--accent)",
          paddingLeft: 6,
        }}
      >
        {icon}
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", borderBottom: "1px solid var(--hover-bg)" }}>
      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: value ? "var(--text-primary)" : "var(--text-muted)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
        {value || "—"}
      </div>
    </div>
  );
}

const linkRowStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  padding: "6px 8px",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  cursor: "pointer",
  textAlign: "left",
  transition: "border-color 0.15s, background 0.15s",
};

const emptyStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--text-muted)",
  fontStyle: "italic",
  padding: "4px 2px",
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
