import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatCurrency, formatPercent } from "@/components/shared/formatters";
import { CommandBar } from "@/components/design-system";
import { ArrowLeft } from "lucide-react";
import ProjectHandoffChecklist from "@/components/projects/ProjectHandoffChecklist";
import ProjectKickoffChecklist, { KickoffPill } from "@/components/projects/ProjectKickoffChecklist";

const HEALTH_COLORS = {
  "On Track": "var(--status-success)",
  Watch: "var(--status-warning)",
  "At Risk": "var(--status-error)",
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "kickoff", label: "Kickoff" },
  { id: "handoff", label: "Handoff" },
  { id: "schedule", label: "Schedule" },
  { id: "documents", label: "Documents" },
  { id: "rfis", label: "RFIs" },
  { id: "materials", label: "Materials" },
  { id: "tasks", label: "Tasks" },
  { id: "commercial", label: "Commercial" },
];

export default function ProjectDetail() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("id");
  const [activeTab, setActiveTab] = useState("overview");
  const navigate = useNavigate();

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => base44.entities.Project.get(projectId),
    enabled: !!projectId,
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () =>
      base44.entities.WorkPackage.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => base44.entities.RFI.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries", projectId],
    queryFn: () =>
      base44.entities.Delivery.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  if (!project) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: "var(--text-muted)",
        }}
      >
        Loading project...
      </div>
    );
  }

  const progress =
    workPackages.length > 0
      ? (
          (workPackages.filter((w) => w.status === "Complete").length /
            workPackages.length) *
          100
        ).toFixed(0)
      : 0;

  const healthColor = HEALTH_COLORS[project.health_status] || "var(--text-muted)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ marginBottom: -8 }}>
        <button
          onClick={() => navigate(createPageUrl("Projects"))}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: 0,
          }}
        >
          <ArrowLeft size={12} /> Projects
        </button>
      </div>

      <CommandBar
        eyebrow={project.project_number || "PROJECT"}
        title={project.name}
        subtitle={`${project.client || "Client"} · ${project.address || "Location"}`}
      >
        <div style={{ textAlign: "right", marginRight: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
            Progress
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
            {formatPercent(progress)}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
            Health
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            <div
              style={{
                width: 10, height: 10, borderRadius: "50%",
                background: healthColor,
                boxShadow: `0 0 8px ${healthColor}`,
              }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: healthColor, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {project.health_status}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <KickoffPill complete={!!project.kickoff_complete} />
        </div>
      </CommandBar>

      {/* Info Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          marginBottom: "4px",
        }}
      >
        {[
          { label: "Client", value: project.client },
          { label: "GC", value: project.general_contractor },
          { label: "Engineer", value: project.engineer_of_record },
          { label: "PM", value: project.project_manager },
          { label: "Location", value: project.address },
          {
            label: "Contract Value",
            value: formatCurrency(project.original_contract_value),
          },
          { label: "Phase", value: project.phase },
          {
            label: "Target Completion",
            value: project.target_completion_date
              ? new Date(project.target_completion_date).toLocaleDateString()
              : "—",
          },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: "var(--bg-surface-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              padding: "12px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {value || "—"}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div
        style={{
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          gap: "0",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: "none",
              border: "none",
              padding: "12px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 700,
              color:
                activeTab === tab.id
                  ? "var(--accent)"
                  : "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              transition: "color 0.15s",
              borderBottom:
                activeTab === tab.id
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "20px",
          minHeight: "300px",
        }}
      >
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <h3
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: "0 0 8px 0",
                  textTransform: "uppercase",
                  letterSpacing: "0.10em",
                }}
              >
                Work Packages
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: "8px",
                }}
              >
                {workPackages.length > 0 ? (
                  workPackages.map((wp) => (
                    <div
                      key={wp.id}
                      style={{
                        background: "var(--bg-surface-secondary)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "8px",
                        padding: "10px",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          fontWeight: 600,
                          color: "var(--accent)",
                          marginBottom: "4px",
                        }}
                      >
                        {wp.wp_number}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {wp.name}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "8px",
                          color: "var(--text-muted)",
                          marginTop: "4px",
                        }}
                      >
                        {formatPercent(wp.percent_complete)} • {wp.status}
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ color: "var(--text-muted)" }}>
                    No work packages
                  </p>
                )}
              </div>
            </div>

            {project.notes && (
              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: "0 0 8px 0",
                    textTransform: "uppercase",
                    letterSpacing: "0.10em",
                  }}
                >
                  Notes
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {project.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "kickoff" && (
          <ProjectKickoffChecklist project={project} />
        )}

        {activeTab === "handoff" && (
          <ProjectHandoffChecklist projectId={projectId} />
        )}

        {activeTab === "rfis" && (
          <div>
            <h3
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 12px 0",
                textTransform: "uppercase",
                letterSpacing: "0.10em",
              }}
            >
              RFIs ({rfis.length})
            </h3>
            {rfis.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {rfis.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      background: "var(--bg-surface-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "8px",
                      padding: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "start",
                        marginBottom: "4px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          fontWeight: 600,
                          color: "var(--accent)",
                        }}
                      >
                        RFI-{r.rfi_number}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "8px",
                          padding: "2px 6px",
                          background:
                            r.status === "Closed"
                              ? "var(--success-muted)"
                              : "var(--warning-muted)",
                          color:
                            r.status === "Closed"
                              ? "var(--status-success)"
                              : "var(--status-warning)",
                          borderRadius: "4px",
                          fontWeight: 600,
                        }}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {r.title}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>No RFIs</p>
            )}
          </div>
        )}

        {activeTab === "materials" && (
          <div>
            <h3
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 12px 0",
                textTransform: "uppercase",
                letterSpacing: "0.10em",
              }}
            >
              Deliveries ({deliveries.length})
            </h3>
            {deliveries.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {deliveries.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      background: "var(--bg-surface-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "8px",
                      padding: "10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {d.vendor}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          color: "var(--text-muted)",
                          marginTop: "2px",
                        }}
                      >
                        {new Date(d.scheduled_date).toLocaleDateString()}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "8px",
                        padding: "2px 6px",
                        background: "var(--info-muted)",
                        color: "var(--status-info)",
                        borderRadius: "4px",
                        fontWeight: 600,
                      }}
                    >
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>No deliveries</p>
            )}
          </div>
        )}

        {!["overview", "kickoff", "handoff", "rfis", "materials"].includes(activeTab) && (
          <p style={{ color: "var(--text-muted)" }}>
            {tabs.find((t) => t.id === activeTab)?.label} content coming soon.
          </p>
        )}
      </div>
    </div>
  );
}