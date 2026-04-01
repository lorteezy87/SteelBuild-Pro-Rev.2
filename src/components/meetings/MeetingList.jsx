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

export default function MeetingList({ meetings }) {
  if (meetings.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          No meetings
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {meetings.map((meeting) => (
        <div
          key={meeting.id}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "12px",
            padding: "16px",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.background = "var(--hover-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.background = "var(--bg-surface)";
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "8px",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "4px",
                }}
              >
                {meeting.title}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                }}
              >
                {meeting.meeting_number}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {/* Type Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  background: `${TYPE_COLORS[meeting.meeting_type]}20`,
                  border: `1px solid ${TYPE_COLORS[meeting.meeting_type]}40`,
                  borderRadius: "6px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    fontWeight: 600,
                    color: TYPE_COLORS[meeting.meeting_type],
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {meeting.meeting_type}
                </span>
              </div>

              {/* Status Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  background: `${STATUS_COLORS[meeting.status]}20`,
                  border: `1px solid ${STATUS_COLORS[meeting.status]}40`,
                  borderRadius: "6px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    fontWeight: 600,
                    color: STATUS_COLORS[meeting.status],
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {meeting.status}
                </span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: "24px",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "4px",
                }}
              >
                Date
              </div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                {new Date(meeting.meeting_date).toLocaleDateString()}
              </div>
            </div>

            {meeting.location && (
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: "var(--text-muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: "4px",
                  }}
                >
                  Location
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {meeting.location}
                </div>
              </div>
            )}

            {meeting.attendees && (
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: "var(--text-muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: "4px",
                  }}
                >
                  Attendees
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {meeting.attendees.split(",").length} people
                </div>
              </div>
            )}
          </div>

          {/* Minutes */}
          {meeting.minutes && (
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--divider)" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  marginBottom: "6px",
                }}
              >
                Minutes
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {meeting.minutes.substring(0, 200)}
                {meeting.minutes.length > 200 ? "..." : ""}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}