import { PHASES } from "@/utils/phases";

export function normalizeSchedulePhase(value: string | null | undefined): string {
  return value && PHASES.includes(value) ? value : "all";
}
