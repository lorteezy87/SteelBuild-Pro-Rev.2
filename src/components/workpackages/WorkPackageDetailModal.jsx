import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const TAB_COLORS = {
  "Overview": "var(--accent)",
  "Timeline": "var(--status-info)",
  "Crew": "var(--status-success)",
  "Materials": "var(--status-warning)",
};

export default function WorkPackageDetailModal({ wp, onClose }) {
  const [activeTab, setActiveTab] = useState("Overview");

  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks-wp", wp.id],
    queryFn: () =>
      base44.entities.ScheduleTask.filter({
        linked_entity_id: wp.id,
        linked_entity_type: "WorkPackage",
      }),
    initialData: [],
  });

  const shopHoursBudget = wp.shop_hours_budget || 0;
  const shopHoursActual = wp.shop_hours_actual || 0;
  const fieldHoursBudget = wp.field_hours_budget || 0;
  const fieldHoursActual = wp.field_hours_actual || 0;

  const shopHoursVariance = shopHoursBudget - shopHoursActual;
  const fieldHoursVariance = fieldHoursBudget - fieldHoursActual;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "16px",
          maxWidth: "800px",
          width: "90%",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--divider)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "12px",
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.10em",
                }}
              >
                {wp.name}
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  margin: "4px 0 0 0",
                  letterSpacing: "0.08em",
                }}
              >
                {wp.wp_number}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "20px",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* Key Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <MetricBox label="Phase" value={wp.phase} />
            <MetricBox label="Tonnage" value={`${wp.tonnage}T`} />
            <MetricBox label="Complete" value={`${wp.percent_complete || 0}%`} />
            <MetricBox label="Status" value={wp.status} />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--divider)" }}>
          {["Overview", "Timeline", "Crew", "Materials"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "12px",
                background: activeTab === tab ? `${TAB_COLORS[tab]}20` : "transparent",
                border: "none",
                borderBottom: activeTab === tab ? `2px solid ${TAB_COLORS[tab]}` : "1px solid transparent",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                color: activeTab === tab ? TAB_COLORS[tab] : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {activeTab === "Overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Shop Hours */}
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    marginBottom: "8px",
                  }}
                >
                  Shop Hours
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      Budget: <strong>{shopHoursBudget}h</strong>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Actual: <strong>{shopHoursActual}h</strong>
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: shopHoursVariance >= 0 ? "var(--status-success)" : "var(--status-error)",
                        fontWeight: 600,
                      }}
                    >
                      Variance: {shopHoursVariance >= 0 ? "+" : "-"}
                      {Math.abs(shopHoursVariance)}h
                    </div>
                    <div
                      style={{
                        height: "6px",
                        background: "var(--border-default)",
                        borderRadius: "3px",
                        overflow: "hidden",
                        marginTop: "6px",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          background: "var(--accent)",
                          width: `${Math.min(100, (shopHoursActual / shopHoursBudget) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Field Hours */}
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    marginBottom: "8px",
                  }}
                >
                  Field Hours
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      Budget: <strong>{fieldHoursBudget}h</strong>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Actual: <strong>{fieldHoursActual}h</strong>
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: fieldHoursVariance >= 0 ? "var(--status-success)" : "var(--status-error)",
                        fontWeight: 600,
                      }}
                    >
                      Variance: {fieldHoursVariance >= 0 ? "+" : "-"}
                      {Math.abs(fieldHoursVariance)}h
                    </div>
                    <div
                      style={{
                        height: "6px",
                        background: "var(--border-default)",
                        borderRadius: "3px",
                        overflow: "hidden",
                        marginTop: "6px",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          background: "var(--accent)",
                          width: `${Math.min(100, (fieldHoursActual / fieldHoursBudget) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              {wp.notes && (
                <div>
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
                    Notes
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {wp.notes}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "Timeline" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {scheduleTasks.length > 0 ? (
                scheduleTasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "8px",
                      padding: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: "6px",
                      }}
                    >
                      {task.task_name}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        color: "var(--text-muted)",
                        display: "flex",
                        gap: "12px",
                      }}
                    >
                      <span>{new Date(task.start_date).toLocaleDateString()} → {new Date(task.end_date).toLocaleDateString()}</span>
                      <span>{task.duration} days</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  No schedule tasks linked
                </div>
              )}
            </div>
          )}

          {activeTab === "Crew" && (
            <div>
              {wp.crew ? (
                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  <strong>Crew:</strong> {wp.crew}
                </div>
              ) : (
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  No crew assigned
                </div>
              )}
            </div>
          )}

          {activeTab === "Materials" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      marginBottom: "4px",
                    }}
                  >
                    Tonnage
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent)" }}>
                    {wp.tonnage}T
                  </div>
                </div>
                {wp.linked_drawing_ids && (
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "0.08em",
                        marginBottom: "4px",
                      }}
                    >
                      Drawings
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      {wp.linked_drawing_ids.split(",").length} drawings
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8px",
          color: "var(--text-muted)",
          letterSpacing: "0.08em",
          marginBottom: "4px",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}