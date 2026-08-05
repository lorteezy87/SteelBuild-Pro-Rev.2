/** Pure helpers for Projects Health bucket board. */

export type HealthBucketKey = "On Track" | "Watch" | "At Risk" | "Unknown";

export type HealthProjectCard = {
  id: string | null | undefined;
  name: string;
  number: string;
  client: string;
  phase: string;
  targetDate: string | null | undefined;
  contractValue: number;
};

export function bucketProjectsByHealth(
  projects: Array<Record<string, any>>,
): Record<HealthBucketKey, HealthProjectCard[]> {
  const out: Record<HealthBucketKey, HealthProjectCard[]> = {
    "On Track": [],
    Watch: [],
    "At Risk": [],
    Unknown: [],
  };
  for (const p of projects || []) {
    const row: HealthProjectCard = {
      id: p.id,
      name: p.name || "Untitled Project",
      number: p.project_number || `P-${p.id}`,
      client: p.general_contractor || p.client || "",
      phase: p.phase || "",
      targetDate: p.target_completion_date,
      contractValue: Number(p.original_contract_value) || 0,
    };
    const h = p.health_status;
    if (h === "On Track" || h === "Watch" || h === "At Risk") out[h].push(row);
    else out.Unknown.push(row);
  }
  for (const arr of Object.values(out)) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

export function projectsHealthSubtitle(
  buckets: Record<HealthBucketKey, HealthProjectCard[]>,
): string {
  return `${buckets["On Track"].length} on track · ${buckets.Watch.length} watch · ${buckets["At Risk"].length} at risk · ${buckets.Unknown.length} on hold/unset`;
}
