import { STAGES, mono } from "./drawingsConfig";
import ChevronPipeline from "@/components/shared/ChevronPipeline";

/**
 * Visual pipeline showing drawing distribution across submittal stages.
 * Wraps ChevronPipeline with stage-count legend buttons.
 *
 * @param {{ drawings: Array, onStageClick?: (key: string) => void, activeStage?: string|null }} props
 */
export default function StagePipeline({ drawings, onStageClick, activeStage }) {
  const released = drawings.filter(d => d.stage === "Released").length;
  const completedStages = [];

  const stageData = STAGES.slice(1).map(s => {
    const count = drawings.filter(d => d.stage === s.key).length;
    return { key: s.key, label: s.label, color: s.color, count };
  });

  // Find the most advanced stage with drawings
  let currentStage = null;
  for (let i = stageData.length - 1; i >= 0; i--) {
    if (stageData[i].count > 0) {
      currentStage = stageData[i].key;
      break;
    }
  }

  // Mark earlier stages as completed if released drawings exist
  if (released > 0) {
    for (const s of stageData) {
      if (s.key === "Released") break;
      completedStages.push(s.key);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ChevronPipeline
        stages={stageData}
        currentStage={activeStage || currentStage}
        completedStages={completedStages}
        height={36}
        onStageClick={onStageClick}
      />
      {/* Legend row with counts */}
      <div style={{ display: "flex", gap: 4, justifyContent: "space-around" }}>
        {stageData.map(s => (
          <button
            key={s.key}
            onClick={() => onStageClick?.(s.key)}
            style={{
              background: activeStage === s.key ? `${s.color}20` : "none",
              border: activeStage === s.key ? `1px solid ${s.color}40` : "1px solid transparent",
              borderRadius: "var(--radius-badge)",
              padding: "2px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: s.color }}>{s.label}</span>
            <span style={{ ...mono, fontSize: 10, fontWeight: 800, color: s.count > 0 ? s.color : "var(--text-disabled)" }}>{s.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
