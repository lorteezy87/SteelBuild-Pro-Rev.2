import React from "react";

const TYPE_COLORS = {
  OAC: "var(--status-error)",
  Internal: "var(--status-info)",
  Safety: "var(--status-warning)",
  Kickoff: "var(--accent)",
  Progress: "var(--status-success)",
  Other: "var(--text-muted)",
};

const STATUS_COLORS = {
  Scheduled: "var(--status-info)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  Cancelled: "var(--text-muted)",
};

/* ── Action-item heuristic: extract action items from minutes text ── */
function parseActionItems(minutes) {
  if (!minutes) return { total: 0, complete: 0 };
  // Look for patterns like "[ ]", "[x]", "- ACTION:", "TODO:", numbered action lines
  const lines = minutes.split("\n");
  let total = 0;
  let complete = 0;
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (
      trimmed.match(/^\[.\]/) ||
      trimmed.match(/^-\s*(action|todo|task)/i) ||
      trimmed.match(/^\d+\.\s*(action|todo|task)/i) ||
      trimmed.match(/^(action|todo|task)\s*:/i)
    ) {
      total++;
      if (
        trimmed.startsWith("[x]") ||
        trimmed.includes("(done)") ||
        trimmed.includes("(complete)")
      ) {
        complete++;
      }
    }
  }
  return { total, complete };
}

/* ── Extract key decisions from minutes ── */
function extractDecisions(minutes) {
  if (!minutes) return null;
  const lines = minutes.split("\n");
  const decisions = [];
  let inDecisionBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // Check for decision header
    if (lower.match(/^(key\s+)?decision/i) || lower.match(/^resolved/i)) {
      inDecisionBlock = true;
      // If the header line itself has content after ":", capture it
      const afterColon = trimmed.split(":").slice(1).join(":").trim();
      if (afterColon) decisions.push(afterColon);
      continue;
    }

    // If we're in a decision block, capture bullet/numbered items
    if (inDecisionBlock && trimmed.match(/^[-*\d.]+\s/)) {
      decisions.push(trimmed.replace(/^[-*\d.]+\s*/, ""));
    } else if (inDecisionBlock && trimmed === "") {
      inDecisionBlock = false;
    }
  }

  return decisions.length > 0 ? decisions.slice(0, 3) : null;
}

/* ── Small progress bar component ── */
function MiniProgress({ complete, total, color }) {
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 600,
          color: pct === 100 ? "var(--status-success)" : "var(--text-secondary)",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
      >
        {complete}/{total} Actions
      </div>
      <div
        style={{
          flex: 1,
          height: "3px",
          background: "rgba(255,255,255,0.07)",
          borderRadius: "2px",
          overflow: "hidden",
          minWidth: "40px",
          maxWidth: "80px",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: "2px",
            background:
              pct === 100
                ? "var(--status-success)"
                : pct > 50
                  ? color || "var(--accent)"
                  : "var(--status-warning)",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

export default function MeetingList({ meetings, onEdit, onDelete, onFilterType }) {
  if (meetings.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: "48px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: "4px",
          }}
        >
          No meetings match filters
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "11px",
            color: "var(--text-muted)",
          }}
        >
          Try adjusting your type or status filters above.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {meetings.map((meeting) => {
        const typeColor = TYPE_COLORS[meeting.meeting_type] || "var(--text-muted)";
        const statusColor = STATUS_COLORS[meeting.status] || "var(--text-muted)";
        const actionItems = parseActionItems(meeting.minutes);
        const decisions = extractDecisions(meeting.minutes);
        const isInProgress = meeting.status === "In Progress";

        return (
          <div
            key={meeting.id}
            style={{
              background: "var(--bg-surface)",
              border: isInProgress
                ? "1px solid var(--warning-border)"
                : "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              padding: "16px 18px",
              transition: "all 0.15s ease",
              boxShadow: isInProgress
                ? "0 0 12px rgba(245,158,11,0.08)"
                : "var(--shadow-card)",
              cursor: "pointer",
            }}
            onClick={() => onEdit && onEdit(meeting)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-border)";
              e.currentTarget.style.background = "var(--hover-bg)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isInProgress
                ? "rgba(245,158,11,0.30)"
                : "var(--border-default)";
              e.currentTarget.style.background = "var(--bg-surface)";
              e.currentTarget.style.boxShadow = isInProgress
                ? "0 0 12px rgba(245,158,11,0.08)"
                : "var(--shadow-card)";
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "10px",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: "3px",
                    lineHeight: 1.3,
                  }}
                >
                  {meeting.title}
                </div>
                {meeting.meeting_number && (
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      color: "var(--text-muted)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {meeting.meeting_number}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0, marginLeft: "12px" }}>
                {/* Type Badge - clickable filter */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onFilterType) onFilterType(meeting.meeting_type);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 10px",
                    background: `${typeColor}15`,
                    border: `1px solid ${typeColor}35`,
                    borderRadius: "var(--radius-badge)",
                    cursor: "pointer",
                    minHeight: "24px",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${typeColor}25`;
                    e.currentTarget.style.borderColor = `${typeColor}60`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `${typeColor}15`;
                    e.currentTarget.style.borderColor = `${typeColor}35`;
                  }}
                  title={`Filter by ${meeting.meeting_type}`}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: typeColor,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {meeting.meeting_type}
                  </span>
                </button>

                {/* Status Badge */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 10px",
                    background: `${statusColor}15`,
                    border: `1px solid ${statusColor}35`,
                    borderRadius: "var(--radius-badge)",
                    minHeight: "24px",
                    animation: isInProgress ? "gentlePulse 2s ease-in-out infinite" : "none",
                  }}
                >
                  {isInProgress && (
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: statusColor,
                        marginRight: "6px",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: statusColor,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {meeting.status}
                  </span>
                </div>

                {/* Delete button */}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(meeting);
                    }}
                    title="Delete meeting"
                    style={{
                      background: "transparent",
                      border: "1px solid transparent",
                      borderRadius: "var(--radius-btn)",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "4px 6px",
                      fontSize: "13px",
                      lineHeight: 1,
                      minHeight: "28px",
                      minWidth: "28px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--status-error)";
                      e.currentTarget.style.borderColor = "var(--danger-border)";
                      e.currentTarget.style.background = "var(--danger-muted)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--text-muted)";
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {"\u2715"}
                  </button>
                )}
              </div>
            </div>

            {/* Details row */}
            <div
              style={{
                display: "flex",
                gap: "24px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {/* Date */}
              <div style={{ minWidth: "90px" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    color: "var(--text-muted)",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    marginBottom: "3px",
                  }}
                >
                  Date
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {new Date(meeting.meeting_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>

              {/* Location */}
              {meeting.location && (
                <div style={{ minWidth: "80px" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "3px",
                    }}
                  >
                    Location
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {meeting.location}
                  </div>
                </div>
              )}

              {/* Attendees */}
              {meeting.attendees && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "3px",
                    }}
                  >
                    Attendees
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {meeting.attendees.split(",").length} people
                  </div>
                </div>
              )}

              {/* Action Items counter */}
              {actionItems.total > 0 && (
                <div style={{ marginLeft: "auto" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "3px",
                    }}
                  >
                    Action Items
                  </div>
                  <MiniProgress
                    complete={actionItems.complete}
                    total={actionItems.total}
                    color={typeColor}
                  />
                </div>
              )}
            </div>

            {/* Key Decisions preview */}
            {decisions && (
              <div
                style={{
                  marginTop: "10px",
                  paddingTop: "10px",
                  borderTop: "1px solid var(--divider)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    fontWeight: 700,
                    color: "var(--accent)",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    marginBottom: "6px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      flexShrink: 0,
                    }}
                  />
                  Key Decisions
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {decisions.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                        paddingLeft: "10px",
                        borderLeft: "2px solid var(--accent-border)",
                      }}
                    >
                      {d.length > 120 ? d.substring(0, 120) + "..." : d}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Minutes preview (fallback when no structured decisions) */}
            {!decisions && meeting.minutes && (
              <div
                style={{
                  marginTop: "10px",
                  paddingTop: "10px",
                  borderTop: "1px solid var(--divider)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    marginBottom: "5px",
                  }}
                >
                  Minutes Preview
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {meeting.minutes.substring(0, 180)}
                  {meeting.minutes.length > 180 ? "..." : ""}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
