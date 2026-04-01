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

const formatDate = (value) => {
  if (!value) return "TBD";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function MeetingList({ meetings, onEdit, onDelete }) {
  if (meetings.length === 0) {
    return (
      <div className="sbp-panel" style={{ padding: 36, textAlign: "center" }}>
        <div className="section-divider" style={{ justifyContent: "center", marginBottom: 10 }}>
          <div className="section-divider-title">No Meetings</div>
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)" }}>
          No meetings match the current filters.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {meetings.map((meeting) => {
        const typeColor = TYPE_COLORS[meeting.meeting_type] || "var(--text-muted)";
        const statusColor = STATUS_COLORS[meeting.status] || "var(--text-muted)";
        const attendeeList = String(meeting.attendees || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

        return (
          <div key={meeting.id} className="sbp-panel" style={{ overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 0.9fr)",
                gap: 0,
              }}
            >
              <div style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1 }}>
                      {meeting.title || "Untitled Meeting"}
                    </div>
                    <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                      {meeting.meeting_number || "MEETING"} | {formatDate(meeting.meeting_date)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span className="badge" style={{ background: `${typeColor}20`, border: `1px solid ${typeColor}40`, color: typeColor }}>
                      {meeting.meeting_type || "Other"}
                    </span>
                    <span className="badge" style={{ background: `${statusColor}20`, border: `1px solid ${statusColor}40`, color: statusColor }}>
                      {meeting.status || "Scheduled"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                  <Metric label="Location" value={meeting.location || "Not set"} />
                  <Metric label="Attendees" value={attendeeList.length ? `${attendeeList.length} people` : "None listed"} />
                  <Metric label="Next Meeting" value={meeting.next_meeting_date ? formatDate(meeting.next_meeting_date) : "Not scheduled"} />
                </div>

                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                  <div className="section-divider" style={{ marginBottom: 10 }}>
                    <div className="section-divider-title">Minutes</div>
                    <div className="section-divider-line" />
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                    {meeting.minutes?.trim()
                      ? meeting.minutes.length > 320
                        ? `${meeting.minutes.slice(0, 320)}...`
                        : meeting.minutes
                      : "No minutes captured yet."}
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: "var(--bg-surface-mid)",
                  borderLeft: "1px solid var(--divider)",
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div>
                  <div className="section-divider-title" style={{ marginBottom: 10 }}>Attendance Roster</div>
                  {attendeeList.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {attendeeList.slice(0, 8).map((person) => (
                        <span key={person} className="badge badge-neutral">
                          {person}
                        </span>
                      ))}
                      {attendeeList.length > 8 && (
                        <span className="badge badge-neutral">+{attendeeList.length - 8} more</span>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
                      No attendees listed.
                    </div>
                  )}
                </div>

                <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
                  <button className="btn-ghost" style={{ flex: 1, padding: "8px 12px" }} onClick={() => onEdit?.(meeting)}>
                    Edit
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ flex: 1, padding: "8px 12px", color: "var(--danger)", borderColor: "var(--danger-border)" }}
                    onClick={() => onDelete?.(meeting)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={{ padding: "10px 12px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", background: "var(--bg-surface-low)" }}>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
