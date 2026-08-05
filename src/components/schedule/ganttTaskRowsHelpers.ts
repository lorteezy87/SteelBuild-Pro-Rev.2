/**
 * Pure chrome constants for GanttTaskRows (left panel + timeline rows).
 */
import {
  GANTT_PHASE_VAR,
  GANTT_STATUS_HEX,
} from "@/lib/ganttTheme";

export const DELIVERY_STATUS_DOT: Record<string, string> = {
  Scheduled: GANTT_PHASE_VAR.Procurement,
  "In Transit": GANTT_STATUS_HEX.inProgress,
  Delivered: GANTT_STATUS_HEX.complete,
  Partial: GANTT_STATUS_HEX.delayed,
  Rejected: GANTT_STATUS_HEX.delayed,
  Delayed: GANTT_STATUS_HEX.delayed,
};

export const DETAILING_STAGES = ["IFA", "OFA", "BFA", "OFS", "IFC", "Released"] as const;

/** Optional stage label overrides (empty = show stage code). */
export const STAGE_DISPLAY: Record<string, string> = {};

export function tintColor(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
