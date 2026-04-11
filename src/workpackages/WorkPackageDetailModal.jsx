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

  const { data: wpDrawings = [] } = useQuery({
    queryKey: ["drawings-for-wp", wp.project_id],
    queryFn: () => base44.entities.Drawing.filter({ project_id: wp.project_id }),
    enabled: !!wp.project_id,
    initialData: [],
    staleTime: 2 * 60 * 1000,
  });

  const { data: wpDeliveries = [] } = useQuery({
    queryKey: ["deliveries-for-wp", wp.id],
    queryFn: () => base44.entities.Delivery.filter({ work_package_id: wp.id }),
    enabled: !!wp.id,
    initialData: [],
    staleTime: 2 * 60 * 1000,
  });

  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks-wp", wp.id],
    queryFn: () =>
      base44.entities.ScheduleTask.filter({
        linked_entity_id: wp.id,
        linked_entity_type: "WorkPackage",
      }),
    initialData: [],
    staleTime: 2 * 60 * 1000,
  });

  const shopHoursBudget = wp.shop_hours_budget || 0;
  const shopHoursActual = wp.shop_hours_actual || 0;
  const fieldHoursBudget = wp.field_hours_budget || 0;
  const fieldHoursActual = wp.field_hours_actual || 0;

  const shopHoursVariance = shopHoursBudget - shopHoursActual;
  const fieldHoursVariance = fieldHoursBudget - fieldHoursActual;

  const linkedDrawingIds = (wp.linked_drawing_ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const linkedDrawings = wpDrawings.filter((d) => linkedDrawingIds.includes(d.id));
  const APPROVED_STAGES = ["Released", "IFC", "Issued for Construction", "FFF", "BFS", "Approved"];
  const approvedDrawings = linkedDrawings.filter((d) => APPROVED_STAGES.includes(d.stage || d.status));
  const hasApprovedDrawings = linkedDrawings.length > 0 && approvedDrawings.length === linkedDrawings.length;

  const fabComplete =
    wp.status === "Complete" || wp.status === "Fabrication Complete" || (wp.percent_complete || 0) >= 100;
  const deliveryScheduled = wpDeliveries.length > 0;
  const deliveryComplete = wpDeliveries.some((d) => d.status === "Delivered");

  const steps = [
    {
      id: "detailing",
      label: "Detailing",
      icon: "📐",
      status: linkedDrawingIds.length === 0 ? "blocked" : hasApprovedDrawings ? "complete" : "in-progress",
      detail:
        linkedDrawingIds.length === 0
          ? "No drawings linked"
          : hasApprovedDrawings
          ? `${approvedDrawings.length} drawing(s) approved`
          : `${linkedDrawings.length} linked — pending approval`,
      blockedReason: linkedDrawingIds.length === 0 ? "Link drawings to continue" : null,
    },
    {
      id: "fabrication",
      label: "Fabrication",
      icon: "🔩",
      status: !hasApprovedDrawings
        ? "locked"
        : fabComplete
        ? "complete"
        : ["In Progress", "Fabricating"].includes(wp.status)
        ? "in-progress"
        : "pending",
      detail: !hasApprovedDrawings
        ? "Awaiting drawing approval"
        : fabComplete
        ? "100% complete"
        : `${wp.percent_complete || 0}% complete`,
      blocked: !hasApprovedDrawings,
      blockedReason: !hasApprovedDrawings ? "Cannot fabricate without approved drawings" : null,
    },
    {
      id: "delivery",
      label: "Delivery",
      icon: "🚛",
      status: deliveryComplete ? "complete" : deliveryScheduled ? "in-progress" : "pending",
      detail: deliveryComplete
        ? "Delivered"
        : deliveryScheduled
        ? `${wpDeliveries.length} delivery scheduled`
        : "Not scheduled",
      note: !fabComplete ? "Can be scheduled now — delivery requires fab complete" : null,
    },
    {
      id: "erection",
      label: "Erection",
      icon: "🏗",
      status: !deliveryComplete
        ? "locked"
        : wp.phase === "Erection" ||
          wp.status?.toLowerCase()?.includes("erect") ||
          wp.status?.toLowerCase()?.includes("install")
        ? "in-progress"
        : "pending",
      detail: !deliveryComplete ? "Awaiting delivery" : "Ready to begin",
      blocked: !deliveryComplete,
      blockedReason: !deliveryComplete ? "Cannot erect until material is delivered" : null,
      note: !deliveryComplete && deliveryScheduled ? "Resources can be scheduled in advance" : null,
    },
  ];

  const statusStyles = {
    complete: {
      bg: "var(--success-muted)",
      border: "1px solid var(--success-border)",
      color: "var(--status-success)",
    },
    "in-progress": {
      bg: "var(--accent-muted)",
      border: "1px solid var(--accent-border)",
      color: "var(--accent)",
    },
    locked: {
      bg: "rgba(255,180,171,0.10)",
      border: "1px dashed var(--danger-border)",
      color: "var(--status-error)",
    },
    blocked: {
      bg: "var(--warning-muted)",
      border: "1px solid var(--warning-border)",
      color: "var(--status-warning)",
    },
    pending: {
      bg: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      color: "var(--text-secondary)",
    },
  };

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

        {/* Workflow Pipeline */}
        <div style={{ padding: "14px 24px 10px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Workflow Status
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, alignItems: "center" }}>
            {steps.map((step, idx) => {
              const style = statusStyles[step.status] || statusStyles.pending;
              return (
                <div key={step.id} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                  <div
                    style={{
                      width: 72,
                      height: 48,
                      background: style.bg,
                      border: style.border,
                      color: style.color,
                      borderRadius: 6,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      textAlign: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      padding: 6,
                      opacity: step.status === "locked" ? 0.5 : 1,
                    }}
                    title={step.blockedReason || ""}
                  >
                    <div style={{ fontSize: 12, marginBottom: 2 }}>{step.icon}</div>
                    <div style={{ fontWeight: 700, letterSpacing: "0.08em" }}>{step.label}</div>
                    {step.status === "in-progress" && (
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: style.color, marginTop: 4, boxShadow: `0 0 6px ${style.color}` }} />
                    )}
                    {step.status === "locked" && (
                      <div style={{ position: "absolute", top: 4, right: 4, fontSize: 10 }}>🔒</div>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)", textAlign: "center" }}>
                    {step.detail}
                  </div>
                  {step.blockedReason && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-error)", textAlign: "center" }}>
                      ⊘ {step.blockedReason}
                    </div>
                  )}
                  {step.note && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-warning)", textAlign: "center" }}>
                      ⓘ {step.note}
                    </div>
                  )}
                  {idx < steps.length - 1 && (
                    <div style={{ height: 2, background: step.status === "complete" ? "var(--status-success)" : "var(--divider)", width: "60%", marginTop: -6 }} />
                  )}
                </div>
              );
            })}
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
