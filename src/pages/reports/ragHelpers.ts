/** Pure helpers for RAG (Red/Amber/Green) project grid. */

export const RAG_RANK: Record<string, number> = {
  "At Risk": 0,
  Watch: 1,
  "On Track": 2,
  "On Hold": 3,
  Unknown: 4,
};

export const RAG_LABEL: Record<string, string> = {
  "At Risk": "RED",
  Watch: "AMBER",
  "On Track": "GREEN",
  "On Hold": "HOLD",
  Unknown: "—",
};

export function ragBucket(status: string | null | undefined): string {
  if (
    status === "On Track" ||
    status === "Watch" ||
    status === "At Risk" ||
    status === "On Hold"
  ) {
    return status;
  }
  return "Unknown";
}

export type RagCard = {
  id: string | null | undefined;
  name: string;
  number: string;
  client: string;
  phase: string;
  bucket: string;
  targetDate: string | null | undefined;
  contractValue: number;
};

export function buildRagCards(
  projects: Array<{
    id?: string | null;
    name?: string | null;
    project_number?: string | null;
    general_contractor?: string | null;
    client?: string | null;
    phase?: string | null;
    health_status?: string | null;
    target_completion_date?: string | null;
    original_contract_value?: number | string | null;
  }>,
): RagCard[] {
  return (projects || [])
    .map((p) => ({
      id: p.id,
      name: p.name || "Untitled Project",
      number: p.project_number || `P-${p.id}`,
      client: p.general_contractor || p.client || "",
      phase: p.phase || "",
      bucket: ragBucket(p.health_status),
      targetDate: p.target_completion_date,
      contractValue: Number(p.original_contract_value) || 0,
    }))
    .sort((a, b) => {
      const ra = RAG_RANK[a.bucket] ?? 99;
      const rb = RAG_RANK[b.bucket] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
}

export function countRagBuckets(cards: RagCard[]): Record<string, number> {
  const c: Record<string, number> = {
    "At Risk": 0,
    Watch: 0,
    "On Track": 0,
    "On Hold": 0,
    Unknown: 0,
  };
  for (const card of cards || []) {
    c[card.bucket] = (c[card.bucket] || 0) + 1;
  }
  return c;
}
