import type { ReactNode } from "react";

export type OperationalTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface OperationalMetric {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: OperationalTone;
}

export interface OperationalSummaryProps {
  metrics: OperationalMetric[];
  ariaLabel?: string;
}

export function OperationalSummary({ metrics, ariaLabel = "Operational summary" }: OperationalSummaryProps) {
  return (
    <section className="sbp-operational-summary" aria-label={ariaLabel}>
      {metrics.map((metric) => {
        const tone = metric.tone ?? "neutral";
        return (
          <div className={`sbp-operational-summary__metric is-${tone}`} key={metric.label}>
            <div className="sbp-operational-summary__label">{metric.label}</div>
            <div className="sbp-operational-summary__value">{metric.value}</div>
            {metric.sublabel ? <div className="sbp-operational-summary__sub">{metric.sublabel}</div> : null}
          </div>
        );
      })}
    </section>
  );
}
