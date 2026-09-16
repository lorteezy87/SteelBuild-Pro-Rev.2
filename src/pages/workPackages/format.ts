import { Columns3, Hammer, LayoutGrid, List, MapPinned, ShieldCheck, Truck } from "lucide-react";
import type { ComponentType } from "react";

export interface PhaseMetaEntry {
  label: string;
  short: string;
  color: string;
  icon: ComponentType<{ size?: number | string }>;
  description: string;
}

export const PHASE_META: Record<string, PhaseMetaEntry> = {
  Detailing: {
    label: "Detailing",
    short: "Detail",
    color: "var(--phase-detailing)",
    icon: ShieldCheck,
    description: "Drawings, VIF, and release readiness.",
  },
  Fabrication: {
    label: "Fabrication",
    short: "Fab",
    color: "var(--phase-fab)",
    icon: Hammer,
    description: "Shop work, labor burn, and load prep.",
  },
  Delivery: {
    label: "Delivery",
    short: "Ship",
    color: "var(--phase-delivery)",
    icon: Truck,
    description: "Loads, delivery readiness, and shipped material.",
  },
  Erection: {
    label: "Erection",
    short: "Erect",
    color: "var(--phase-erection)",
    icon: MapPinned,
    description: "Field install sequence, crew, and closeout.",
  },
};

export const STATUS_OPTIONS = ["Not Started", "In Progress", "Complete", "On Hold"];

export const STATUS_TONE: Record<string, string> = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

export interface ViewOption {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number | string }>;
}

export const VIEW_OPTIONS: ViewOption[] = [
  { id: "flow", label: "Flow", icon: Columns3 },
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "register", label: "Register", icon: List },
];

/**
 * "Focus" filter: the three risk levels plus the buckets the exception rail
 * and KPI strip count, so clicking a count filters to exactly that set
 * (the rail used to map "Drawing gaps" to plain `high`).
 */
export const RISK_FILTERS: Array<{ id: string; label: string; tone: string }> = [
  { id: "all", label: "All", tone: "var(--accent)" },
  { id: "high", label: "Exceptions", tone: "var(--status-error)" },
  { id: "medium", label: "Warnings", tone: "var(--status-warning)" },
  { id: "clear", label: "Clear", tone: "var(--status-success)" },
  { id: "drawing_gaps", label: "Drawing gaps", tone: "var(--status-warning)" },
  { id: "ready_fab", label: "Ready for fab", tone: "var(--status-success)" },
  { id: "released", label: "Released", tone: "var(--phase-fab)" },
  { id: "exception", label: "Exception release", tone: "var(--status-warning)" },
  { id: "overdue", label: "Overdue", tone: "var(--status-error)" },
];

export function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

import { normalizeTonnage } from "@/utils/projectKpis";

export function formatTons(value: unknown): string {
  return `${normalizeTonnage(value).toFixed(1)}T`;
}

export function formatHours(value: unknown): string {
  return `${Math.round(num(value)).toLocaleString()}h`;
}

export function phaseColor(phase: string): string {
  return PHASE_META[phase]?.color || "var(--accent)";
}
