import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Cable,
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  FileText,
  KeyRound,
  ListChecks,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { createPageUrl } from "@/utils";
import { useProjectId } from "@/hooks/useProjectId";
import { usePermissions } from "@/services/permissions";
import EmailAccountSettings from "@/components/email/EmailAccountSettings";
import DocumentStorageSettings from "@/components/dms/DocumentStorageSettings";
import {
  INTEGRATION_AREAS,
  INTEGRATION_BUILD_ORDER,
  INTEGRATION_CATEGORIES,
  INTEGRATION_STATUSES,
  CUSTOMER_STATUS_FILTERS,
  filterIntegrations,
  filterByCustomerStatus,
  getIntegrationByKey,
  integrationSummary,
  customerIntegrationSummary,
  customerStatusMeta,
} from "@/lib/integrationCatalog";
import {
  QUICK_LINKS,
  customerToneStyle,
  statusStyle,
} from "./integrations/integrationsPageHelpers";
import {
  AREA_ICONS,
  IntegrationCard,
  ProviderRow,
  Kpi,
  BulletList,
  SelectPill,
} from "./integrations/IntegrationsUi";
import { integrationsStyles } from "./integrations/integrationsStyles";

export default function Integrations() {
  const navigate = useNavigate();
  const projectId = useProjectId();
  const { isAdmin } = usePermissions();
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [customerStatusFilter, setCustomerStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("document-storage");
  // Customers see clean product language by default; admins can flip to the
  // developer/internal view (real status + risk + the technical roadmap).
  const [devView, setDevView] = useState(false);
  const showDev = isAdmin && devView;

  const filteredAreas = useMemo(() => {
    const byText = filterIntegrations({ category, status: showDev ? status : "All", query });
    return showDev ? byText : filterByCustomerStatus(byText, customerStatusFilter);
  }, [category, status, query, showDev, customerStatusFilter]);
  const selectedArea = useMemo(() => getIntegrationByKey(selectedKey), [selectedKey]);
  const devSummary = useMemo(() => integrationSummary(INTEGRATION_AREAS), []);
  const custSummary = useMemo(() => customerIntegrationSummary(INTEGRATION_AREAS), []);
  const selectedStyle = showDev ? statusStyle(selectedArea.status) : customerToneStyle(selectedArea.customerStatus);
  const selectedCustomerLabel = customerStatusMeta(selectedArea.customerStatus).label;

  return (
    <div className="sb-dashboard-reference-page integrations-page">
      <style>{integrationsStyles}</style>

      <header className="integrations-top">
        <div>
          <h1>Integrations</h1>
          <p>
            {showDev
              ? "Plan, stage, and govern external connections for email, accounting, document storage, schedules, and BIM models."
              : "Connect SteelBuild to your email, document storage, schedule tools, and 3D models. Every connection is reviewed before it touches your project data."}
          </p>
        </div>
        <div className="integrations-top-actions">
          {isAdmin && (
            <button
              type="button"
              className="integrations-secondary-btn"
              onClick={() => setDevView((v) => !v)}
              title="Toggle the internal developer view (admins only)"
            >
              <Code2 size={15} />
              {devView ? "Customer view" : "Developer view"}
            </button>
          )}
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
        {showDev ? (
          <>
            <Kpi icon={Cable} label="Integration areas" value={devSummary.total} detail="cataloged and scoped" />
            <Kpi icon={CheckCircle2} label="Partially live" value={devSummary.partiallyLive} detail="existing SteelBuild capability" />
            <Kpi icon={AlertTriangle} label="High-risk adapters" value={devSummary.highRisk} detail="OAuth, cost, or model permissions" />
            <Kpi icon={KeyRound} label="Credential policy" value="Server side" detail="no browser-stored provider secrets" />
          </>
        ) : (
          <>
            <Kpi icon={CheckCircle2} label="Available now" value={custSummary.availableAreas} detail="integration areas you can use today" />
            <Kpi icon={Cable} label="Connectors live" value={custSummary.availableProviders} detail="providers ready to connect" />
            <Kpi icon={Clock3} label="Coming soon" value={custSummary.comingSoonProviders} detail="connectors on the roadmap" />
            <Kpi icon={KeyRound} label="Your data is safe" value="Reviewed" detail="nothing writes without your approval" />
          </>
        )}
      </section>

      <main className="integrations-layout">
        <section className="integrations-panel integrations-catalog-panel">
          <div className="integrations-panel-heading">
            <div>
              <h2>{showDev ? "Integration Catalog" : "Available Integrations"}</h2>
              <p>
                {showDev
                  ? "Provider choices stay separated from business workflows so each adapter can be reviewed safely."
                  : "Pick a connection to see what's available today and what's coming soon."}
              </p>
            </div>
          </div>

          <div className="integrations-filters">
            <label className="integrations-search">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search providers, systems, or modules" />
            </label>
            <SelectPill label="Category" value={category} onChange={setCategory} options={INTEGRATION_CATEGORIES} />
            {showDev ? (
              <SelectPill label="Status" value={status} onChange={setStatus} options={INTEGRATION_STATUSES} />
            ) : (
              <SelectPill label="Readiness" value={customerStatusFilter} onChange={setCustomerStatusFilter} options={CUSTOMER_STATUS_FILTERS} />
            )}
          </div>

          <div className="integrations-card-grid">
            {filteredAreas.map((area) => (
              <IntegrationCard
                key={area.key}
                area={area}
                selected={area.key === selectedArea.key}
                onSelect={() => setSelectedKey(area.key)}
                devView={showDev}
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
            {showDev ? (
              <>
                <span>{selectedArea.status}</span>
                <strong>{selectedArea.risk} risk</strong>
              </>
            ) : (
              <span>{selectedCustomerLabel}</span>
            )}
          </div>

          {!showDev && (
            <p className="integrations-customer-summary">{selectedArea.customerSummary}</p>
          )}

          <div className="integrations-detail-section">
            <h3>{showDev ? "Systems" : "What's included"}</h3>
            {showDev ? (
              <div className="integrations-chip-list">
                {selectedArea.systems.map((system) => <span key={system}>{system}</span>)}
              </div>
            ) : (
              <div className="integrations-provider-list">
                {selectedArea.providers.map((p) => <ProviderRow key={p.name} name={p.name} status={p.status} />)}
              </div>
            )}
          </div>

          {showDev && (
            <>
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
            </>
          )}

          {/* Live management panels — appear when a project is active */}
          {projectId && selectedKey === "email" && (
            <div className="integrations-detail-section" style={{ marginTop: 20 }}>
              <h3>Live Configuration</h3>
              <EmailAccountSettings projectId={projectId} />
            </div>
          )}
          {projectId && selectedKey === "document-storage" && (
            <div className="integrations-detail-section" style={{ marginTop: 20 }}>
              <h3>Live Configuration</h3>
              <DocumentStorageSettings projectId={projectId} />
            </div>
          )}
        </aside>

        {showDev && (
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
        )}

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
            <div><KeyRound size={18} /><strong>Server-side credentials</strong><span>Your provider keys and credentials stay on our servers, never in your browser.</span></div>
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

        {showDev && (
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
        )}
      </main>
    </div>
  );
}

