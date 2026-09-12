import {
  Box,
  Cable,
  CalendarDays,
  DollarSign,
  FolderOpen,
  Mail,
  Search,
  type LucideIcon,
} from "lucide-react";

import {
  CUSTOMER_STATUS_FILTERS,
  INTEGRATION_CATEGORIES,
  INTEGRATION_STATUSES,
  customerStatusMeta,
  type IntegrationArea,
  type IntegrationKey,
} from "@/lib/integrationCatalog";
import { IntegrationLiveConfiguration } from "./IntegrationLiveConfiguration";
import {
  customerIntegrationStyle,
  integrationCardAccentStyle,
  type IntegrationAccentStyle,
} from "./integrationPageModel";

const AREA_ICONS: Record<IntegrationKey, LucideIcon> = {
  email: Mail,
  accounting: DollarSign,
  "document-storage": FolderOpen,
  scheduling: CalendarDays,
  "autodesk-bim": Box,
};

interface SelectPillProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}

function SelectPill({ label, value, onChange, options }: SelectPillProps) {
  return (
    <label className="integrations-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

interface IntegrationCardProps {
  area: IntegrationArea;
  selected: boolean;
  onSelect: () => void;
  showDev: boolean;
}

function IntegrationCard({
  area,
  selected,
  onSelect,
  showDev,
}: IntegrationCardProps) {
  const Icon = AREA_ICONS[area.key] ?? Cable;
  const customerLabel = customerStatusMeta(area.customerStatus).label;

  return (
    <button
      type="button"
      className={`integrations-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      style={integrationCardAccentStyle(area.status, area.customerStatus, showDev)}
    >
      <div className="integrations-card-top">
        <div className="integrations-card-icon"><Icon size={18} /></div>
        <span>{area.category}</span>
      </div>
      <strong>{area.name}</strong>
      <p>{area.shortDescription}</p>
      <div className="integrations-card-footer">
        {showDev ? (
          <>
            <span>{area.status}</span>
            <small>{area.risk} risk</small>
          </>
        ) : (
          <span>{customerLabel}</span>
        )}
      </div>
    </button>
  );
}

interface IntegrationCatalogPanelProps {
  category: string;
  customerStatus: string;
  filteredAreas: IntegrationArea[];
  query: string;
  selectedKey: string;
  showDev: boolean;
  status: string;
  onCategoryChange: (value: string) => void;
  onCustomerStatusChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSelect: (key: IntegrationKey) => void;
  onStatusChange: (value: string) => void;
}

export function IntegrationCatalogPanel({
  category,
  customerStatus,
  filteredAreas,
  query,
  selectedKey,
  showDev,
  status,
  onCategoryChange,
  onCustomerStatusChange,
  onQueryChange,
  onSelect,
  onStatusChange,
}: IntegrationCatalogPanelProps) {
  return (
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
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search providers, systems, or modules"
          />
        </label>
        <SelectPill
          label="Category"
          value={category}
          onChange={onCategoryChange}
          options={INTEGRATION_CATEGORIES}
        />
        {showDev ? (
          <SelectPill
            label="Status"
            value={status}
            onChange={onStatusChange}
            options={INTEGRATION_STATUSES}
          />
        ) : (
          <SelectPill
            label="Readiness"
            value={customerStatus}
            onChange={onCustomerStatusChange}
            options={CUSTOMER_STATUS_FILTERS}
          />
        )}
      </div>

      <div className="integrations-card-grid">
        {filteredAreas.map((area) => (
          <IntegrationCard
            key={area.key}
            area={area}
            selected={area.key === selectedKey}
            onSelect={() => onSelect(area.key)}
            showDev={showDev}
          />
        ))}
      </div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="integrations-bullet-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function ProviderRow({
  name,
  status,
}: {
  name: string;
  status: string;
}) {
  const tone = customerIntegrationStyle(status);
  const meta = customerStatusMeta(status);
  return (
    <div className="integrations-provider-row">
      <span className="integrations-provider-name">{name}</span>
      <span
        className="integrations-provider-status"
        style={{ color: tone.color, background: tone.bg, borderColor: tone.border }}
      >
        {meta.label}
      </span>
    </div>
  );
}

interface IntegrationDetailPanelProps {
  area: IntegrationArea;
  customerLabel: string;
  projectId: string | null | undefined;
  showDev: boolean;
  style: IntegrationAccentStyle;
}

export function IntegrationDetailPanel({
  area,
  customerLabel,
  projectId,
  showDev,
  style,
}: IntegrationDetailPanelProps) {
  const Icon = AREA_ICONS[area.key] ?? Cable;
  return (
    <aside className="integrations-panel integrations-detail-panel" style={style}>
      <div className="integrations-detail-header">
        <div className="integrations-detail-icon"><Icon size={22} /></div>
        <div>
          <span>{area.category}</span>
          <h2>{area.name}</h2>
        </div>
      </div>

      <div className="integrations-status-row">
        {showDev ? (
          <>
            <span>{area.status}</span>
            <strong>{area.risk} risk</strong>
          </>
        ) : (
          <span>{customerLabel}</span>
        )}
      </div>

      {!showDev && (
        <p className="integrations-customer-summary">{area.customerSummary}</p>
      )}

      <div className="integrations-detail-section">
        <h3>{showDev ? "Systems" : "What's included"}</h3>
        {showDev ? (
          <div className="integrations-chip-list">
            {area.systems.map((system) => <span key={system}>{system}</span>)}
          </div>
        ) : (
          <div className="integrations-provider-list">
            {area.providers.map((provider) => (
              <ProviderRow
                key={provider.name}
                name={provider.name}
                status={provider.status}
              />
            ))}
          </div>
        )}
      </div>

      {showDev && (
        <>
          <div className="integrations-detail-section">
            <h3>Existing SteelBuild Surface</h3>
            <BulletList items={area.existingCapabilities} />
          </div>
          <div className="integrations-detail-section">
            <h3>Target Workflows</h3>
            <BulletList items={area.targetWorkflows} />
          </div>
          <div className="integrations-detail-section">
            <h3>Prerequisites</h3>
            <BulletList items={area.prerequisites} />
          </div>
          <div className="integrations-detail-section">
            <h3>Next Sprint</h3>
            <BulletList items={area.nextSprint} />
          </div>
        </>
      )}

      <IntegrationLiveConfiguration
        projectId={projectId}
        integrationKey={area.key}
      />
    </aside>
  );
}
