import React from "react";

/* ── Keyframes injected once ────────────────────────────────────────────────── */
let styleInjected = false;
function injectKeyframes() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const sheet = document.createElement("style");
  sheet.textContent = `
    @keyframes chevron-pulse-border {
      0%, 100% { box-shadow: inset 0 0 0 1.5px var(--_pulse-color, var(--status-error)), 0 0 4px 0 var(--_pulse-color, var(--status-error)); }
      50%      { box-shadow: inset 0 0 0 2px   var(--_pulse-color, var(--status-error)), 0 0 8px 2px var(--_pulse-color, var(--status-error)); }
    }
    @keyframes chevron-active-glow {
      0%, 100% { box-shadow: 0 0 4px 0 var(--_glow-color, var(--accent)); }
      50%      { box-shadow: 0 0 8px 1px var(--_glow-color, var(--accent)); }
    }
  `;
  document.head.appendChild(sheet);
}

/* ── Status-to-color helpers ────────────────────────────────────────────────── */
const STATUS_COLORS = {
  complete:  "var(--status-success)",
  active:    "var(--accent, #3b82f6)",
  "at-risk": "var(--status-warning)",
  blocked:   "var(--status-error)",
  upcoming:  "var(--hover-bg)",
};

function statusBg(status, fallback) {
  if (!status) return fallback;
  if (status === "complete")  return "var(--status-success)";
  if (status === "active")    return "var(--accent, #3b82f6)";
  if (status === "at-risk")   return "var(--status-warning)";
  if (status === "blocked")   return "var(--status-error)";
  /* upcoming */              return "var(--hover-bg)";
}

function statusTextColor(status, fallback) {
  if (!status) return fallback;
  if (status === "upcoming") return "var(--text-muted)";
  return "#fff";
}

/**
 * Visual chevron-shaped stage pipeline.
 *
 * Each stage object may optionally carry:
 *   status:   "complete" | "active" | "at-risk" | "blocked" | "upcoming"
 *   progress: 0-100
 *
 * When neither is provided the component falls back to its original
 * currentStage / completedStages colouring logic.
 *
 * @param {Array<{key: string, label: string, color: string, count?: number, status?: string, progress?: number}>} stages
 * @param {string}   currentStage     Key of the current/active stage
 * @param {string[]} completedStages  Keys of completed stages
 * @param {number}   height           Height in px (default 32)
 * @param {function} onStageClick     Optional callback when a stage is clicked
 */
export default function ChevronPipeline({
  stages = [],
  currentStage,
  completedStages = [],
  height = 32,
  onStageClick,
}) {
  injectKeyframes();

  const completedSet = new Set(completedStages);

  /* ── Determine whether any stage carries the new status prop ─────────────── */
  const hasStatusData = stages.some((s) => s.status != null);

  /* ── Identify bottleneck (lowest progress among non-complete / non-upcoming) */
  let bottleneckKey = null;
  if (hasStatusData) {
    let lowestProgress = Infinity;
    for (const s of stages) {
      if (!s.status || s.status === "complete" || s.status === "upcoming") continue;
      const p = typeof s.progress === "number" ? s.progress : 50; // default mid if not given
      if (p < lowestProgress) {
        lowestProgress = p;
        bottleneckKey = s.key;
      }
    }
  }

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height,
        borderRadius: "var(--radius-badge)",
        overflow: "visible",          // allow glow / label to leak
        background: "var(--hover-bg)",
        position: "relative",
      }}
    >
      {stages.map((stage, i) => {
        /* ── Legacy logic (when no status data) ──────────────────────────── */
        const isCompleted = completedSet.has(stage.key);
        const isCurrent = stage.key === currentStage;
        const legacyActive = isCompleted || isCurrent;

        /* ── New status-aware logic ──────────────────────────────────────── */
        const status = hasStatusData ? (stage.status || null) : null;
        const progress = hasStatusData && typeof stage.progress === "number" ? stage.progress : null;
        const isBottleneck = stage.key === bottleneckKey;

        /* ── Compute visual props ────────────────────────────────────────── */
        let bg, textColor, opacity, boxShadow, animation;

        if (status) {
          bg = statusBg(status);
          textColor = statusTextColor(status);
          opacity = status === "complete" ? 0.6 : status === "upcoming" ? 0.35 : 1;
          boxShadow = "none";
          animation = "none";

          if (status === "active") {
            animation = "chevron-active-glow 2s ease-in-out infinite";
          }
          if (status === "at-risk") {
            boxShadow = "inset 0 0 0 1.5px var(--status-warning), 0 0 6px 0 var(--status-warning)";
          }
          if (status === "blocked") {
            boxShadow = "inset 0 0 0 1.5px var(--status-error), 0 0 6px 0 var(--status-error)";
          }
          if (isBottleneck) {
            animation = "chevron-pulse-border 1.8s ease-in-out infinite";
          }
        } else {
          /* Legacy path */
          bg = legacyActive ? stage.color : "var(--hover-bg)";
          textColor = legacyActive ? "#fff" : "var(--text-muted)";
          opacity = legacyActive ? 1 : 0.3;
          boxShadow = "none";
          animation = "none";
        }

        /* ── Connector color: green when preceding step is complete ─────── */
        // (applied via a small pseudo-element-like overlay on the left notch area)
        const prevComplete =
          i > 0 && hasStatusData && stages[i - 1].status === "complete";

        /* ── Clip-path ───────────────────────────────────────────────────── */
        const clipPath =
          i === 0 && i === stages.length - 1
            ? "none"
            : i === 0
            ? "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)"
            : i === stages.length - 1
            ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)"
            : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)";

        /* ── Progress fill color ─────────────────────────────────────────── */
        const progressColor = status ? (STATUS_COLORS[status] || "var(--accent)") : stage.color;

        return (
          <div
            key={stage.key}
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* ── Green connector overlay when previous step is complete ── */}
            {prevComplete && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 9,
                  height: "100%",
                  background: "var(--status-success)",
                  clipPath: "polygon(0 0, 8px 0, 0px 50%, 8px 100%, 0 100%)",
                  zIndex: 1,
                  opacity: 0.7,
                  pointerEvents: "none",
                }}
              />
            )}

            {/* ── Main chevron step ─────────────────────────────────────── */}
            <div
              onClick={() => onStageClick?.(stage.key)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                position: "relative",
                background: bg,
                opacity,
                cursor: onStageClick ? "pointer" : "default",
                transition: "opacity 0.2s, background 0.2s, box-shadow 0.3s",
                clipPath,
                paddingLeft: i > 0 ? 12 : 4,
                paddingRight: i < stages.length - 1 ? 12 : 4,
                boxShadow,
                animation,
                "--_pulse-color": "var(--status-error)",
                "--_glow-color": "var(--accent, #3b82f6)",
              }}
              title={
                stage.count != null
                  ? `${stage.label}: ${stage.count}`
                  : progress != null
                  ? `${stage.label} (${progress}%)`
                  : stage.label
              }
            >
              {/* Checkmark for complete */}
              {status === "complete" && (
                <span
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    fontSize: height < 28 ? 10 : 14,
                    fontWeight: 900,
                    color: "#fff",
                    opacity: 0.7,
                    pointerEvents: "none",
                    zIndex: 2,
                    lineHeight: 1,
                  }}
                >
                  {"\u2713"}
                </span>
              )}

              {/* Label */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: height < 28 ? 7 : 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: textColor,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  zIndex: 1,
                }}
              >
                {stage.label}
              </span>

              {/* Count badge */}
              {stage.count != null && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: height < 28 ? 7 : 9,
                    fontWeight: 800,
                    color: textColor,
                    opacity: 0.85,
                    zIndex: 1,
                  }}
                >
                  {stage.count}
                </span>
              )}

              {/* ── Progress bar (2px at bottom, inside chevron) ──────── */}
              {progress != null && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: "rgba(0,0,0,0.15)",
                    zIndex: 3,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, progress))}%`,
                      height: "100%",
                      background: progressColor,
                      borderRadius: "0 1px 1px 0",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              )}
            </div>

            {/* ── Bottleneck label ────────────────────────────────────── */}
            {isBottleneck && (
              <div
                style={{
                  position: "absolute",
                  bottom: -12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "var(--status-error)",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  zIndex: 4,
                  lineHeight: 1,
                }}
              >
                BOTTLENECK
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
