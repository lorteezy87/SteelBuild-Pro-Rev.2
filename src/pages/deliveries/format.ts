import type { CSSProperties } from "react";
import { CalendarDays, LayoutGrid, List } from "lucide-react";
import type { DeliveryRecord, FilterOption } from "./types";

export const VIEW_OPTIONS: FilterOption[] = [
  { id: "dispatch", label: "Dispatch", icon: LayoutGrid },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "register", label: "Register", icon: List },
];

export const LANE_ORDER = ["Exceptions", "Scheduled", "Loading", "In Transit", "Delivered"];

export const SCHEDULE_FILTERS: FilterOption[] = [
  { id: "all", label: "All Loads" },
  { id: "late", label: "Late" },
  { id: "today", label: "Today" },
  { id: "week", label: "7 Days" },
  { id: "ready", label: "Ready" },
  { id: "unscheduled", label: "No Date" },
  { id: "longLead", label: "Long Lead" },
];

export const RISK_FILTERS: FilterOption[] = [
  { id: "all", label: "All Risk" },
  { id: "high", label: "Exceptions" },
  { id: "medium", label: "Warnings" },
  { id: "clear", label: "Clear" },
];

export const STATUS_COLOR: Record<string, string> = {
  Scheduled: "var(--status-info)",
  Loading: "var(--status-warning)",
  "In Transit": "var(--phase-delivery)",
  Delivered: "var(--status-success)",
  Partial: "var(--status-warning)",
  Delayed: "var(--status-error)",
  Rejected: "var(--status-error)",
  Exceptions: "var(--status-error)",
};

export const display: CSSProperties = { fontFamily: "var(--font-display)" };
export const mono: CSSProperties = { fontFamily: "var(--font-mono)" };

export function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function dateValue(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: unknown, fallback = "TBD"): string {
  const parsed = dateValue(value);
  if (!parsed) return fallback;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatTons(value: unknown): string {
  return `${num(value).toFixed(1)}T`;
}

export function formatPieces(value: unknown): string {
  const pieces = num(value);
  return pieces ? pieces.toLocaleString() : "0";
}

export function riskColor(risk: string): string {
  if (risk === "high") return "var(--status-error)";
  if (risk === "medium") return "var(--status-warning)";
  return "var(--status-success)";
}

export function mergeDeliveryLists(...lists: Array<DeliveryRecord[] | undefined>): DeliveryRecord[] {
  const seen = new Set<string>();
  const merged: DeliveryRecord[] = [];
  for (const list of lists) {
    for (const delivery of list || []) {
      const key =
        (delivery.id as string) ||
        [delivery.delivery_number, delivery.load_number, delivery.po_number, delivery.description]
          .filter(Boolean)
          .join(":");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(delivery);
    }
  }
  return merged;
}
