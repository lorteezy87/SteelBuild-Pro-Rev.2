import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  submittals: vi.fn(),
  rounds: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Submittal: { filter: reads.submittals },
    SubmittalRound: { filter: reads.rounds },
  },
}));

import {
  fetchSubmittalRounds,
  fetchSubmittals,
  groupSubmittalRounds,
  groupSubmittalsByStatus,
  selectOverdueSubmittals,
  summarizeDrawingSets,
  summarizeSubmittalKpis,
} from "../queries";
import type { Submittal } from "../types";

describe("submittal query helpers", () => {
  beforeEach(() => {
    reads.submittals.mockReset();
    reads.rounds.mockReset();
  });

  it("keeps project scope, ordering, and row limits on both reads", async () => {
    reads.submittals.mockResolvedValue([]);
    reads.rounds.mockResolvedValue([]);

    await fetchSubmittals("project-1");
    await fetchSubmittalRounds("project-1");

    expect(reads.submittals).toHaveBeenCalledWith(
      { project_id: "project-1" },
      "-submitted_date",
      2000,
    );
    expect(reads.rounds).toHaveBeenCalledWith(
      { project_id: "project-1" },
      "-round_number",
      2000,
    );
  });

  it("groups rounds in cycle order and omits unscoped rows", () => {
    const grouped = groupSubmittalRounds([
      { id: "r2", submittal_id: "s1", round_number: 2 },
      { id: "orphan", round_number: 3 },
      { id: "r1", submittal_id: "s1", round_number: 1 },
    ]);

    expect(grouped.s1.map((round) => round.id)).toEqual(["r1", "r2"]);
    expect(grouped).not.toHaveProperty("undefined");
  });

  it("preserves status, drawing-set, overdue, and KPI derivations", () => {
    const rows = [
      {
        id: "draft",
        status: null,
        drawing_set_ids: ["set-1"],
        required_date: "2026-01-01",
      },
      {
        id: "pending",
        status: "Submitted",
        drawing_set_ids: ["set-1", "set-2"],
        required_date: "2027-01-01",
      },
      {
        id: "approved",
        status: "Approved as Noted",
        drawing_set_ids: ["set-2"],
        required_date: "2026-01-01",
      },
      {
        id: "rejected",
        status: "Revise and Resubmit",
        drawing_set_ids: null,
      },
    ] as Submittal[];

    const byStatus = groupSubmittalsByStatus(rows);
    const byDrawingSet = summarizeDrawingSets(rows);
    const overdue = selectOverdueSubmittals(
      rows,
      new Date("2026-06-01T00:00:00Z"),
    );

    expect(byStatus.Draft.map((row) => row.id)).toEqual(["draft"]);
    expect(byDrawingSet).toEqual({
      "set-1": { total: 2, open: 1 },
      "set-2": { total: 2, open: 1 },
    });
    expect(overdue.map((row) => row.id)).toEqual(["draft"]);
    expect(summarizeSubmittalKpis(rows, overdue.length)).toEqual({
      total: 4,
      pending: 1,
      approved: 1,
      rejected: 1,
      overdue: 1,
    });
  });
});
