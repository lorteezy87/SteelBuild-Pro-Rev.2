/**
 * Presentational building blocks for Integrations.
 */
// @ts-nocheck
import type { CSSProperties } from "react";
import {
  Box,
  Cable,
  CalendarDays,
  DollarSign,
  FolderOpen,
  Mail,
} from "lucide-react";
import { customerStatusMeta } from "@/lib/integrationCatalog";
import { customerToneStyle, statusStyle } from "./integrationsPageHelpers";

export const AREA_ICONS = {
  email: Mail,
  accounting: DollarSign,
  "document-storage": FolderOpen,
  scheduling: CalendarDays,
  "autodesk-bim": Box,
};

export function IntegrationCard({ area, selected, onSelect, devView }) {
  const Icon = AREA_ICONS[area.key] || Cable;
  const style = devView ? statusStyle(area.status) : customerToneStyle(area.customerStatus);
  const customerLabel = customerStatusMeta(area.customerStatus).label;
  return (
    <button
      type="button"
      className={`integrations-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      style={{ "--integration-accent": style.color, "--integration-accent-bg": style.bg, "--integration-accent-border": style.border } as CSSProperties}
    >
      <div className="integrations-card-top">
        <div className="integrations-card-icon"><Icon size={18} /></div>
        <span>{area.category}</span>
      </div>
      <strong>{area.name}</strong>
      <p>{area.shortDescription}</p>
      <div className="integrations-card-footer">
        {devView ? (
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

// A small per-provider readiness row used in the detail panel (customer view).
export function ProviderRow({ name, status }) {
  const tone = customerToneStyle(status);
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

export function Kpi({ label, value, detail, icon: Icon }) {
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

export function BulletList({ items }) {
  return (
    <ul className="integrations-bullet-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export function SelectPill({ label, value, onChange, options }) {
  return (
    <label className="integrations-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
