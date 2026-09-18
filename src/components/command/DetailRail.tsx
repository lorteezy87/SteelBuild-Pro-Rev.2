import type { ReactNode } from "react";
import type { StatusBadgeTone } from "./StatusBadge";

export interface DetailRailSection {
  key: string;
  label: ReactNode;
  value: ReactNode;
  tone?: StatusBadgeTone;
  detail?: ReactNode;
}

export interface DetailRailProps {
  title?: string;
  sections: DetailRailSection[];
  actions?: ReactNode;
  ariaLabel?: string;
}

export function DetailRail({
  title = "Operational details",
  sections,
  actions,
  ariaLabel,
}: DetailRailProps) {
  const accessibleName = ariaLabel ?? title;
  return (
    <aside className="sbp-work-panel" aria-label={accessibleName}>
      <div className="sbp-work-panel__head">
        <h2>{title}</h2>
      </div>
      <div className="sbp-work-panel__body" style={{ display: "grid", gap: 10 }}>
        {sections.map((section) => (
          <div key={section.key} style={{ display: "grid", gap: 3 }}>
            <div className="cmd-row__meta">{section.label}</div>
            <div data-tone={section.tone ?? "neutral"} style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              {section.value}
            </div>
            {section.detail ? <div className="cmd-row__meta">{section.detail}</div> : null}
          </div>
        ))}
        {actions ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
            {actions}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
