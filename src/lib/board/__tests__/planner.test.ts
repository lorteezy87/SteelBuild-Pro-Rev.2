import { describe, expect, it } from "vitest";
import { applyBoardAction, applyBoardActions, createBoardDoc } from "../document";
import { createDeliveryNode, createNoteNode, createOverlay, createTaskNode } from "../factory";
import { rect } from "../geometry";
import {
  DEFAULT_PLANNER_DAYS,
  UNASSIGNED_OWNER,
  assignmentActions,
  buildPlannerGrid,
  knownOwners,
  plannerDays,
  plannerLoad,
  plannerOwner,
  plannerWeekStart,
  toPlannerItem,
} from "../planner";
import type { BoardDeliveryNode, BoardDoc, BoardTaskNode } from "../types";

const T0 = "2026-03-02T08:00:00.000Z";
/** 2026-03-09 is a Monday. */
const MONDAY = "2026-03-09";

function task(text: string, overrides: Partial<BoardTaskNode> = {}): BoardTaskNode {
  return { ...createTaskNode({ x: 0, y: 0 }, text, "info", T0), ...overrides };
}

function delivery(material: string, overrides: Partial<BoardDeliveryNode> = {}): BoardDeliveryNode {
  return { ...createDeliveryNode({ x: 0, y: 0 }, material, "", "gold", T0), ...overrides };
}

function boardWith(nodes: Array<BoardTaskNode | BoardDeliveryNode>): BoardDoc {
  return applyBoardActions(
    createBoardDoc("board_1", "proj_1", "Plan", T0),
    nodes.map((node) => ({ type: "add_node" as const, node })),
    T0,
  );
}

describe("plannerWeekStart", () => {
  it("returns the Monday of the week", () => {
    expect(plannerWeekStart("2026-03-09")).toBe("2026-03-09"); // Monday
    expect(plannerWeekStart("2026-03-13")).toBe("2026-03-09"); // Friday
    // Sunday belongs to the week that started six days earlier, not the next one.
    expect(plannerWeekStart("2026-03-15")).toBe("2026-03-09");
    expect(plannerWeekStart("2026-03-16")).toBe("2026-03-16"); // next Monday
  });

  it("is null for an unparseable date", () => {
    expect(plannerWeekStart("nope")).toBeNull();
  });
});

describe("plannerDays", () => {
  it("labels each column and marks the weekend", () => {
    const days = plannerDays(MONDAY, 7);
    expect(days.map((d) => d.label)).toEqual([
      "Mon 9",
      "Tue 10",
      "Wed 11",
      "Thu 12",
      "Fri 13",
      "Sat 14",
      "Sun 15",
    ]);
    expect(days.filter((d) => d.weekend).map((d) => d.iso)).toEqual(["2026-03-14", "2026-03-15"]);
  });

  it("defaults to a two-week look-ahead", () => {
    expect(plannerDays(MONDAY)).toHaveLength(DEFAULT_PLANNER_DAYS);
  });

  it("returns nothing for a non-positive count", () => {
    expect(plannerDays(MONDAY, 0)).toEqual([]);
    expect(plannerDays(MONDAY, -3)).toEqual([]);
  });
});

describe("plannerOwner", () => {
  it("reads a crew from a task and a vendor from a delivery", () => {
    expect(plannerOwner(task("Erect", { owner: " Crew 2 " }))).toBe("Crew 2");
    expect(plannerOwner(delivery("HSS", { vendor: "Nucor" }))).toBe("Nucor");
  });

  it("is empty for a card that has no owner concept", () => {
    expect(plannerOwner(createNoteNode({ x: 0, y: 0 }, "note", "neutral", T0))).toBe("");
  });
});

describe("toPlannerItem", () => {
  it("gives a delivery the same day at both ends — it lands, it does not span", () => {
    const doc = boardWith([delivery("Anchor bolts", { needed_by: "2026-03-10" })]);
    const item = toPlannerItem(doc, doc.nodes[0]);
    expect(item?.start_date).toBe("2026-03-10");
    expect(item?.end_date).toBe("2026-03-10");
  });

  it("is null for a card the planner has no business scheduling", () => {
    const doc = applyBoardAction(
      createBoardDoc("b", "p", "n", T0),
      { type: "add_node", node: createNoteNode({ x: 0, y: 0 }, "note", "neutral", T0) },
      T0,
    );
    expect(toPlannerItem(doc, doc.nodes[0])).toBeNull();
  });

  it("carries the sheet a pinned card sits on", () => {
    const overlay = createOverlay("asset_1", "Framing Plan", "S-301", rect(0, 0, 1000, 800), T0);
    const erect = task("Erect", { start_date: "2026-03-09", end_date: "2026-03-09" });
    const doc = applyBoardActions(
      createBoardDoc("b", "p", "n", T0),
      [
        { type: "add_overlay", overlay },
        { type: "add_node", node: erect },
        { type: "pin_node", id: erect.id, anchor: { overlay_id: overlay.id, u: 0.5, v: 0.5 } },
      ],
      T0,
    );
    expect(toPlannerItem(doc, doc.nodes[0])?.sheet).toBe("S-301");
  });
});

describe("buildPlannerGrid", () => {
  it("spreads a task across every day of its window", () => {
    const doc = boardWith([
      task("Erect", { owner: "Crew 2", start_date: "2026-03-10", end_date: "2026-03-12" }),
    ]);
    const grid = buildPlannerGrid(doc, MONDAY, 7);
    const row = grid.rows.find((r) => r.owner === "Crew 2");
    expect(row?.cells.map((cell) => cell.length)).toEqual([0, 1, 1, 1, 0, 0, 0]);
  });

  it("puts a delivery on exactly one day", () => {
    const doc = boardWith([delivery("Anchor bolts", { vendor: "Nucor", needed_by: "2026-03-11" })]);
    const grid = buildPlannerGrid(doc, MONDAY, 7);
    const row = grid.rows.find((r) => r.owner === "Nucor");
    expect(row?.cells.map((cell) => cell.length)).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });

  it("keeps an undated card in the tray rather than dropping it on today", () => {
    const doc = boardWith([task("Erect", { owner: "Crew 2" }), delivery("HSS", { vendor: "Nucor" })]);
    const grid = buildPlannerGrid(doc, MONDAY, 7);
    expect(grid.unassigned.map((i) => i.label)).toEqual(["Erect", "HSS — Nucor"]);
    expect(grid.rows).toEqual([]);
  });

  it("gives dated work with nobody's name on it its own row, last", () => {
    const doc = boardWith([
      task("Erect", { owner: "Crew 2", start_date: "2026-03-10", end_date: "2026-03-10" }),
      task("Grout", { start_date: "2026-03-11", end_date: "2026-03-11" }),
    ]);
    const grid = buildPlannerGrid(doc, MONDAY, 7);
    expect(grid.rows.map((r) => r.owner)).toEqual(["Crew 2", UNASSIGNED_OWNER]);
  });

  it("sorts owner rows alphabetically", () => {
    const doc = boardWith([
      task("A", { owner: "Zeta Erectors", start_date: MONDAY, end_date: MONDAY }),
      task("B", { owner: "Alpha Crane", start_date: MONDAY, end_date: MONDAY }),
    ]);
    expect(buildPlannerGrid(doc, MONDAY, 7).rows.map((r) => r.owner)).toEqual([
      "Alpha Crane",
      "Zeta Erectors",
    ]);
  });

  it("gives no row to an owner whose work all falls outside the window", () => {
    const doc = boardWith([
      task("Later", { owner: "Crew 9", start_date: "2026-05-01", end_date: "2026-05-02" }),
    ]);
    const grid = buildPlannerGrid(doc, MONDAY, 7);
    expect(grid.rows).toEqual([]);
    // Dated but off-window is not "needs a date", so it does not fall into the tray.
    expect(grid.unassigned).toEqual([]);
  });

  it("clips a window that overlaps the edge of the view", () => {
    const doc = boardWith([
      task("Long", { owner: "Crew 2", start_date: "2026-03-05", end_date: "2026-03-11" }),
    ]);
    const grid = buildPlannerGrid(doc, MONDAY, 7);
    const row = grid.rows.find((r) => r.owner === "Crew 2");
    expect(row?.cells.map((cell) => cell.length)).toEqual([1, 1, 1, 0, 0, 0, 0]);
  });

  it("places nothing for an inverted window", () => {
    const doc = boardWith([
      task("Broken", { owner: "Crew 2", start_date: "2026-03-12", end_date: "2026-03-10" }),
    ]);
    const grid = buildPlannerGrid(doc, MONDAY, 7);
    expect(grid.rows).toEqual([]);
  });

  it("stacks two crews' work on the same day without merging them", () => {
    const doc = boardWith([
      task("Erect", { owner: "Crew 2", start_date: MONDAY, end_date: MONDAY }),
      task("Deck", { owner: "Crew 3", start_date: MONDAY, end_date: MONDAY }),
      delivery("Bolts", { vendor: "Crew 2", needed_by: MONDAY }),
    ]);
    const grid = buildPlannerGrid(doc, MONDAY, 7);
    expect(grid.rows.find((r) => r.owner === "Crew 2")?.cells[0]).toHaveLength(2);
    expect(grid.rows.find((r) => r.owner === "Crew 3")?.cells[0]).toHaveLength(1);
  });
});

describe("assignmentActions", () => {
  it("moves a dated task to start on the dropped day, keeping its duration", () => {
    const erect = task("Erect", { owner: "Crew 2", start_date: "2026-03-09", end_date: "2026-03-13" });
    const doc = boardWith([erect]);
    const [action] = assignmentActions(doc, erect.id, "Crew 5", "2026-03-16");
    expect(action).toEqual({
      type: "update_task",
      id: erect.id,
      // Five inclusive days, moved whole.
      patch: { start_date: "2026-03-16", end_date: "2026-03-20", owner: "Crew 5" },
    });
  });

  it("schedules an undated task as one day — the drop said when, not how long", () => {
    const erect = task("Erect");
    const doc = boardWith([erect]);
    const [action] = assignmentActions(doc, erect.id, "Crew 2", MONDAY);
    expect(action).toEqual({
      type: "update_task",
      id: erect.id,
      patch: { start_date: MONDAY, end_date: MONDAY, owner: "Crew 2" },
    });
  });

  it("sets a delivery's date and vendor", () => {
    const bolts = delivery("Anchor bolts");
    const doc = boardWith([bolts]);
    const [action] = assignmentActions(doc, bolts.id, "Nucor", MONDAY);
    expect(action).toEqual({
      type: "update_delivery",
      id: bolts.id,
      patch: { needed_by: MONDAY, vendor: "Nucor" },
    });
  });

  it("assigns to the unowned row without inventing a name", () => {
    const erect = task("Erect", { owner: "Crew 2" });
    const doc = boardWith([erect]);
    const [action] = assignmentActions(doc, erect.id, UNASSIGNED_OWNER, MONDAY);
    expect(action?.type === "update_task" && action.patch.owner).toBe("");
  });

  it("does nothing for an unknown node or an unparseable day", () => {
    const erect = task("Erect");
    const doc = boardWith([erect]);
    expect(assignmentActions(doc, "ghost", "Crew 2", MONDAY)).toEqual([]);
    expect(assignmentActions(doc, erect.id, "Crew 2", "not-a-date")).toEqual([]);
  });

  it("does nothing for a card the planner cannot schedule", () => {
    const note = createNoteNode({ x: 0, y: 0 }, "note", "neutral", T0);
    const doc = applyBoardAction(createBoardDoc("b", "p", "n", T0), { type: "add_node", node: note }, T0);
    expect(assignmentActions(doc, note.id, "Crew 2", MONDAY)).toEqual([]);
  });

  it("round-trips through the reducer", () => {
    const bolts = delivery("Anchor bolts");
    let doc = boardWith([bolts]);
    doc = applyBoardActions(doc, assignmentActions(doc, bolts.id, "Nucor", MONDAY), T0);
    const grid = buildPlannerGrid(doc, MONDAY, 7);
    expect(grid.unassigned).toEqual([]);
    expect(grid.rows.find((r) => r.owner === "Nucor")?.cells[0]).toHaveLength(1);
  });
});

describe("knownOwners", () => {
  it("lists every crew and vendor on the board, once, sorted", () => {
    const doc = boardWith([
      task("A", { owner: "Crew 2" }),
      task("B", { owner: "Crew 2" }),
      delivery("C", { vendor: "Nucor" }),
      task("D"),
    ]);
    expect(knownOwners(doc)).toEqual(["Crew 2", "Nucor"]);
  });
});

describe("plannerLoad", () => {
  it("counts the days an owner is committed, not the number of cards", () => {
    const doc = boardWith([
      task("Erect", { owner: "Crew 2", start_date: "2026-03-09", end_date: "2026-03-11" }),
      task("Deck", { owner: "Crew 2", start_date: "2026-03-10", end_date: "2026-03-10" }),
    ]);
    const load = plannerLoad(buildPlannerGrid(doc, MONDAY, 7), MONDAY);
    expect(load[0]).toMatchObject({ owner: "Crew 2", committed_days: 3 });
  });

  it("flags a blocked task", () => {
    const doc = boardWith([
      task("Erect", { owner: "Crew 2", start_date: MONDAY, end_date: MONDAY, blocked: true }),
    ]);
    const load = plannerLoad(buildPlannerGrid(doc, MONDAY, 7), MONDAY);
    expect(load[0].attention.map((i) => i.label)).toEqual(["Erect"]);
  });

  it("flags a delivery only when it is both past due and not received", () => {
    const doc = boardWith([
      delivery("Late", { vendor: "Nucor", needed_by: "2026-03-09" }),
      delivery("Landed", { vendor: "Nucor", needed_by: "2026-03-09", received: true }),
      delivery("Upcoming", { vendor: "Nucor", needed_by: "2026-03-13" }),
    ]);
    const load = plannerLoad(buildPlannerGrid(doc, MONDAY, 7), "2026-03-11");
    expect(load[0].attention.map((i) => i.label)).toEqual(["Late — Nucor"]);
  });

  it("counts a multi-day task once in attention, not once per day", () => {
    const doc = boardWith([
      task("Erect", { owner: "Crew 2", start_date: "2026-03-09", end_date: "2026-03-13", blocked: true }),
    ]);
    const load = plannerLoad(buildPlannerGrid(doc, MONDAY, 7), MONDAY);
    expect(load[0].attention).toHaveLength(1);
  });
});
