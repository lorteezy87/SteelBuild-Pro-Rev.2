import React from "react";

/**
 * Visual chevron-shaped stage pipeline.
 * @param {Array<{key: string, label: string, color: string, count?: number}>} stages
 * @param {string} currentStage  Key of the current/active stage
 * @param {string[]} completedStages  Keys of completed stages
 * @param {number} height  Height in px (default 32)
 * @param {function} onStageClick  Optional callback when a stage is clicked
 */
export default function ChevronPipeline({
  stages = [],
  currentStage,
  completedStages = [],
  height = 32,
  onStageClick,
}) {
  const completedSet = new Set(completedStages);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height,
        borderRadius: "var(--radius-badge)",
        overflow: "hidden",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      {stages.map((stage, i) => {
        const isCompleted = completedSet.has(stage.key);
        const isCurrent = stage.key === currentStage;
        const isActive = isCompleted || isCurrent;
        const opacity = isActive ? 1 : 0.3;
        const bg = isActive ? stage.color : "rgba(255,255,255,0.04)";
        const textColor = isActive ? "#fff" : "var(--text-muted)";

        return (
          <div
            key={stage.key}
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
              transition: "opacity 0.2s, background 0.2s",
              // Chevron clip-path: all except first have notch on left, all except last have arrow on right
              clipPath:
                i === 0 && i === stages.length - 1
                  ? "none"
                  : i === 0
                  ? "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)"
                  : i === stages.length - 1
                  ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)"
                  : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)",
              paddingLeft: i > 0 ? 12 : 4,
              paddingRight: i < stages.length - 1 ? 12 : 4,
            }}
            title={stage.count != null ? `${stage.label}: ${stage.count}` : stage.label}
          >
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
              }}
            >
              {stage.label}
            </span>
            {stage.count != null && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: height < 28 ? 7 : 9,
                  fontWeight: 800,
                  color: textColor,
                  opacity: 0.85,
                }}
              >
                {stage.count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
