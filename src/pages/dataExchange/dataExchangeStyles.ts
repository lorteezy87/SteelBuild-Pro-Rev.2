/** Inline page styles extracted from DataExchange.jsx */
export const dataExchangeStyles = `
.data-exchange-page {
  min-height: 100%;
  padding: 24px;
  color: var(--text-primary);
  background: var(--bg);
}

.de-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.de-header h1 {
  margin: 4px 0 8px;
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: 0;
}

.de-header p {
  max-width: 780px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.de-eyebrow,
.de-field span,
.de-stat-card span,
.de-import-meta,
.de-export-summary span {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.de-control-bar,
.de-stats,
.de-grid,
.de-import-controls,
.de-actions,
.de-approval,
.de-export-summary {
  display: grid;
  gap: 14px;
}

.de-control-bar {
  grid-template-columns: minmax(260px, 1.2fr) minmax(220px, 0.8fr);
  margin-bottom: 14px;
}

.de-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.de-field select,
.de-import-editor textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-elevated, var(--card));
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.4;
  outline: none;
}

.de-field select {
  min-height: 42px;
  padding: 0 12px;
}

.de-field select:focus,
.de-import-editor textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
}

.de-stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 14px;
}

.de-stat-card,
.de-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

.de-stat-card {
  display: grid;
  gap: 4px;
  padding: 14px;
}

.de-stat-card strong {
  min-width: 0;
  font-size: 20px;
  line-height: 1.2;
  word-break: break-word;
}

.de-stat-card small {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.de-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.12);
  color: var(--text-primary);
  font-size: 13px;
}

.de-grid {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
}

.de-panel {
  padding: 18px;
  min-width: 0;
}

.de-wide {
  grid-column: 1 / -1;
}

.de-section-header {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.de-section-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--surface-muted, rgba(15, 23, 42, 0.06));
  color: var(--accent);
  flex: 0 0 auto;
}

.de-section-header h2 {
  margin: 0 0 4px;
  font-size: 18px;
  letter-spacing: 0;
}

.de-section-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.de-export-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 14px;
}

.de-export-summary > div {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.de-export-summary strong {
  font-size: 18px;
}

.de-actions,
.de-import-controls,
.de-approval {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 14px;
}

.de-primary-btn,
.de-secondary-btn,
.de-icon-btn,
.de-upload {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  white-space: nowrap;
}

.de-primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg-base);
}

.de-secondary-btn,
.de-icon-btn,
.de-upload {
  background: var(--surface-elevated, var(--card));
  color: var(--text-primary);
}

.de-primary-btn:disabled,
.de-secondary-btn:disabled,
.de-icon-btn:disabled,
.de-upload:has(input:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
}

.de-upload {
  position: relative;
  overflow: hidden;
}

.de-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.de-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.de-import-editor {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  overflow: hidden;
  margin-bottom: 14px;
}

.de-import-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-elevated, var(--card));
}

.de-import-editor textarea {
  display: block;
  min-height: 210px;
  resize: vertical;
  border: 0;
  border-radius: 0;
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  background: var(--surface-elevated, var(--card));
}

.de-mapping {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
}

.de-mapping-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  font-size: 13px;
}

.de-mapping-row:last-child {
  border-bottom: 0;
}

.de-mapping-row span,
.de-mapping-row strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.de-mapping-head {
  background: var(--surface-elevated, var(--card));
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.de-validation {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.10);
  color: var(--text-primary);
}

.de-validation ul {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.de-approval {
  align-items: center;
}

.de-approval label {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-elevated, var(--card));
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.4;
}

.de-approval input {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
}

.de-table-wrap {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.de-preview-table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  font-size: 12px;
}

.de-preview-table th,
.de-preview-table td {
  max-width: 240px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.de-preview-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-elevated, var(--card));
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.de-preview-table tr:last-child td {
  border-bottom: 0;
}

.de-empty-line {
  padding: 14px;
  color: var(--text-muted);
  font-size: 13px;
}

@media (max-width: 980px) {
  .de-header,
  .de-control-bar,
  .de-grid {
    grid-template-columns: 1fr;
  }

  .de-header {
    display: grid;
  }

  .de-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .data-exchange-page {
    padding: 16px;
  }

  .de-header h1 {
    font-size: 24px;
  }

  .de-stats,
  .de-actions,
  .de-import-controls,
  .de-approval,
  .de-export-summary {
    grid-template-columns: 1fr;
  }

  .de-primary-btn,
  .de-secondary-btn,
  .de-icon-btn,
  .de-upload {
    width: 100%;
  }

  .de-import-meta {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;
