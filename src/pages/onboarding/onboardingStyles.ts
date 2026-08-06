/** Inline page styles extracted from Onboarding.jsx */
export const onboardingStyles = `
.onboarding-page {
  padding: 24px;
  color: var(--text-primary);
  background: var(--bg);
}

.onboarding-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.onboarding-eyebrow,
.onboarding-template-header,
.onboarding-review-card > span,
.onboarding-library-card > span,
.onboarding-import-meta,
.onboarding-step span,
.onboarding-section-header p,
.onboarding-count span,
.onboarding-created span {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.onboarding-top h1 {
  margin: 4px 0 8px;
  font-size: 34px;
  line-height: 1.05;
  letter-spacing: 0;
}

.onboarding-top p {
  max-width: 760px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
}

.onboarding-top-actions,
.onboarding-import-approval,
.onboarding-module-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.onboarding-primary-btn,
.onboarding-secondary-btn,
.onboarding-module-actions button,
.onboarding-upload {
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
  transition: border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}

.onboarding-primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: #061018;
}

.onboarding-secondary-btn,
.onboarding-module-actions button,
.onboarding-upload {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.onboarding-primary-btn:disabled,
.onboarding-secondary-btn:disabled,
.onboarding-module-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.onboarding-checklist {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.onboarding-step {
  display: flex;
  gap: 10px;
  min-height: 74px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
}

.onboarding-step.is-done {
  border-color: var(--success);
  background: var(--success-muted);
}

.onboarding-step-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--bg-surface-high);
  color: var(--accent);
  flex: 0 0 auto;
}

.onboarding-step strong {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
}

.onboarding-step span {
  display: block;
  line-height: 1.35;
}

.onboarding-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
  gap: 16px;
}

.onboarding-panel {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  padding: 18px;
  min-width: 0;
}

.onboarding-wide {
  grid-column: 1 / -1;
}

.onboarding-section-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.onboarding-section-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-muted);
  color: var(--accent);
}

.onboarding-section-header h2 {
  margin: 0 0 4px;
  font-size: 18px;
  letter-spacing: 0;
}

.onboarding-section-header p {
  margin: 0;
  line-height: 1.4;
}

.onboarding-template-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(180px, 1fr));
  gap: 10px;
}

.onboarding-template-card {
  display: flex;
  min-height: 220px;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.onboarding-template-card.is-selected {
  border-color: var(--template-accent);
  box-shadow: inset 0 0 0 1px var(--template-accent);
}

.onboarding-template-card strong {
  font-size: 15px;
}

.onboarding-template-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.onboarding-template-header {
  display: flex;
  align-items: center;
  gap: 7px;
}

.onboarding-template-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--template-accent);
}

.onboarding-template-modules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}

.onboarding-template-modules span,
.onboarding-library-card small {
  border: 1px solid var(--border-default);
  border-radius: 999px;
  padding: 4px 7px;
  color: var(--text-secondary);
  font-size: 11px;
  background: var(--bg-surface);
}

.onboarding-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.onboarding-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.onboarding-field span,
.onboarding-subsection-title {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.onboarding-field input,
.onboarding-field select,
.onboarding-team-row input,
.onboarding-team-row select,
.onboarding-import-editor textarea {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 7px;
  background: var(--bg-surface-high);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.onboarding-field input,
.onboarding-field select,
.onboarding-team-row input,
.onboarding-team-row select {
  height: 38px;
  padding: 0 10px;
}

.onboarding-subsection {
  margin-top: 18px;
}

.onboarding-subsection-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.onboarding-team-list {
  display: grid;
  gap: 8px;
}

.onboarding-team-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 96px minmax(140px, 0.8fr) 34px;
  gap: 8px;
  align-items: center;
}

.onboarding-icon-btn {
  height: 34px;
  width: 34px;
  border: 1px solid var(--border-default);
  border-radius: 7px;
  background: var(--bg-surface-high);
  color: var(--text-secondary);
  cursor: pointer;
}

.onboarding-add-row {
  margin-top: 10px;
}

.onboarding-review-card,
.onboarding-created,
.onboarding-validation {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  padding: 14px;
}

.onboarding-review-card strong {
  display: block;
  margin-top: 5px;
  font-size: 17px;
}

.onboarding-review-card p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  line-height: 1.45;
}

.onboarding-count-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}

.onboarding-count {
  min-height: 66px;
  padding: 11px;
  border-radius: 8px;
  background: var(--bg-surface-high);
  border: 1px solid var(--border-default);
}

.onboarding-count strong {
  display: block;
  margin-top: 6px;
  font-size: 24px;
}

.onboarding-empty-count {
  grid-column: 1 / -1;
  color: var(--text-secondary);
}

.onboarding-created {
  display: flex;
  gap: 10px;
  margin: 12px 0;
  color: var(--success);
}

.onboarding-created strong {
  display: block;
  color: var(--text-primary);
}

.onboarding-module-actions button {
  min-height: 32px;
  justify-content: space-between;
}

.onboarding-import-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
}

.onboarding-import-controls {
  display: grid;
  gap: 10px;
  align-content: start;
}

.onboarding-upload {
  position: relative;
  overflow: hidden;
}

.onboarding-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.onboarding-import-editor {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.onboarding-import-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.onboarding-import-editor textarea {
  min-height: 172px;
  resize: vertical;
  padding: 12px;
  font-family: var(--font-mono);
  line-height: 1.45;
}

.onboarding-mapping {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--border-default);
}

.onboarding-mapping-row {
  display: contents;
}

.onboarding-mapping-row span,
.onboarding-mapping-row strong,
.onboarding-mapping-empty {
  min-height: 36px;
  padding: 10px 12px;
  background: var(--bg-surface-high);
  font-size: 12px;
}

.onboarding-mapping-head span {
  background: var(--bg-surface-low);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-weight: 800;
  text-transform: uppercase;
}

.onboarding-mapping-empty {
  grid-column: 1 / -1;
  color: var(--text-secondary);
}

.onboarding-validation {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  border-color: var(--warning);
  color: var(--warning);
}

.onboarding-validation strong {
  color: var(--text-primary);
}

.onboarding-validation ul {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--text-secondary);
}

.onboarding-import-approval {
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-default);
}

.onboarding-import-approval label {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 13px;
}

.onboarding-library-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(150px, 1fr));
  gap: 10px;
}

.onboarding-library-card {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  padding: 13px;
}

.onboarding-library-card strong {
  display: block;
  margin: 5px 0 10px;
}

.onboarding-library-card div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

@media (max-width: 1200px) {
  .onboarding-checklist,
  .onboarding-template-grid,
  .onboarding-library-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .onboarding-main-grid,
  .onboarding-import-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .onboarding-page {
    padding: 16px;
  }

  .onboarding-top {
    flex-direction: column;
  }

  .onboarding-top-actions,
  .onboarding-primary-btn,
  .onboarding-secondary-btn,
  .onboarding-upload {
    width: 100%;
  }

  .onboarding-checklist,
  .onboarding-template-grid,
  .onboarding-form-grid,
  .onboarding-count-grid,
  .onboarding-library-grid {
    grid-template-columns: 1fr;
  }

  .onboarding-team-row {
    grid-template-columns: 1fr;
  }

  .onboarding-icon-btn {
    width: 100%;
  }
}
`;
