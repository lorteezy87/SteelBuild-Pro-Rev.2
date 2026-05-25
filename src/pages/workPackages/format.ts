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

export const RISK_FILTERS = [
  { id: "all", label: "All" },
  { id: "high", label: "Exceptions" },
  { id: "medium", label: "Warnings" },
  { id: "clear", label: "Clear" },
];

export function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatTons(value: unknown): string {
  return `${num(value).toFixed(1)}T`;
}

export function formatHours(value: unknown): string {
  return `${Math.round(num(value)).toLocaleString()}h`;
}

export function phaseColor(phase: string): string {
  return PHASE_META[phase]?.color || "var(--accent)";
}
