import React, { useState, useMemo } from "react";
import { formatDate } from "../shared/formatters";

/**
 * RoundTimeline — vertical timeline showing all rounds for a submittal.
 *
 * Used inside the SubmittalDetail panel. Each node shows the round
 * badge, status, date span, reviewer, ball-in-court, and response
 * notes (expandable). The latest round is highlighted.
 *
 * Props:
 *   rounds        — submittal_round records, pre-sorted ascending by round_number
 *   submittalId   — parent submittal UUID (informational)
 *   onReturnRound — callback(roundId) when user marks a round returned
 */

// Status → color palette matching STATUS_CFG in Submittals.jsx so the
// timeline chips feel like siblings of the table badges.
const ROUND_STATUS_COLORS = {
  "Draft":               { color: "#64748B", bg: "rgba(100,116,139,0.16)" },
  "Submitted":           { color: "#2563EB", bg: "rgba(37,99,235,0.18)"   },
  "Under Review":        { color: "#0D9488", bg: "rgba(13,148,136,0.18)"  },
  "Approved":            { color: "#10B981", bg: "rgba(16,185,129,0.18)"  },
  "Approved as Noted":   { color: "#84CC16", bg: "rgba(132,204,22,0.18)"  },
  "Revise and Resubmit": { color: "#F97316", bg: "rgba(249,115,22,0.18)"  },
  "Rejected":            { color: "#DC2626", bg: "rgba(220,38,38,0.18)"   },
  "Released for Fabrication": { color: "#0EA5E9", bg: "rgba(14,165,233,0.18)" },
  "Void":                { color: "#94A3B8", bg: "rgba(148,163,184,0.14)" },
};
const DEFAULT_COLOR = { color: "#64748B", bg: "rgba(100,116,139,0.16)" };

function daysBetween(isoA, isoB) {
  if (!isoA || !isoB) return null;
  const a = new Date(isoA);
  const b = new Date(isoB);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round(Math.abs(b - a) / 86_400_000);
}

export default function RoundTimeline({ rounds = [], submittalId, onReturnRound }) {
  if (rounds.length === 0) {
    return (
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-muted)",
        fontStyle: "italic",
        padding: "8px 0",
      }}>
        No rounds recorded yet.
      </div>
    );
  }

  const lastIdx = rounds.length - 1;

  return (
    <div style={{ position: "relative", paddingLeft: 24 }}>
      {/* Vertical line */}
      <div
        style={{
          position: "absolute",
          left: 8,
          top: 6,
          bottom: 6,
          width: 2,
          background: "var(--divider)",
          borderRadius: 1,
        }}
      />

      {rounds.map((round, idx) => (
        <RoundNode
          key={round.id}
          round={round}
          isLatest={idx === lastIdx}
          isFirst={idx === 0}
          onReturn={onReturnRound}
        />
      ))}
    </div>
  );
}

function RoundNode({ round, isLatest, isFirst, onReturn }) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const cfg = ROUND_STATUS_COLORS[round.status] || DEFAULT_COLOR;
  const duration = daysBetween(round.submitted_date, round.returned_date);
  const hasLongNotes = (round.response_notes || "").length > 120;
  const notesText = round.response_notes || "";

  return (
    <div style={{
      position: "relative",
      paddingBottom: 16,
      paddingTop: isFirst ? 0 : 4,
    }}>
      {/* Dot on the timeline */}
      <div
        style={{
          position: "absolute",
          left: -20,
          top: isFirst ? 3 : 7,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: isLatest ? "var(--accent)" : cfg.color,
          border: isLatest ? "2px solid var(--accent)" : "2px solid var(--bg-surface-low)",
          boxShadow: isLatest ? "0 0 0 3px var(--accent-muted)" : "none",
        }}
      />

      {/* Content card */}
      <div style={{
        background: isLatest ? "var(--bg-surface-high)" : "var(--bg-surface-low)",
        border: isLatest ? "1px solid var(--accent)" : "1px solid var(--border-default)",
        borderRadius: 6,
        padding: "10px 14px",
      }}>
        {/* Header: round badge + status chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 800,
            color: isLatest ? "var(--accent)" : "var(--text-primary)",
            letterSpacing: "0.06em",
          }}>
            R{round.round_number || "?"}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 3,
            color: cfg.color,
            background: cfg.bg,
          }}>
            {round.status || "Draft"}
          </span>
          {isLatest && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              color: "var(--accent)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
              CURRENT
            </span>
          )}
        </div>

        {/* Date span */}
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          marginBottom: 4,
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <span>{formatDate(round.submitted_date)}</span>
          <span style={{ color: "var(--border-default)" }}>{"→"}</span>
          <span>{round.returned_date ? formatDate(round.returned_date) : "Pending"}</span>
          {duration != null && (
            <span style={{
              color: "var(--text-muted)",
              fontWeight: 700,
              marginLeft: 4,
            }}>
              ({duration}d)
            </span>
          )}
        </div>

        {/* Meta row: BIC + Reviewer */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
          {round.ball_in_court && (
            <MetaInline label="BIC" value={round.ball_in_court} />
          )}
          {round.reviewer && (
            <MetaInline label="Reviewer" value={round.reviewer} />
          )}
          {round.submitted_by && (
            <MetaInline label="Submitted By" value={round.submitted_by} />
          )}
        </div>

        {/* Response notes */}
        {notesText && (
          <div style={{ marginTop: 6 }}>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
              maxHeight: hasLongNotes && !notesExpanded ? 48 : "none",
              overflow: "hidden",
            }}>
              {notesText}
            </div>
            {hasLongNotes && (
              <button
                onClick={() => setNotesExpanded((p) => !p)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "2px 0",
                  letterSpacing: "0.06em",
                  marginTop: 2,
                }}
              >
                {notesExpanded ? "COLLAPSE" : "EXPAND"}
              </button>
            )}
          </div>
        )}

        {/* Mark Returned button — only if round has no returned_date */}
        {!round.returned_date && onReturn && (
          <button
            onClick={() => onReturn(round.id)}
            style={{
              marginTop: 8,
              padding: "5px 12px",
              borderRadius: 4,
              background: "transparent",
              border: "1px solid var(--accent)",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Mark Returned
          </button>
        )}
      </div>
    </div>
  );
}

function MetaInline({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-muted)",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "var(--font-body)",
        fontSize: 11,
        color: "var(--text-primary)",
        fontWeight: 500,
      }}>
        {value}
      </span>
    </div>
  );
}
