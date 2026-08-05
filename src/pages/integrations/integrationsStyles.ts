/** Inline page styles extracted from Integrations.jsx */
export const integrationsStyles = `
.integrations-page {
  padding: 24px;
  background: var(--bg);
  color: var(--text-primary);
}

.integrations-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.integrations-top h1 {
  margin: 0 0 8px;
  font-size: 34px;
  line-height: 1.08;
  letter-spacing: 0;
}

.integrations-top p {
  max-width: 780px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}

.integrations-top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.integrations-primary-btn,
.integrations-secondary-btn,
.integrations-link-list button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 7px;
  border: 1px solid var(--border-default);
  padding: 0 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.integrations-primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg-base);
}

.integrations-secondary-btn,
.integrations-link-list button {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.integrations-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.integrations-kpi {
  display: flex;
  gap: 12px;
  min-height: 92px;
  padding: 15px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
}

.integrations-kpi-icon,
.integrations-card-icon,
.integrations-detail-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  background: var(--accent-muted);
  color: var(--accent);
}

.integrations-kpi strong {
  display: block;
  margin-bottom: 3px;
  font-size: 24px;
}

.integrations-kpi span,
.integrations-kpi small,
.integrations-card-top span,
.integrations-card-footer,
.integrations-detail-header span,
.integrations-roadmap-item span {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.integrations-kpi small {
  margin-top: 6px;
  line-height: 1.35;
}

.integrations-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
  gap: 16px;
}

.integrations-panel {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  padding: 18px;
  min-width: 0;
}

.integrations-wide {
  grid-column: 1 / -1;
}

.integrations-panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.integrations-panel-heading h2,
.integrations-detail-header h2 {
  margin: 0 0 4px;
  font-size: 18px;
  letter-spacing: 0;
}

.integrations-panel-heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.integrations-filters {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(118px, 140px) minmax(118px, 150px);
  gap: 10px;
  margin-bottom: 12px;
}

.integrations-search,
.integrations-select {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-default);
  border-radius: 7px;
  background: var(--bg-surface-high);
  color: var(--text-secondary);
  min-height: 38px;
  padding: 0 10px;
}

.integrations-select {
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 2px;
  padding: 5px 10px;
}

.integrations-select span {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.integrations-search input,
.integrations-select select {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
}

.integrations-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.integrations-card {
  min-height: 210px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  padding: 14px;
  text-align: left;
  cursor: pointer;
}

.integrations-card.is-selected {
  border-color: var(--integration-accent);
  box-shadow: inset 0 0 0 1px var(--integration-accent);
}

.integrations-card-top {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.integrations-card-icon {
  background: var(--integration-accent-bg);
  color: var(--integration-accent);
}

.integrations-card strong {
  font-size: 16px;
}

.integrations-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.integrations-card-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.integrations-card-footer span,
.integrations-status-row span {
  border: 1px solid var(--integration-accent-border, var(--detail-border));
  color: var(--integration-accent, var(--detail-accent));
  background: var(--integration-accent-bg, var(--detail-bg));
  border-radius: 999px;
  padding: 5px 8px;
}

.integrations-detail-panel {
  border-color: var(--detail-border);
}

.integrations-detail-header {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.integrations-detail-icon {
  background: var(--detail-bg);
  color: var(--detail-accent);
}

.integrations-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-default);
}

.integrations-status-row strong {
  color: var(--text-secondary);
  font-size: 12px;
}

.integrations-detail-section {
  margin-top: 16px;
}

.integrations-detail-section h3 {
  margin: 0 0 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.integrations-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.integrations-chip-list span {
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--bg-surface-high);
  color: var(--text-secondary);
  padding: 6px 9px;
  font-size: 12px;
}

.integrations-bullet-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.integrations-bullet-list li + li {
  margin-top: 6px;
}

.integrations-roadmap {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.integrations-roadmap-item {
  display: flex;
  gap: 12px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  padding: 14px;
}

.integrations-roadmap-index {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 7px;
  background: var(--accent);
  color: var(--bg-base);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 800;
}

.integrations-roadmap-item strong {
  display: block;
  margin: 5px 0 7px;
}

.integrations-roadmap-item p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.integrations-rule-grid,
.integrations-contract-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.integrations-rule-grid div,
.integrations-contract-grid div {
  min-height: 120px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  padding: 14px;
}

.integrations-rule-grid svg,
.integrations-contract-grid svg {
  color: var(--accent);
  margin-bottom: 10px;
}

.integrations-rule-grid strong,
.integrations-contract-grid strong {
  display: block;
  margin-bottom: 7px;
}

.integrations-rule-grid span,
.integrations-contract-grid span {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.integrations-link-list {
  display: grid;
  gap: 8px;
}

.integrations-link-list button {
  width: 100%;
  justify-content: space-between;
}

/* Footer/risk badge must never truncate ("High risk" -> "Hig") on narrow cards. */
.integrations-card-footer {
  flex-wrap: wrap;
  gap: 6px;
}

.integrations-card-footer small,
.integrations-status-row strong {
  white-space: nowrap;
}

/* Customer-facing readiness summary + per-provider status rows. */
.integrations-customer-summary {
  margin: 0 0 16px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.integrations-provider-list {
  display: grid;
  gap: 7px;
}

.integrations-provider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
}

.integrations-provider-name {
  color: var(--text-primary);
  font-size: 13px;
  min-width: 0;
}

.integrations-provider-status {
  flex: 0 0 auto;
  white-space: nowrap;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  padding: 3px 9px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

@media (max-width: 1180px) {
  .integrations-kpis,
  .integrations-layout,
  .integrations-roadmap {
    grid-template-columns: 1fr 1fr;
  }

  .integrations-wide {
    grid-column: 1 / -1;
  }
}

@media (max-width: 820px) {
  .integrations-page {
    padding: 16px;
  }

  .integrations-top,
  .integrations-top-actions {
    flex-direction: column;
  }

  .integrations-primary-btn,
  .integrations-secondary-btn {
    width: 100%;
  }

  .integrations-kpis,
  .integrations-layout,
  .integrations-filters,
  .integrations-card-grid,
  .integrations-roadmap,
  .integrations-rule-grid,
  .integrations-contract-grid {
    grid-template-columns: 1fr;
  }
}
`;
