import { ClipboardCheck, Gauge, LayoutGrid, List } from "lucide-react";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { FAB_STAGES } from "./analytics";
import type { DrawingPackage, FabStage, FilterOption, RiskLevel } from "./types";

export const VIEW_OPTIONS: FilterOption[] = [
  { id: "flow", label: "Flow", icon: LayoutGrid },
  { id: "board", label: "Board", icon: ClipboardCheck },
  { id: "register", label: "Register", icon: List },
  { id: "hours", label: "Hours", icon: Gauge },
];

export const RISK_FILTERS: FilterOption[] = [
  { id: "all", label: "All Risk" },
  { id: "high", label: "Exceptions" },
  { id: "medium", label: "Warnings" },
  { id: "clear", label: "Clear" },
];

export const STAGE_FILTERS: FilterOption[] = [
  { id: "all", label: "All Stages" },
  ...FAB_STAGES.map((stage: FabStage) => ({ id: stage.id, label: stage.label })),
];

export const BOARD_TONE: Record<string, string> = {
  Blocked: "var(--status-error)",
  "Ready For Release": "var(--status-success)",
  Released: "var(--status-warning)",
  "In Shop": "var(--phase-fab)",
  "Ready To Ship": "var(--phase-delivery)",
};

export const STATUS_TONE: Record<string, string> = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

export const display = { fontFamily: "var(--font-display)" };
export const mono = { fontFamily: "var(--font-mono)" };

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

export function formatDate(value: string | null | undefined, fallback = "TBD"): string {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function stageMeta(stageId: string): FabStage {
  return FAB_STAGES.find((stage: FabStage) => stage.id === stageId) || FAB_STAGES[0];
}

export function stageColor(stageId: string): string {
  return stageMeta(stageId).color;
}

export function riskColor(risk: RiskLevel | string): string {
  if (risk === "high") return "var(--status-error)";
  if (risk === "medium") return "var(--status-warning)";
  return "var(--status-success)";
}

export function drawingPackageLabel(pkg: DrawingPackage): string {
  const number = formatDrawingSetNumber(pkg);
  const name = pkg.set_name || pkg.name || "Drawing package";
  return number && number !== "TBD" ? `${number} - ${name}` : name;
}
