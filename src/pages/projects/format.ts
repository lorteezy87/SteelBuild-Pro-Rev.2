/** Phase + health display tokens for project cards and list views. */

export interface PhaseStyle {
  color: string;
  bg: string;
  order: number;
}

export interface HealthStyle {
  color: string;
  dot: string;
}

export const PHASE_CONFIG: Record<string, PhaseStyle> = {
  "Pre-Construction":      { color: "var(--text-muted)",      bg: "var(--bg-surface-low)", order: 0 },
  "Detailing":             { color: "var(--info)",            bg: "var(--info-muted)",     order: 1 },
  "Procurement":           { color: "var(--warning)",         bg: "var(--warning-muted)",  order: 2 },
  "Fabrication":           { color: "var(--accent)",          bg: "var(--accent-muted)",   order: 3 },
  "Delivery":              { color: "var(--phase-delivery)",  bg: "var(--info-muted)",     order: 4 },
  "Installation":          { color: "var(--phase-erection)",  bg: "var(--success-muted)",  order: 5 },
  "Installation/Erection": { color: "var(--phase-erection)",  bg: "var(--success-muted)",  order: 5 },
  "Erection":              { color: "var(--phase-erection)",  bg: "var(--success-muted)",  order: 5 },
  "Closeout":              { color: "var(--phase-closeout)",  bg: "var(--bg-surface-low)", order: 6 },
};

export const HEALTH_CONFIG: Record<string, HealthStyle> = {
  "On Track": { color: "var(--success)", dot: "var(--success)" },
  "Watch":    { color: "var(--warning)", dot: "var(--warning)" },
  "At Risk":  { color: "var(--danger)",  dot: "var(--danger)" },
};

export function phaseStyle(phase?: string | null): PhaseStyle {
  return PHASE_CONFIG[phase || ""] || PHASE_CONFIG["Detailing"];
}

export function healthStyle(status?: string | null): HealthStyle {
  return HEALTH_CONFIG[status || ""] || HEALTH_CONFIG["On Track"];
}
