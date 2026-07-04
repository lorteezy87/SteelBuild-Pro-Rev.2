// Phase-filter KPI tile row for the Schedule page. Extracted verbatim from
// Schedule.tsx, where it was byte-identical in both the command_ui and the
// legacy return paths. One click-to-filter tile per lifecycle phase, plus an
// "ALL PHASES" tile.
import type { ComponentType, PropsWithChildren } from "react";
import { PHASES } from "@/utils/phases";
import { KpiTile as KpiTileRaw } from "@/components/design-system";

type AnyProps = PropsWithChildren<Record<string, unknown>>;
const KpiTile = KpiTileRaw as unknown as ComponentType<AnyProps>;

interface PhaseKpiTilesProps {
  phaseCounts: Record<string, number>;
  phaseFilter: string;
  onSetPhaseFilter: (phase: string) => void;
}

export default function PhaseKpiTiles({ phaseCounts, phaseFilter, onSetPhaseFilter }: PhaseKpiTilesProps) {
  return (
    <div style={{ flexShrink: 0, padding: "0 24px 14px" }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border-default) transparent",
        }}
      >
        <div style={{ minWidth: 100, flexShrink: 0 }}>
          <KpiTile
            compact
            label="ALL PHASES"
            value={phaseCounts.all}
            color="var(--text-secondary)"
            active={phaseFilter === "all"}
            onClick={() => onSetPhaseFilter("all")}
          />
        </div>
        {PHASES.map((p) => (
          <div key={p} style={{ minWidth: 100, flexShrink: 0 }}>
            <KpiTile
              compact
              label={p.toUpperCase()}
              value={phaseCounts[p] || 0}
              color="var(--accent)"
              active={phaseFilter === p}
              onClick={() => onSetPhaseFilter(p)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
