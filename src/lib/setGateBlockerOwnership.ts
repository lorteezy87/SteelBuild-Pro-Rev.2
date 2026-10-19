/**
 * setGateBlockerOwnership.ts — why each `evaluate_fab_release_set` blocker
 * blocks, and which party normally clears it.
 *
 * The server decides WHETHER a set is blocked; this only explains a blocker
 * kind it already returned. An unknown kind keeps the server's title with no
 * guessed owner.
 */
export interface GateBlocker {
  kind: string;
  title: string;
}

export interface ExplainedBlocker {
  what: string;
  why: string | null;
  owner: string | null;
}

const EXPLAIN: Record<string, { why: string; owner: string | "governing" | null }> = {
  no_sheets: { why: "There are no live sheets to release", owner: "Document control" },
  no_submittal: { why: "No Shop Drawing submittal governs this set", owner: "PM" },
  not_ifc: { why: "The governing submittal is not at IFC", owner: "governing" },
  active_holds: { why: "A sheet in the set is on hold", owner: "Hold owner" },
  open_rfis: { why: "A linked RFI is still open", owner: "RFI ball in court" },
  superseded: { why: "The set contains superseded sheets", owner: "Document control" },
  no_file: { why: "A sheet has no PDF on file", owner: "Document control" },
  missing_current_revision: { why: "A sheet has no current revision record", owner: "Document control" },
  current_revision_not_distributed: { why: "The newest revision has not been distributed", owner: "PM" },
  set_revision_pending_review: { why: "The set is marked pending review", owner: "PM" },
  revision_manifest_mismatch: { why: "Approved revisions do not match the current sheets", owner: "PM" },
  missing_signoffs: { why: "The project requires fabrication sign-offs", owner: "PM" },
};

export function explainGateBlockers(
  blockers: readonly GateBlocker[] | null | undefined,
  governingBallInCourt?: string | null,
): ExplainedBlocker[] {
  return (blockers ?? []).map((b) => {
    const e = EXPLAIN[b.kind];
    if (!e) return { what: b.title, why: null, owner: null };
    const owner = e.owner === "governing" ? (governingBallInCourt?.trim() || null) : e.owner;
    return { what: b.title, why: e.why, owner };
  });
}

/**
 * Group explained blockers by the party that clears them, for panels that
 * already list the raw blockers elsewhere and need the "who" view instead.
 */
export function groupBlockersByOwner(items: readonly ExplainedBlocker[]): ExplainedBlocker[] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const key = item.owner ?? "";
    const list = groups.get(key) ?? [];
    list.push(item.what);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([owner, whats]): ExplainedBlocker => ({
    what: owner || "Owner not recorded",
    why: `${whats.length} blocker${whats.length === 1 ? "" : "s"}: ${whats.join("; ")}`,
    owner: null,
  }));
}
