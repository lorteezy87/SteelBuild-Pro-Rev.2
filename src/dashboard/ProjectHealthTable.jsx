import React from "react";
import { formatPercent } from "@/components/shared/formatters";

const HEALTH_COLORS = {
  "On Track": "var(--status-success)",
  Watch: "var(--status-warning)",
  "At Risk": "var(--status-error)",
};

export default function ProjectHealthTable({ projects, workPackages, rfis }) {
  const projectData = projects
    .filter((p) => p.phase !== "Closeout")
    .map((p) => {
      const pWps = workPackages.filter((w) => w.project_id === p.id);
      const progress = pWps.length
        ? pWps.reduce((sum, w) => sum + (w.percent_complete || 0), 0) / pWps.length
        : 0;
      const pRfis = rfis.filter((r) => r.project_id === p.id && r.status !== "Closed");
      return {
        ...p,
        progress: Math.round(progress),
        openRfis: pRfis.length,
      };
    });

  if (projectData.length === 0) {
    return (
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        padding: "40px",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}>
          No active projects
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "12px",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--divider)",
        display: "grid",
        gridTemplateColumns: "1fr 1fr 80px 80px 80px",
        gap: "12px",
        alignItems: "center",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}>
          Project
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}>
          Status
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          textAlign: "right",
        }}>
          Progress
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          textAlign: "right",
        }}>
          Open RFIs
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          textAlign: "right",
        }}>
          Health
        </div>
      </div>

      {/* Rows */}
      {projectData.map((p) => (
        <div
          key={p.id}
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--divider)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 80px 80px 80px",
            gap: "12px",
            alignItems: "center",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {/* Project Name */}
          <div>
            <div style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}>
              {p.name}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}>
              {p.project_number}
            </div>
          </div>

          {/* Phase Badge */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            borderRadius: "6px",
            width: "fit-content",
          }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--accent)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              {p.phase}
            </span>
          </div>

          {/* Progress % */}
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--text-primary)",
            textAlign: "right",
          }}>
            {formatPercent(p.progress)}
          </div>

          {/* Open RFIs */}
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: p.openRfis > 0 ? 700 : 400,
            color: p.openRfis > 3 ? "var(--status-warning)" : "var(--text-secondary)",
            textAlign: "right",
          }}>
            {p.openRfis}
          </div>

          {/* Health Indicator */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "6px",
          }}>
            <div style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: HEALTH_COLORS[p.health_status] || "var(--text-muted)",
              boxShadow: `0 0 6px ${HEALTH_COLORS[p.health_status] || "var(--text-muted)"}66`,
            }} />
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              fontWeight: 600,
              color: HEALTH_COLORS[p.health_status] || "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              {p.health_status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}