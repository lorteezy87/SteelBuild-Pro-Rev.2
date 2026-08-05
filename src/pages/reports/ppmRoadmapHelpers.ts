/** Pure helpers for PPM Roadmap (portfolio project bands). */

export { quartersBetween } from "./roadmapHelpers";

export type PpmProjectBand = {
  id: string | null | undefined;
  name?: string | null;
  project_number?: string | null;
  phase?: string | null;
  health_status?: string | null;
  start_date: string;
  target_completion_date: string;
  startTs: number;
  endTs: number;
  [key: string]: unknown;
};

export function buildPpmProjectBands(
  projects: Array<Record<string, any>> = [],
  phaseFilter = "all",
): PpmProjectBand[] {
  return (projects || [])
    .filter((p) => p.start_date && p.target_completion_date)
    .filter((p) => phaseFilter === "all" || p.phase === phaseFilter)
    .map((p) => ({
      ...p,
      startTs: new Date(p.start_date).getTime(),
      endTs: new Date(p.target_completion_date).getTime(),
    }))
    .sort((a, b) => a.startTs - b.startTs);
}

export function ppmDateRange(bands: PpmProjectBand[]): {
  rangeStart: Date | null;
  rangeEnd: Date | null;
} {
  if (!bands?.length) return { rangeStart: null, rangeEnd: null };
  return {
    rangeStart: new Date(Math.min(...bands.map((p) => p.startTs))),
    rangeEnd: new Date(Math.max(...bands.map((p) => p.endTs))),
  };
}

export function ppmXFor(input: {
  ts: number;
  rangeStart: Date | null;
  totalMs: number;
  leftGutter: number;
  innerW: number;
}): number {
  if (!input.totalMs || !input.rangeStart) return input.leftGutter;
  return (
    input.leftGutter +
    ((input.ts - input.rangeStart.getTime()) / input.totalMs) * input.innerW
  );
}

export function truncateProjectName(name: string | null | undefined, max = 24): string {
  const n = name || "—";
  return n.length > max ? n.slice(0, max) + "…" : n;
}
