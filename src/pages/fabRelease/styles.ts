export const FAB_RELEASE_STYLES = `
.fab-release-page {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.fab-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 18px;
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--border-default) 86%, white 14%);
  border-radius: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--bg-surface-high) 88%, #0ea5e9 12%), color-mix(in srgb, var(--bg-surface) 90%, #0f766e 10%)),
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent 64%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 42px rgba(0,0,0,0.30);
}

.fab-hero-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.fab-kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}

.fab-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(30px, 4.2vw, 52px);
  line-height: 0.96;
  color: var(--text-primary);
}

.fab-hero p {
  max-width: 720px;
  margin: 13px 0 0;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.55;
}

.fab-hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.fab-hero-grid,
.fab-summary-grid,
.fab-hours-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.fab-hero-metric,
.fab-summary-card,
.fab-stage-summary {
  min-height: 118px;
  border: 1px solid color-mix(in srgb, var(--metric-color, var(--summary-color, var(--stage-color, var(--accent)))) 28%, var(--border-default));
  border-radius: 14px;
  padding: 13px;
  background: linear-gradient(145deg, color-mix(in srgb, var(--metric-color, var(--summary-color, var(--stage-color, var(--accent)))) 9%, var(--bg-surface-high)), var(--bg-surface-low));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px rgba(0,0,0,0.22);
  text-align: left;
}

.fab-hero-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--metric-color) 14%, transparent);
  color: var(--metric-color);
  border: 1px solid color-mix(in srgb, var(--metric-color) 34%, transparent);
}

.fab-metric-label,
.fab-summary-top span,
.fab-stage-summary span,
.fab-section-label,
.fab-metric-sub,
.fab-flow-total,
.fab-toolbar-count {
  font-family: var(--font-mono);
  text-transform: uppercase;
}

.fab-metric-label,
.fab-summary-top span,
.fab-section-label,
.fab-stage-summary span {
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.13em;
  color: var(--text-muted);
}

.fab-metric-value {
  display: block;
  margin-top: 12px;
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
  color: var(--metric-color);
}

.fab-metric-sub,
.fab-summary-card small,
.fab-stage-summary small,
.fab-muted,
.fab-card-drawings,
.fab-lane-head small,
.fab-hour-row small {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.fab-hero-view-toggle {
  position: absolute;
  right: 18px;
  top: 18px;
}

.fab-summary-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.fab-summary-card,
.fab-stage-summary {
  --metric-color: var(--summary-color, var(--stage-color));
  min-height: 112px;
}

.fab-summary-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--summary-color);
}

.fab-summary-card strong,
.fab-stage-summary strong {
  display: block;
  margin-top: 11px;
  font-size: 24px;
  line-height: 1;
  color: var(--summary-color, var(--stage-color));
}

.fab-stage-summary {
  cursor: pointer;
  border-color: var(--border-default);
}

.fab-stage-summary.is-active {
  border-color: var(--stage-color);
}

.fab-stage-strip,
.fab-toolbar,
.fab-rail,
.fab-register-shell,
.fab-hours-table,
.fab-status-hours {
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--bg-surface);
}

.fab-stage-strip {
  padding: 14px;
}

.fab-section-head,
.fab-rail-header,
.fab-view-header,
.fab-card-top,
.fab-board-head,
.fab-lane-head,
.fab-hour-bucket-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.fab-stage-steps {
  display: grid;
  grid-template-columns: repeat(7, minmax(145px, 1fr));
  gap: 8px;
  margin-top: 12px;
  overflow-x: auto;
}

.fab-stage-step {
  min-height: 106px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 10px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.fab-stage-step.is-active {
  border-color: var(--stage-color);
  background: color-mix(in srgb, var(--stage-color) 12%, var(--bg-surface-low));
}

.fab-stage-step span,
.fab-stage-step small {
  display: block;
}

.fab-stage-step span {
  min-height: 28px;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 800;
  color: var(--text-primary);
}

.fab-stage-step strong {
  display: block;
  margin: 8px 0 2px;
  color: var(--stage-color);
  font-family: var(--font-mono);
  font-size: 21px;
}

.fab-toolbar {
  min-height: 54px;
  padding: 10px;
  display: flex;
  gap: 9px;
  align-items: center;
  flex-wrap: wrap;
}

.fab-search {
  min-width: 260px;
  flex: 1 1 310px;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-muted);
}

.fab-search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 12px;
}

.fab-filter-select {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface-low);
  color: var(--text-muted);
}

.fab-filter-select select {
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

.fab-view-toggle {
  display: inline-flex;
  gap: 5px;
  padding: 5px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--bg-surface-low);
}

.fab-view-toggle button {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0 10px;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}

.fab-view-toggle button.is-active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}

.fab-toolbar-count {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.fab-release-layout {
  display: grid;
  grid-template-columns: 302px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.fab-rail {
  position: sticky;
  top: 12px;
  padding: 14px;
}

.fab-rail-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 13px;
}

.fab-mini-stat {
  min-height: 70px;
  border: 1px solid color-mix(in srgb, var(--mini-color) 30%, var(--border-default));
  border-radius: 12px;
  background: color-mix(in srgb, var(--mini-color) 8%, var(--bg-surface-low));
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  padding: 10px;
}

.fab-mini-stat span {
  display: block;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.fab-mini-stat strong {
  display: block;
  margin-top: 8px;
  color: var(--mini-color);
  font-size: 22px;
}

.fab-watch-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.fab-watch-card {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 10px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.fab-watch-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.fab-watch-top span:last-child,
.fab-watch-card small {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
}

.fab-watch-card strong {
  display: block;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-primary);
}

.fab-watch-card small {
  display: block;
  margin-top: 5px;
}

.fab-rail-empty,
.fab-lane-empty,
.fab-detail-empty {
  padding: 16px;
  border: 1px dashed var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface-low);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: center;
}

.fab-release-main {
  min-width: 0;
  display: grid;
  gap: 12px;
}

.fab-view-header {
  padding: 4px 2px;
}

.fab-stage-lanes,
.fab-board {
  display: grid;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.fab-stage-lanes {
  grid-template-columns: repeat(7, minmax(232px, 1fr));
}

.fab-board {
  grid-template-columns: repeat(5, minmax(240px, 1fr));
}

.fab-lane,
.fab-board-lane {
  min-height: 420px;
  border: 1px solid color-mix(in srgb, var(--lane-color) 24%, var(--border-default));
  border-top: 4px solid var(--lane-color);
  border-radius: 14px;
  padding: 11px;
  background: var(--bg-surface);
}

.fab-lane-head strong,
.fab-board-head span {
  display: block;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 900;
}

.fab-lane-head em,
.fab-board-head strong {
  min-width: 30px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: var(--lane-color);
  background: color-mix(in srgb, var(--lane-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--lane-color) 35%, transparent);
  font-family: var(--font-mono);
  font-style: normal;
  font-size: 10px;
  font-weight: 900;
}

.fab-card-list {
  display: grid;
  gap: 9px;
  margin-top: 11px;
}

.fab-package-card {
  border: 1px solid var(--border-default);
  border-left: 4px solid var(--status-success);
  border-radius: 12px;
  background: var(--bg-surface-low);
  padding: 11px;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(0,0,0,0.20);
}

.fab-package-card:hover,
.fab-watch-card:hover,
.fab-hour-row:hover {
  border-color: var(--accent-border);
  background: var(--bg-surface-high);
}

.fab-package-card.risk-high {
  border-left-color: var(--status-error);
}

.fab-package-card.risk-medium {
  border-left-color: var(--status-warning);
}

.fab-package-card h3 {
  margin: 9px 0 10px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 13px;
  line-height: 1.25;
}

.fab-card-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-bottom: 10px;
}

.fab-fact {
  display: flex;
  gap: 6px;
  min-width: 0;
  align-items: center;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 7px;
  background: var(--bg-surface);
  color: var(--text-muted);
}

.fab-fact span {
  min-width: 0;
}

.fab-fact small {
  display: block;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.fab-fact strong {
  display: block;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fab-wp-number {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.fab-stage-badge,
.fab-readiness,
.fab-flag {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  border-radius: var(--radius-badge);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1;
}

.fab-stage-badge {
  padding: 3px 7px;
  color: var(--badge-color);
  border: 1px solid color-mix(in srgb, var(--badge-color) 36%, transparent);
  background: color-mix(in srgb, var(--badge-color) 13%, transparent);
}

.fab-readiness {
  padding: 4px 7px;
  color: var(--readiness-color);
  background: color-mix(in srgb, var(--readiness-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--readiness-color) 34%, transparent);
}

.fab-flag {
  padding: 4px 7px;
  color: var(--flag-color);
  background: color-mix(in srgb, var(--flag-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--flag-color) 30%, transparent);
}

.fab-card-pills,
.fab-detail-pills,
.fab-detail-flags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 9px;
}

.fab-card-drawings {
  margin-top: 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fab-card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.fab-row-actions {
  display: inline-flex;
  gap: 5px;
}

.fab-row-actions button,
.fab-close {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.fab-row-actions button:hover,
.fab-close:hover {
  color: var(--accent);
  border-color: var(--accent-border);
}

.fab-row-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.fab-register-shell {
  overflow-x: auto;
}

.fab-register-table {
  width: 100%;
  min-width: 1000px;
  border-collapse: collapse;
}

.fab-register-table th,
.fab-register-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--divider);
  text-align: left;
  vertical-align: middle;
}

.fab-register-table th {
  color: var(--text-muted);
  background: var(--bg-surface-secondary);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.fab-register-table tr {
  cursor: pointer;
}

.fab-register-table tr:hover {
  background: var(--hover-bg);
}

.fab-register-table td {
  color: var(--text-secondary);
  font-size: 11px;
}

.fab-register-table td strong {
  display: block;
  color: var(--text-primary);
  font-size: 12px;
}

.fab-register-table td small {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
}

.fab-hours-view {
  display: grid;
  gap: 12px;
}

.fab-status-hours {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
}

.fab-hour-bucket {
  border: 1px solid color-mix(in srgb, var(--bucket-color) 26%, var(--border-default));
  border-radius: 12px;
  padding: 11px;
  background: color-mix(in srgb, var(--bucket-color) 7%, var(--bg-surface-low));
}

.fab-hour-bucket-head span,
.fab-hour-bucket-head strong {
  color: var(--bucket-color);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.fab-hours-table {
  display: grid;
  overflow: hidden;
}

.fab-hour-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 120px 120px 110px;
  gap: 12px;
  align-items: center;
  min-height: 62px;
  border: 0;
  border-bottom: 1px solid var(--divider);
  background: transparent;
  color: var(--text-secondary);
  padding: 10px 13px;
  text-align: left;
  cursor: pointer;
}

.fab-hour-row strong {
  display: block;
  color: var(--text-primary);
  font-size: 12px;
}

.fab-hour-row > span:not(:first-child) {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 900;
  color: var(--text-secondary);
}

.fab-empty-shell {
  padding: 14px 0;
}

.fab-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0,0,0,0.72);
  display: flex;
  justify-content: flex-end;
}

.fab-detail-panel {
  width: min(520px, 100vw);
  height: 100vh;
  overflow-y: auto;
  padding: 20px;
  /* --bg-surface is 3.5% white in steelbuild-dark — nearly invisible.
     Use a solid fallback so the panel is always readable. */
  background: var(--bg-page, #0D1117);
  border-left: 1px solid var(--border-default);
  box-shadow: -24px 0 60px rgba(0,0,0,0.55);
}

.fab-detail-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.fab-detail-head h2 {
  margin: 8px 0 0;
  color: var(--text-primary);
  font-size: 26px;
  line-height: 1.08;
}

.fab-detail-section {
  margin-top: 18px;
  padding-top: 15px;
  border-top: 1px solid var(--divider);
}

.fab-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin-top: 10px;
}

.fab-detail-stat {
  min-height: 68px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255,255,255,0.05);
}

.fab-detail-stat span {
  display: block;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.fab-detail-stat strong {
  display: block;
  margin-top: 8px;
  color: var(--text-primary);
  font-size: 13px;
}

.fab-detail-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.fab-detail-list span {
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
  font-size: 12px;
}

.fab-detail-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 22px;
  padding: 14px 0 4px;
  background: var(--bg-page, #0D1117);
  border-top: 1px solid var(--divider);
}

@media (max-width: 1200px) {
  .fab-release-layout {
    grid-template-columns: 1fr;
  }

  .fab-rail {
    position: static;
  }
}

@media (max-width: 920px) {
  .fab-hero {
    grid-template-columns: 1fr;
  }

  .fab-hero-view-toggle {
    position: static;
    margin-top: 14px;
    width: max-content;
  }

  .fab-status-hours,
  .fab-hero-grid,
  .fab-hours-summary {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .fab-release-page {
    padding: 12px;
  }

  .fab-hero,
  .fab-stage-strip,
  .fab-toolbar,
  .fab-rail {
    border-radius: 12px;
  }

  .fab-hero {
    padding: 15px;
  }

  .fab-hero h1 {
    font-size: 34px;
  }

  .fab-view-toggle,
  .fab-search,
  .fab-filter-select {
    width: 100%;
  }

  .fab-view-toggle {
    overflow-x: auto;
  }

  .fab-toolbar-count {
    margin-left: 0;
  }

  .fab-card-facts,
  .fab-detail-grid,
  .fab-rail-kpis {
    grid-template-columns: 1fr;
  }

  .fab-hour-row {
    grid-template-columns: 1fr;
  }

  .fab-stage-lanes,
  .fab-board {
    grid-template-columns: repeat(7, minmax(230px, 82vw));
  }
}
`;
