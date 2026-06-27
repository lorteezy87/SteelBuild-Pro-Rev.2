import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Cable,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  DollarSign,
  ExternalLink,
  FileText,
  FolderOpen,
  KeyRound,
  ListChecks,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { createPageUrl } from "@/utils";
import {
  INTEGRATION_AREAS,
  INTEGRATION_BUILD_ORDER,
  INTEGRATION_CATEGORIES,
  INTEGRATION_STATUSES,
  filterIntegrations,
  getIntegrationByKey,
  integrationSummary,
} from "@/lib/integrationCatalog";

const AREA_ICONS = {
  email: Mail,
  accounting: DollarSign,
  "document-storage": FolderOpen,
  "bluebeam-pdf": FileText,
  scheduling: CalendarDays,
  "autodesk-bim": Box,
};

const STATUS_STYLES = {
  Live: { color: "var(--success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  "Partially Live": { color: "var(--success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  Planned: { color: "var(--warning)", bg: "var(--warning-muted)", border: "var(--warning-border)" },
  "Adapter Required": { color: "var(--info)", bg: "var(--info-muted)", border: "var(--info-border)" },
};

const QUICK_LINKS = [
  { label: "PDF Import Queue", page: "PdfImportReview" },
  { label: "Documents", page: "Documents" },
  { label: "Schedule", page: "Schedule" },
  { label: "Model Viewer", page: "ModelViewer" },
  { label: "RFIs", page: "RFIs" },
  { label: "Change Orders", page: "ChangeOrders" },
];

function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.Planned;
}

function IntegrationCard({ area, selected, onSelect }) {
  const Icon = AREA_ICONS[area.key] || Cable;
  const style = statusStyle(area.status);
  return (
    <button
      type="button"
      className={`integrations-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      style={{ "--integration-accent": style.color, "--integration-accent-bg": style.bg, "--integration-accent-border": style.border }}
    >
      <div className="integrations-card-top">
        <div className="integrations-card-icon"><Icon size={18} /></div>
        <span>{area.category}</span>
      </div>
      <strong>{area.name}</strong>
      <p>{area.shortDescription}</p>
      <div className="integrations-card-footer">
        <span>{area.status}</span>
        <small>{area.risk} risk</small>
      </div>
    </button>
  );
}

function Kpi({ label, value, detail, icon: Icon }) {
  return (
    <div className="integrations-kpi">
      <div className="integrations-kpi-icon"><Icon size={18} /></div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul className="integrations-bullet-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function SelectPill({ label, value, onChange, options }) {
  return (
    <label className="integrations-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export default function Integrations() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("document-storage");

  const filteredAreas = useMemo(() => filterIntegrations({ category, status, query }), [category, status, query]);
  const selectedArea = useMemo(() => getIntegrationByKey(selectedKey), [selectedKey]);
  const summary = useMemo(() => integrationSummary(INTEGRATION_AREAS), []);
  const selectedStyle = statusStyle(selectedArea.status);

  return (
    <div className="integrations-page">
      <style>{integrationsStyles}</style>

      <header className="integrations-top">
        <div>
          <h1>Integrations</h1>
          <p>Plan, stage, and govern external connections for email, accounting, document storage, PDF workflows, schedules, and BIM models.</p>
        </div>
        <div className="integrations-top-actions">
          <button type="button" className="integrations-secondary-btn" onClick={() => navigate(createPageUrl("Settings"))}>
            <ShieldCheck size={15} />
            Security settings
          </button>
          <button type="button" className="integrations-primary-btn" onClick={() => navigate(createPageUrl("Onboarding"))}>
            <ListChecks size={15} />
            Setup checklist
          </button>
        </div>
      </header>

      <section className="integrations-kpis">
        <Kpi icon={Cable} label="Integration areas" value={summary.total} detail="cataloged and scoped" />
        <Kpi icon={CheckCircle2} label="Partially live" value={summary.partiallyLive} detail="existing SteelBuild capability" />
        <Kpi icon={AlertTriangle} label="High-risk adapters" value={summary.highRisk} detail="OAuth, cost, or model permissions" />
        <Kpi icon={KeyRound} label="Credential policy" value="Server side" detail="no browser-stored provider secrets" />
      </section>

      <main className="integrations-layout">
        <section className="integrations-panel integrations-catalog-panel">
          <div className="integrations-panel-heading">
            <div>
              <h2>Integration Catalog</h2>
              <p>Provider choices stay separated from business workflows so each adapter can be reviewed safely.</p>
            </div>
          </div>

          <div className="integrations-filters">
            <label className="integrations-search">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search providers, systems, or modules" />
            </label>
            <SelectPill label="Category" value={category} onChange={setCategory} options={INTEGRATION_CATEGORIES} />
            <SelectPill label="Status" value={status} onChange={setStatus} options={INTEGRATION_STATUSES} />
          </div>

          <div className="integrations-card-grid">
            {filteredAreas.map((area) => (
              <IntegrationCard
                key={area.key}
                area={area}
                selected={area.key === selectedArea.key}
                onSelect={() => setSelectedKey(area.key)}
              />
            ))}
          </div>
        </section>

        <aside className="integrations-panel integrations-detail-panel" style={{ "--detail-accent": selectedStyle.color, "--detail-bg": selectedStyle.bg, "--detail-border": selectedStyle.border }}>
          <div className="integrations-detail-header">
            <div className="integrations-detail-icon">
              {React.createElement(AREA_ICONS[selectedArea.key] || Cable, { size: 22 })}
            </div>
            <div>
              <span>{selectedArea.category}</span>
              <h2>{selectedArea.name}</h2>
            </div>
          </div>

          <div className="integrations-status-row">
            <span>{selectedArea.status}</span>
            <strong>{selectedArea.risk} risk</strong>
          </div>

          <div className="integrations-detail-section">
            <h3>Systems</h3>
            <div className="integrations-chip-list">
              {selectedArea.systems.map((system) => <span key={system}>{system}</span>)}
            </div>
          </div>

          <div className="integrations-detail-section">
            <h3>Existing SteelBuild Surface</h3>
            <BulletList items={selectedArea.existingCapabilities} />
          </div>

          <div className="integrations-detail-section">
            <h3>Target Workflows</h3>
            <BulletList items={selectedArea.targetWorkflows} />
          </div>

          <div className="integrations-detail-section">
            <h3>Prerequisites</h3>
            <BulletList items={selectedArea.prerequisites} />
          </div>

          <div className="integrations-detail-section">
            <h3>Next Sprint</h3>
            <BulletList items={selectedArea.nextSprint} />
          </div>
        </aside>

        <section className="integrations-panel integrations-wide">
          <div className="integrations-panel-heading">
            <div>
              <h2>Build Order</h2>
              <p>This sequence keeps project-critical data under review and avoids direct API writes before mappings are approved.</p>
            </div>
          </div>
          <div className="integrations-roadmap">
            {INTEGRATION_BUILD_ORDER.map((item, index) => (
              <div className="integrations-roadmap-item" key={item.title}>
                <div className="integrations-roadmap-index">{index + 1}</div>
                <div>
                  <span>{item.phase}</span>
                  <strong>{item.title}</strong>
                  <p>{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="integrations-panel">
          <div className="integrations-panel-heading">
            <div>
              <h2>Governance Rules</h2>
              <p>External systems can suggest, stage, attach, or export data. They should not silently approve project-critical changes.</p>
            </div>
          </div>
          <div className="integrations-rule-grid">
            <div><ShieldCheck size={18} /><strong>Human approval before writes</strong><span>Imports land in review queues before records are created or updated.</span></div>
            <div><Database size={18} /><strong>Source lineage required</strong><span>Provider id, file hash, email id, or model version must be retained.</span></div>
            <div><KeyRound size={18} /><strong>Server-side credentials</strong><span>OAuth tokens and provider secrets stay outside browser storage.</span></div>
            <div><RefreshCw size={18} /><strong>Idempotent sync</strong><span>Adapters must dedupe retries and preserve auditability.</span></div>
          </div>
        </section>

        <section className="integrations-panel">
          <div className="integrations-panel-heading">
            <div>
              <h2>Live Surfaces To Extend</h2>
              <p>These app areas already contain the first integration hooks or destination records.</p>
            </div>
          </div>
          <div className="integrations-link-list">
            {QUICK_LINKS.map((link) => (
              <button key={link.page} type="button" onClick={() => navigate(createPageUrl(link.page))}>
                <ExternalLink size={15} />
                {link.label}
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </section>

        <section className="integrations-panel integrations-wide">
          <div className="integrations-panel-heading">
            <div>
              <h2>Adapter Contract</h2>
              <p>Every future provider should land in the same staged pattern before touching production records.</p>
            </div>
          </div>
          <div className="integrations-contract-grid">
            <div>
              <UploadCloud size={18} />
              <strong>Ingest</strong>
              <span>Accept provider payloads, files, emails, exports, or model metadata.</span>
            </div>
            <div>
              <FileText size={18} />
              <strong>Normalize</strong>
              <span>Convert provider fields into SteelBuild canonical records with explicit mappings.</span>
            </div>
            <div>
              <Clock3 size={18} />
              <strong>Stage</strong>
              <span>Show preview rows, invalid values, duplicates, and confidence before any mutation.</span>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <strong>Commit</strong>
              <span>Write only approved records and preserve source evidence for audit review.</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const integrationsStyles = `
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
  color: #061018;
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
  color: #061018;
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
