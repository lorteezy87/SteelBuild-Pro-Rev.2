import { PHASES } from "@/utils/phases";
import { bandForWidth } from "@/components/nav/useResponsiveBreakpoint";
import { viewportWidth } from "@/lib/browser";

export function normalizeSchedulePhase(value: string | null | undefined): string {
  return value && PHASES.includes(value) ? value : "all";
}

/**
 * The view the Schedule page opens in. Phones (the shell's phone band) start
 * on the Task List: the Gantt's task table is 726px wide inside panes that
 * clip, so on a phone its right side and the whole timeline are out of reach.
 * Wider screens keep the Gantt. Only the starting view; the tabs still switch.
 * Outside a browser there's no width to read, so it keeps the Gantt default.
 */
export function defaultScheduleView(width: number = viewportWidth(Number.POSITIVE_INFINITY)): "gantt" | "list" {
  return bandForWidth(width) === "phone" ? "list" : "gantt";
}
