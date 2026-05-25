export const deliveryStyles = `
.delivery-page {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.delivery-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.95fr);
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bg-surface) 92%, #000 8%) 0%, color-mix(in srgb, var(--bg-surface-low) 90%, #000 10%) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 38px rgba(0,0,0,0.32);
  overflow: hidden;
}
.delivery-hero-main h1 {
  margin: 8px 0 0;
  color: var(--text-primary);
  font-size: 38px;
  font-weight: 600;
  line-height: 1;
}
.delivery-hero-main p {
  max-width: 720px;
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.delivery-kicker,
.delivery-section-label,
.delivery-metric-label,
.delivery-lane-title {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.delivery-kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--phase-delivery);
  padding: 5px 9px;
  border: 1px solid color-mix(in srgb, var(--phase-delivery) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--phase-delivery) 10%, transparent);
}
.delivery-hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.delivery-hero-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.delivery-hero-metric {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-high) 86%, #000 14%) 0%, color-mix(in srgb, var(--bg-surface-low) 92%, #000 8%) 100%);
  position: relative;
  overflow: hidden;
}
.delivery-hero-metric:before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, color-mix(in srgb, var(--metric-color) 14%, transparent), transparent 50%);
  pointer-events: none;
}
.delivery-hero-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--metric-color);
  background: color-mix(in srgb, var(--metric-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--metric-color) 24%, transparent);
  position: relative;
}
.delivery-metric-label,
.delivery-metric-sub,
.delivery-muted,
.delivery-card-meta,
.delivery-card-project {
  color: var(--text-muted);
}
.delivery-metric-label {
  margin-top: 12px;
}
.delivery-metric-value {
  margin-top: 8px;
  color: var(--metric-color);
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.delivery-metric-sub {
  margin-top: 6px;
  font-size: 11px;
}
.delivery-receive-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--phase-delivery) 38%, var(--border-default));
  border-radius: 14px;
  background: color-mix(in srgb, var(--phase-delivery) 8%, var(--bg-surface));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
}
.delivery-receive-copy h2 {
  margin: 7px 0 0;
  color: var(--text-primary);
  font-size: 22px;
  line-height: 1.15;
}
.delivery-receive-copy p {
  max-width: 720px;
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}
.delivery-receive-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.delivery-receive-actions button,
.delivery-receive-list button,
.delivery-receive-exit {
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  cursor: pointer;
}
.delivery-receive-actions button {
  min-height: 58px;
  padding: 9px;
  text-align: left;
}
.delivery-receive-actions span,
.delivery-receive-exit {
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.delivery-receive-actions strong {
  display: block;
  margin-top: 7px;
  font-family: var(--font-mono);
  font-size: 22px;
  color: var(--phase-delivery);
}
.delivery-receive-list {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.delivery-receive-list button {
  min-height: 58px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  text-align: left;
}
.delivery-receive-list strong,
.delivery-receive-list span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delivery-receive-list strong {
  color: var(--text-primary);
  font-size: 12px;
}
.delivery-receive-list span,
.delivery-receive-empty {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 10px;
}
.delivery-receive-empty {
  grid-column: 1 / -1;
  padding: 14px;
  border: 1px dashed var(--border-default);
  border-radius: 10px;
  text-align: center;
}
.delivery-receive-exit {
  grid-column: 1 / -1;
  justify-self: flex-end;
  min-height: 36px;
  padding: 0 12px;
}
.delivery-flow-strip,
.delivery-toolbar,
.delivery-rail,
.delivery-main,
.delivery-lane,
.delivery-next-loads {
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--bg-surface);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}
.delivery-flow-strip {
  padding: 12px;
}
.delivery-flow-header,
.delivery-rail-header,
.delivery-view-header,
.delivery-lane-head,
.delivery-day-head,
.delivery-card-top,
.delivery-watch-top,
.delivery-detail-head,
.delivery-detail-actions,
.delivery-header-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.delivery-status-flow {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.delivery-status-step {
  min-width: 0;
  text-align: left;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  border-top: 2px solid var(--step-color);
  background: var(--bg-surface-low);
  color: var(--text-primary);
  cursor: pointer;
}
.delivery-status-step.is-active {
  border-color: var(--step-color);
  background: color-mix(in srgb, var(--step-color) 10%, var(--bg-surface-low));
}
.delivery-status-step span,
.delivery-status-step small,
.delivery-flow-total {
  display: block;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.delivery-status-step strong {
  display: block;
  margin-top: 7px;
  font-family: var(--font-mono);
  font-size: 22px;
  color: var(--step-color);
}
.delivery-toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto auto auto auto;
  gap: 8px;
  padding: 10px;
  align-items: center;
}
.delivery-search,
.delivery-filter-select,
.delivery-view-toggle {
  min-width: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-muted);
}
.delivery-search input,
.delivery-toolbar select,
.delivery-filter-select select {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 12px;
}
.delivery-toolbar > select {
  height: 36px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  padding: 0 10px;
}
.delivery-view-toggle {
  padding: 3px;
  background: var(--bg-surface-low);
}
.delivery-view-toggle button {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 0 9px;
}
.delivery-view-toggle button.is-active {
  background: var(--accent);
  color: var(--accent-text);
}
.delivery-layout {
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.delivery-rail,
.delivery-main {
  min-width: 0;
  padding: 12px;
}
.delivery-rail {
  position: sticky;
  top: 12px;
}
.delivery-rail-header button,
.delivery-card-actions button,
.delivery-register button,
.delivery-detail-head button {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 6px 8px;
}
.delivery-rail-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}
.delivery-mini-stat {
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface-low);
}
.delivery-mini-stat span,
.delivery-meta-mini span,
.delivery-detail-cell span {
  display: block;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-muted);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.delivery-mini-stat strong {
  display: block;
  margin-top: 5px;
  font-family: var(--font-mono);
  font-size: 18px;
}
.delivery-watch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.delivery-watch-card,
.delivery-next-loads button,
.delivery-day-list button {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}
.delivery-watch-card {
  padding: 10px;
}
.delivery-watch-card strong,
.delivery-next-loads strong,
.delivery-day-list strong {
  display: block;
  min-width: 0;
  margin-top: 7px;
  color: var(--text-primary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delivery-watch-card small,
.delivery-next-loads span,
.delivery-day-list small {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delivery-rail-empty,
.delivery-lane-empty,
.delivery-day-empty {
  padding: 16px;
  border: 1px dashed var(--border-default);
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}
.delivery-view-header {
  margin-bottom: 12px;
}
.delivery-lane-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}
.delivery-lanes {
  display: grid;
  grid-template-columns: repeat(5, minmax(250px, 1fr));
  gap: 10px;
  min-width: 980px;
}
.delivery-lane {
  min-width: 0;
  border-top: 2px solid var(--lane-color);
  padding: 10px;
}
.delivery-lane-head span {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.delivery-lane-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.delivery-load-card {
  min-width: 0;
  padding: 11px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface-low);
  cursor: pointer;
}
.delivery-load-card.is-selected {
  border-color: var(--accent);
  background: var(--accent-muted);
}
.delivery-card-top input {
  width: 15px;
  height: 15px;
}
.delivery-card-date {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
}
.delivery-load-card h3 {
  margin: 10px 0 6px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.25;
}
.delivery-card-meta {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  font-size: 10px;
  margin-bottom: 10px;
}
.delivery-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.delivery-meta-mini {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-surface-high) 70%, transparent);
}
.delivery-meta-mini svg {
  color: var(--phase-delivery);
  margin-top: 1px;
}
.delivery-meta-mini strong {
  display: block;
  margin-top: 3px;
  color: var(--text-primary);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delivery-flag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.delivery-flag-row span {
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--danger-muted);
  color: var(--status-error);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.delivery-card-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.delivery-card-actions button {
  flex: 1;
}
.delivery-card-project {
  margin-top: 9px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
}
.delivery-schedule {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 12px;
}
.delivery-calendar {
  display: grid;
  grid-template-columns: repeat(7, minmax(150px, 1fr));
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.delivery-day {
  min-width: 150px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface-low);
  overflow: hidden;
}
.delivery-day-head {
  align-items: flex-start;
  padding: 10px;
  border-bottom: 1px solid var(--border-default);
}
.delivery-day-head strong,
.delivery-day-head span {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-primary);
}
.delivery-day-head span {
  color: var(--text-muted);
  font-size: 8px;
  margin-top: 4px;
}
.delivery-day-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}
.delivery-day-list button {
  padding: 8px;
  position: relative;
}
.delivery-day-list button > span:first-child {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 3px;
}
.delivery-next-loads {
  padding: 12px;
}
.delivery-next-loads button {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  margin-top: 8px;
}
.delivery-register-wrap {
  overflow-x: auto;
}
.delivery-register {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
}
.delivery-register th,
.delivery-register td {
  padding: 10px 9px;
  border-bottom: 1px solid var(--border-default);
  text-align: left;
  vertical-align: middle;
}
.delivery-register th {
  background: var(--bg-surface-low);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.delivery-register tr {
  cursor: pointer;
}
.delivery-register tr.is-selected td {
  background: var(--accent-muted);
}
.delivery-register td strong,
.delivery-register td span {
  display: block;
  min-width: 0;
}
.delivery-register td strong {
  color: var(--text-primary);
  font-size: 12px;
}
.delivery-register td span {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 10px;
}
.delivery-empty {
  padding: 28px;
}
.delivery-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(3, 5, 10, 0.72);
  display: flex;
  justify-content: flex-end;
}
.delivery-detail {
  width: min(520px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow-y: auto;
  border-left: 1px solid var(--border-strong);
  background: var(--bg-elevated);
  box-shadow: -18px 0 54px rgba(0,0,0,0.5);
}
.delivery-detail-head {
  align-items: flex-start;
}
.delivery-detail-head h2 {
  margin: 10px 0 6px;
  color: var(--text-primary);
  font-size: 24px;
  line-height: 1.1;
}
.delivery-detail-head p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}
.delivery-detail-status,
.delivery-detail-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.delivery-detail-flags span {
  padding: 5px 8px;
  border-radius: 999px;
  background: var(--danger-muted);
  color: var(--status-error);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.delivery-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.delivery-detail-cell,
.delivery-detail-notes > div {
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface);
}
.delivery-detail-cell strong {
  display: block;
  margin-top: 5px;
  color: var(--text-primary);
  font-size: 12px;
}
.delivery-detail-notes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.delivery-detail-notes strong {
  color: var(--text-primary);
  font-size: 12px;
}
.delivery-detail-notes p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.delivery-detail-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-default);
}
@media (max-width: 1180px) {
  .delivery-hero,
  .delivery-receive-panel,
  .delivery-layout,
  .delivery-schedule {
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-rail {
    position: static;
  }
  .delivery-toolbar {
    grid-template-columns: minmax(0, 1fr) repeat(3, auto);
  }
}
@media (max-width: 760px) {
  .delivery-page {
    padding: 12px;
  }
  .delivery-hero {
    padding: 14px;
  }
  .delivery-hero-main h1 {
    font-size: 30px;
  }
  .delivery-hero-grid,
  .delivery-rail-kpis,
  .delivery-detail-grid,
  .delivery-card-grid,
  .delivery-status-flow,
  .delivery-receive-actions,
  .delivery-receive-list {
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-toolbar {
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-view-toggle,
  .delivery-filter-select,
  .delivery-toolbar > select {
    width: 100%;
  }
  .delivery-view-toggle button {
    flex: 1;
    justify-content: center;
  }
  .delivery-lanes {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-calendar {
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-day {
    min-width: 0;
  }
  .delivery-detail {
    width: 100vw;
  }
  .delivery-detail-actions {
    position: sticky;
    bottom: -18px;
    background: var(--bg-elevated);
  }
}
`;
