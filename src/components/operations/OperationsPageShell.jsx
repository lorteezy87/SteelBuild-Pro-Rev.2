import React from "react";

const mono = { fontFamily: "var(--font-mono)" };

const styles = `
.ops-page-shell {
  --ops-panel: color-mix(in srgb, var(--bg-surface) 94%, #111827 6%);
  --ops-panel-soft: color-mix(in srgb, var(--bg-surface-low) 92%, #0f172a 8%);
  --ops-line: color-mix(in srgb, var(--border-default) 82%, transparent);
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  padding: 18px;
  background:
    radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.10), transparent 28rem),
    radial-gradient(circle at 100% 2%, rgba(16, 185, 129, 0.08), transparent 24rem),
    var(--bg-base);
}

.ops-page-shell--full {
  height: calc(100dvh - 36px);
  min-height: 0;
  overflow: hidden;
}

.ops-page-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: stretch;
  padding: 16px;
  border: 1px solid var(--ops-line);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ops-panel) 96%, #1d4ed8 4%), var(--ops-panel));
  box-shadow: 0 18px 42px rgba(0,0,0,0.18);
}

.ops-page-kicker,
.ops-page-meta-label,
.ops-page-metric-label,
.ops-page-metric-sub {
  font-family: var(--font-mono);
  letter-spacing: 0;
  text-transform: uppercase;
}

.ops-page-kicker {
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 850;
}

.ops-page-title {
  margin: 0;
  color: var(--text-primary);
  font-family: Space Grotesk, var(--font-display);
  font-size: clamp(24px, 3.2vw, 38px);
  line-height: 1.05;
  font-weight: 850;
  letter-spacing: 0;
}

.ops-page-subtitle {
  max-width: 860px;
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.55;
}

.ops-page-meta {
  min-width: min(360px, 34vw);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ops-page-meta-card {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--ops-line);
  border-radius: 8px;
  background: var(--ops-panel-soft);
}

.ops-page-meta-label {
  display: block;
  margin-bottom: 5px;
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 850;
}

.ops-page-meta-value {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 900;
}

.ops-page-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.ops-page-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.ops-page-metric {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--ops-line);
  border-radius: 8px;
  background: var(--ops-panel);
  color: inherit;
  text-align: left;
  transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
}

button.ops-page-metric {
  cursor: pointer;
}

button.ops-page-metric:hover,
.ops-page-action:hover {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--ops-line));
}

.ops-page-metric.is-active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent-muted) 66%, var(--ops-panel));
}

.ops-page-metric-label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 850;
}

.ops-page-metric-value {
  display: block;
  color: var(--metric-color, var(--text-primary));
  font-family: Space Grotesk, var(--font-display);
  font-size: 24px;
  line-height: 1;
  font-weight: 850;
  letter-spacing: 0;
}

.ops-page-metric-sub {
  display: block;
  margin-top: 7px;
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 750;
}

.ops-page-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.ops-page-body--full {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ops-page-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 34px;
  padding: 8px 13px;
  border: 1px solid var(--ops-line);
  border-radius: 8px;
  background: var(--ops-panel-soft);
  color: var(--text-secondary);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ops-page-action--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--bg-base);
}

.ops-page-action--danger {
  border-color: rgba(239,68,68,0.42);
  background: rgba(239,68,68,0.12);
  color: var(--status-error);
}

.ops-page-action:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.ops-page-card {
  border: 1px solid var(--ops-line);
  border-radius: 8px;
  background: var(--ops-panel);
}

.ops-filter-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--ops-line);
  border-radius: 8px;
  background: var(--ops-panel);
}

@media (max-width: 920px) {
  .ops-page-shell {
    padding: 12px;
  }

  .ops-page-shell--full {
    height: calc(100dvh - 52px);
  }

  .ops-page-hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .ops-page-meta {
    min-width: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ops-page-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 620px) {
  .ops-page-meta {
    grid-template-columns: minmax(0, 1fr);
  }

  .ops-page-title {
    font-size: 26px;
  }
}
`;

export function OperationsPageShell({
  eyebrow,
  title,
  subtitle,
  meta = [],
  metrics = [],
  actions = null,
  children,
  fullHeight = false,
}) {
  return (
    <div className={`ops-page-shell ${fullHeight ? "ops-page-shell--full" : ""}`}>
      <style>{styles}</style>
      <section className="ops-page-hero">
        <div>
          {eyebrow && <div className="ops-page-kicker">{eyebrow}</div>}
          <h1 className="ops-page-title">{title}</h1>
          {subtitle && <p className="ops-page-subtitle">{subtitle}</p>}
        </div>

        {meta.length > 0 && (
          <div className="ops-page-meta">
            {meta.map((item) => (
              <div key={item.label} className="ops-page-meta-card">
                <span className="ops-page-meta-label">{item.label}</span>
                <span className="ops-page-meta-value" style={{ color: item.color || undefined }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {actions && <div className="ops-page-actions">{actions}</div>}
      </section>

      {metrics.length > 0 && (
        <div className="ops-page-metrics">
          {metrics.map((metric) => {
            const { key, ...metricProps } = metric;
            return <OpsMetric key={key || metric.label} {...metricProps} />;
          })}
        </div>
      )}

      <div className={`ops-page-body ${fullHeight ? "ops-page-body--full" : ""}`}>
        {children}
      </div>
    </div>
  );
}

export function OpsMetric({ label, value, sub, color, active, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`ops-page-metric ${active ? "is-active" : ""}`}
      style={{ "--metric-color": color || undefined }}
    >
      <span className="ops-page-metric-label">{label}</span>
      <span className="ops-page-metric-value">{value}</span>
      {sub && <span className="ops-page-metric-sub">{sub}</span>}
    </Tag>
  );
}

export function OpsActionButton({ variant = "secondary", icon, children, ...props }) {
  return (
    <button
      type="button"
      className={`ops-page-action ${variant === "primary" ? "ops-page-action--primary" : ""} ${variant === "danger" ? "ops-page-action--danger" : ""}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function OpsFilterPanel({ children }) {
  return <div className="ops-filter-panel">{children}</div>;
}

export const opsMono = mono;
