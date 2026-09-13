import type { CSSProperties } from "react";

import {
  INTEGRATION_AREAS,
  customerIntegrationSummary,
  customerStatusMeta,
  filterByCustomerStatus,
  filterIntegrations,
  getIntegrationByKey,
  integrationSummary,
  type CustomerTone,
  type IntegrationKey,
  type IntegrationStatus,
} from "@/lib/integrationCatalog";

export type IntegrationConfigurationKind = Extract<
  IntegrationKey,
  "email" | "document-storage"
>;

export interface IntegrationPageFilters {
  category: string;
  status: string;
  customerStatus: string;
  query: string;
}

export interface IntegrationToneStyle {
  color: string;
  bg: string;
  border: string;
}

export type IntegrationAccentStyle = CSSProperties & {
  "--integration-accent"?: string;
  "--integration-accent-bg"?: string;
  "--integration-accent-border"?: string;
  "--detail-accent"?: string;
  "--detail-bg"?: string;
  "--detail-border"?: string;
};

const STATUS_STYLES: Record<IntegrationStatus, IntegrationToneStyle> = {
  "Partially Live": {
    color: "var(--success)",
    bg: "var(--success-muted)",
    border: "var(--success-border)",
  },
  Planned: {
    color: "var(--warning)",
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
  },
  "Adapter Required": {
    color: "var(--info)",
    bg: "var(--info-muted)",
    border: "var(--info-border)",
  },
};

const CUSTOMER_TONE_STYLES: Record<CustomerTone, IntegrationToneStyle> = {
  success: {
    color: "var(--success)",
    bg: "var(--success-muted)",
    border: "var(--success-border)",
  },
  info: {
    color: "var(--info)",
    bg: "var(--info-muted)",
    border: "var(--info-border)",
  },
  warning: {
    color: "var(--warning)",
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
  },
  muted: {
    color: "var(--text-muted)",
    bg: "var(--bg-surface-high)",
    border: "var(--border-default)",
  },
};

export function integrationStatusStyle(status: IntegrationStatus): IntegrationToneStyle {
  return STATUS_STYLES[status] ?? STATUS_STYLES.Planned;
}

export function customerIntegrationStyle(statusKey: string): IntegrationToneStyle {
  return CUSTOMER_TONE_STYLES[customerStatusMeta(statusKey).tone];
}

export function integrationCardAccentStyle(
  status: IntegrationStatus,
  customerStatus: string,
  showDev: boolean,
): IntegrationAccentStyle {
  const tone = showDev
    ? integrationStatusStyle(status)
    : customerIntegrationStyle(customerStatus);
  return {
    "--integration-accent": tone.color,
    "--integration-accent-bg": tone.bg,
    "--integration-accent-border": tone.border,
  };
}

export function integrationDetailAccentStyle(
  status: IntegrationStatus,
  customerStatus: string,
  showDev: boolean,
): IntegrationAccentStyle {
  const tone = showDev
    ? integrationStatusStyle(status)
    : customerIntegrationStyle(customerStatus);
  return {
    "--detail-accent": tone.color,
    "--detail-bg": tone.bg,
    "--detail-border": tone.border,
  };
}

export function deriveIntegrationPageModel({
  filters,
  selectedKey,
  showDev,
}: {
  filters: IntegrationPageFilters;
  selectedKey: string;
  showDev: boolean;
}) {
  const byText = filterIntegrations({
    category: filters.category,
    status: showDev ? filters.status : "All",
    query: filters.query,
  });
  const selectedArea = getIntegrationByKey(selectedKey);

  return {
    filteredAreas: showDev
      ? byText
      : filterByCustomerStatus(byText, filters.customerStatus),
    selectedArea,
    selectedCustomerLabel: customerStatusMeta(selectedArea.customerStatus).label,
    selectedStyle: integrationDetailAccentStyle(
      selectedArea.status,
      selectedArea.customerStatus,
      showDev,
    ),
    devSummary: integrationSummary(INTEGRATION_AREAS),
    customerSummary: customerIntegrationSummary(INTEGRATION_AREAS),
  };
}

export function resolveIntegrationConfiguration(
  projectId: string | null | undefined,
  integrationKey: string,
): IntegrationConfigurationKind | null {
  if (!projectId) return null;
  if (integrationKey === "email" || integrationKey === "document-storage") {
    return integrationKey;
  }
  return null;
}
