import type { ComponentType, ReactNode } from "react";

export type KpiTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface KpiCellDef {
  label: string;
  value: ReactNode;
  sublabel?: string;
  tone?: KpiTone;
  Icon?: ComponentType<{ size?: number | string }>;
}

export function KpiStrip({ cells }: { cells: KpiCellDef[] }) {
  return (
    <div className="cmd-kpi-strip">
      {cells.map((c, i) => (
        <div className={`cmd-kpi cmd-kpi--${c.tone || "neutral"}`} key={i}>
          {c.Icon ? <div className="cmd-kpi__icon"><c.Icon size={18} /></div> : null}
          <div className="cmd-kpi__value">{c.value}</div>
          <div className="cmd-kpi__label">{c.label}</div>
          {c.sublabel ? <div className="cmd-kpi__sub">{c.sublabel}</div> : null}
        </div>
      ))}
    </div>
  );
}
