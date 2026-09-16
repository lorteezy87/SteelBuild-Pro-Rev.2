import { describe, expect, it } from "vitest";
import { rect } from "../geometry";
import { applyBoardAction, applyBoardActions, createBoardDoc } from "../document";
import {
  createDeliveryNode,
  createEdge,
  createNoteNode,
  createOverlay,
  createPhotoNode,
  createTaskNode,
} from "../factory";
import {
  NONE_RECORDED,
  blockedTasks,
  deliveriesOn,
  draftDailyLog,
  draftRfiFromTask,
  nodesTouchedOn,
  overdueDeliveries,
  sheetCitation,
  sheetRegion,
  tasksActiveOn,
} from "../assistant";
import type { BoardDeliveryNode, BoardDoc, BoardTaskNode } from "../types";

const DAY = "2026-03-04";
const TOUCHED = `${DAY}T15:20:00.000Z`;
const OTHER_DAY = "2026-03-01T09:00:00.000Z";

const LOG_INPUT = { date: DAY, project_name: "Copper Ridge Phase 2", prepared_by: "N. Lorteezy" };
const RFI_INPUT = { project_name: "Copper Ridge Phase 2", prepared_by: "N. Lorteezy", date: DAY, directed_to: "EOR" };

function emptyBoard(): BoardDoc {
  return createBoardDoc("board_1", "proj_1", "Bay 3", OTHER_DAY);
}

function blockedTaskBoard() {
  let doc = emptyBoard();
  const overlay = createOverlay("asset_s301", "Framing Plan", "S-301", rect(0, 0, 1000, 800), OTHER_DAY);
  const task: BoardTaskNode = {
    ...createTaskNode({ x: 0, y: 0 }, "Erect column line C", "info", TOUCHED),
    start_date: "2026-03-04",
    end_date: "2026-03-06",
    status: "In Progress",
    blocked: true,
    blocked_reason: "Embed plate at C-4 is 3 in. low of the plan dimension",
    owner: "Crew 2",
  };
  doc = applyBoardActions(
    doc,
    [
      { type: "add_overlay", overlay },
      { type: "add_node", node: task },
      { type: "pin_node", id: task.id, anchor: { overlay_id: overlay.id, u: 0.2, v: 0.8 } },
    ],
    TOUCHED,
  );
  return { doc, task, overlay };
}

describe("selection helpers", () => {
  it("finds nodes edited on a date", () => {
    let doc = emptyBoard();
    const today = createNoteNode({ x: 0, y: 0 }, "today", "neutral", TOUCHED);
    const earlier = createNoteNode({ x: 300, y: 0 }, "earlier", "neutral", OTHER_DAY);
    doc = applyBoardActions(doc, [{ type: "add_node", node: today }, { type: "add_node", node: earlier }], TOUCHED);
    expect(nodesTouchedOn(doc, DAY).map((n) => n.id)).toEqual([today.id]);
  });

  it("finds tasks whose window covers the date, inclusive of both ends", () => {
    const { doc, task } = blockedTaskBoard();
    expect(tasksActiveOn(doc, "2026-03-04").map((t) => t.id)).toEqual([task.id]);
    expect(tasksActiveOn(doc, "2026-03-06").map((t) => t.id)).toEqual([task.id]);
    expect(tasksActiveOn(doc, "2026-03-07")).toEqual([]);
  });

  it("finds blocked tasks whatever their status", () => {
    const { doc, task } = blockedTaskBoard();
    const found = blockedTasks(doc);
    expect(found.map((t) => t.id)).toEqual([task.id]);
    expect(found[0].status).toBe("In Progress");
  });
});

describe("sheet citations", () => {
  it("cites the sheet number a pin sits on", () => {
    const { doc, task } = blockedTaskBoard();
    expect(sheetCitation(doc, doc.nodes.find((n) => n.id === task.id)!)).toBe("S-301 (Framing Plan)");
  });

  it("describes where on the sheet, in words a detailer can act on", () => {
    const { doc, task } = blockedTaskBoard();
    expect(sheetRegion(doc, doc.nodes.find((n) => n.id === task.id)!)).toBe("lower left");
  });

  it("cites nothing for a node on the open canvas, rather than guessing a sheet", () => {
    let doc = emptyBoard();
    const note = createNoteNode({ x: 0, y: 0 }, "loose", "neutral", TOUCHED);
    doc = applyBoardAction(doc, { type: "add_node", node: note }, TOUCHED);
    expect(sheetCitation(doc, note)).toBeNull();
    expect(sheetRegion(doc, note)).toBeNull();
  });
});

describe("draftDailyLog", () => {
  it("says 'none recorded' for an empty section, not 'none'", () => {
    const draft = draftDailyLog(emptyBoard(), LOG_INPUT);
    expect(draft.text).toContain(NONE_RECORDED);
    // "Delays: none" would be a claim about the day the board cannot support.
    expect(draft.text).not.toMatch(/Delays \/ blockers:\s*\n\s*- none\.?$/im);
  });

  it("lists active work with its status, owner and sheet", () => {
    const { doc } = blockedTaskBoard();
    const draft = draftDailyLog(doc, LOG_INPUT);
    const work = draft.sections.find((s) => s.heading === "Work performed");
    expect(work?.lines[0]).toContain("Erect column line C");
    expect(work?.lines[0]).toContain("In Progress");
    expect(work?.lines[0]).toContain("Crew 2");
    expect(work?.lines[0]).toContain("S-301");
  });

  it("lists blockers with their reason", () => {
    const { doc } = blockedTaskBoard();
    const blockers = draftDailyLog(doc, LOG_INPUT).sections.find((s) => s.heading === "Delays / blockers");
    expect(blockers?.lines[0]).toContain("Embed plate at C-4");
  });

  it("says the reason was not recorded rather than inventing one", () => {
    let doc = emptyBoard();
    const task: BoardTaskNode = {
      ...createTaskNode({ x: 0, y: 0 }, "Set deck", "info", TOUCHED),
      blocked: true,
    };
    doc = applyBoardAction(doc, { type: "add_node", node: task }, TOUCHED);
    const blockers = draftDailyLog(doc, LOG_INPUT).sections.find((s) => s.heading === "Delays / blockers");
    expect(blockers?.lines[0]).toContain("Reason not recorded");
  });

  it("includes photos and notes touched that day, and only that day", () => {
    let doc = emptyBoard();
    const todayPhoto = createPhotoNode({ x: 0, y: 0 }, "asset_a", "Bent gusset at C-4", TOUCHED);
    const oldNote = createNoteNode({ x: 0, y: 300 }, "last week", "neutral", OTHER_DAY);
    const todayNote = createNoteNode({ x: 0, y: 600 }, "Crane down 2 hrs", "warn", TOUCHED);
    doc = applyBoardActions(
      doc,
      [
        { type: "add_node", node: todayPhoto },
        { type: "add_node", node: oldNote },
        { type: "add_node", node: todayNote },
      ],
      TOUCHED,
    );
    const draft = draftDailyLog(doc, LOG_INPUT);
    expect(draft.sections.find((s) => s.heading === "Photos logged")?.lines).toEqual(["Bent gusset at C-4"]);
    const notes = draft.sections.find((s) => s.heading === "Field notes")?.lines ?? [];
    expect(notes).toContain("Crane down 2 hrs");
    expect(notes).not.toContain("last week");
  });

  it("carries a dictated note verbatim — a daily log is a contemporaneous record", () => {
    const draft = draftDailyLog(emptyBoard(), {
      ...LOG_INPUT,
      transcript: "Grout guys never showed, moved crew to the canopy steel",
    });
    expect(draft.text).toContain('Dictated: "Grout guys never showed, moved crew to the canopy steel"');
  });

  it("heads the log with project, date and author", () => {
    const draft = draftDailyLog(emptyBoard(), LOG_INPUT);
    expect(draft.text).toContain("DAILY LOG — Copper Ridge Phase 2");
    expect(draft.text).toContain(`Date: ${DAY}`);
    expect(draft.text).toContain("Prepared by: N. Lorteezy");
  });
});

describe("deliveries in the daily log", () => {
  function deliveryBoard(overrides: Partial<BoardDeliveryNode>): BoardDoc {
    const node: BoardDeliveryNode = {
      ...createDeliveryNode({ x: 0, y: 0 }, "Anchor bolts", "Nucor", "gold", TOUCHED),
      ...overrides,
    };
    return applyBoardAction(emptyBoard(), { type: "add_node", node }, TOUCHED);
  }

  it("lists what is due that day", () => {
    const doc = deliveryBoard({ needed_by: DAY });
    expect(deliveriesOn(doc, DAY)).toHaveLength(1);
    const section = draftDailyLog(doc, LOG_INPUT).sections.find((s) => s.heading === "Material deliveries");
    expect(section?.lines).toEqual(["Anchor bolts (Nucor) — expected, not marked received"]);
  });

  it("says 'not marked received', not 'not delivered'", () => {
    // The board knows what was recorded, not what happened on the gate.
    const draft = draftDailyLog(deliveryBoard({ needed_by: DAY }), LOG_INPUT);
    expect(draft.text).toContain("not marked received");
    expect(draft.text).not.toContain("not delivered");
  });

  it("carries a past-due delivery forward until it is received", () => {
    const doc = deliveryBoard({ needed_by: "2026-03-02" });
    expect(overdueDeliveries(doc, DAY)).toHaveLength(1);
    const section = draftDailyLog(doc, LOG_INPUT).sections.find((s) => s.heading === "Material deliveries");
    expect(section?.lines).toEqual(["Anchor bolts (Nucor) — was due 2026-03-02, not received"]);
  });

  it("stops reporting one that has landed, however old", () => {
    const doc = deliveryBoard({ needed_by: "2026-03-02", received: true });
    expect(overdueDeliveries(doc, DAY)).toEqual([]);
  });

  it("reports nothing recorded when the board has no deliveries", () => {
    const section = draftDailyLog(emptyBoard(), LOG_INPUT).sections.find(
      (s) => s.heading === "Material deliveries",
    );
    expect(section?.lines).toEqual([]);
  });
});

describe("draftRfiFromTask", () => {
  it("returns null for anything that is not a blocked task", () => {
    let doc = emptyBoard();
    const note = createNoteNode({ x: 0, y: 0 }, "just a note", "neutral", TOUCHED);
    const open = createTaskNode({ x: 300, y: 0 }, "Not blocked", "info", TOUCHED);
    doc = applyBoardActions(doc, [{ type: "add_node", node: note }, { type: "add_node", node: open }], TOUCHED);
    expect(draftRfiFromTask(doc, note.id, RFI_INPUT)).toBeNull();
    expect(draftRfiFromTask(doc, open.id, RFI_INPUT)).toBeNull();
    expect(draftRfiFromTask(doc, "ghost", RFI_INPUT)).toBeNull();
  });

  it("cites the sheet and the region of it the pin sits on", () => {
    const { doc, task } = blockedTaskBoard();
    const draft = draftRfiFromTask(doc, task.id, RFI_INPUT)!;
    expect(draft.references[0]).toBe("S-301 (Framing Plan) — lower left of sheet");
    expect(draft.subject).toContain("S-301");
  });

  it("tells the sender to attach a sheet when the board cites none", () => {
    let doc = emptyBoard();
    const task: BoardTaskNode = {
      ...createTaskNode({ x: 0, y: 0 }, "Set deck", "info", TOUCHED),
      blocked: true,
      blocked_reason: "No detail for the pour stop",
    };
    doc = applyBoardAction(doc, { type: "add_node", node: task }, TOUCHED);
    const draft = draftRfiFromTask(doc, task.id, RFI_INPUT)!;
    expect(draft.references).toEqual([]);
    expect(draft.text).toMatch(/attach the applicable sheet/i);
  });

  it("puts the recorded reason in the question", () => {
    const { doc, task } = blockedTaskBoard();
    const draft = draftRfiFromTask(doc, task.id, RFI_INPUT)!;
    expect(draft.question).toContain("Embed plate at C-4 is 3 in. low");
  });

  it("pulls connected notes in as background", () => {
    const { doc, task } = blockedTaskBoard();
    const note = createNoteNode({ x: 600, y: 0 }, "Arch A-201 shows the embed 3 in. higher", "warn", TOUCHED);
    const withContext = applyBoardActions(
      doc,
      [
        { type: "add_node", node: note },
        { type: "add_edge", edge: createEdge(task.id, note.id, "relates", "", "neutral", TOUCHED) },
      ],
      TOUCHED,
    );
    const draft = draftRfiFromTask(withContext, task.id, RFI_INPUT)!;
    expect(draft.background).toContain("Arch A-201 shows the embed 3 in. higher");
  });

  it("names the downstream work the answer holds up", () => {
    const { doc, task } = blockedTaskBoard();
    const next: BoardTaskNode = {
      ...createTaskNode({ x: 600, y: 0 }, "Deck bay 3", "info", TOUCHED),
      start_date: "2026-03-09",
      end_date: "2026-03-11",
    };
    const sequenced = applyBoardActions(
      doc,
      [
        { type: "add_node", node: next },
        { type: "add_edge", edge: createEdge(task.id, next.id, "precedes", "", "neutral", TOUCHED) },
      ],
      TOUCHED,
    );
    const draft = draftRfiFromTask(sequenced, task.id, RFI_INPUT)!;
    expect(draft.impact).toContain("Deck bay 3");
    expect(draft.impact).toContain("2026-03-04 to 2026-03-06 (3 days)");
  });

  it("says the activity is unscheduled rather than implying a date", () => {
    let doc = emptyBoard();
    const task: BoardTaskNode = {
      ...createTaskNode({ x: 0, y: 0 }, "Set deck", "info", TOUCHED),
      blocked: true,
      blocked_reason: "No detail",
    };
    doc = applyBoardAction(doc, { type: "add_node", node: task }, TOUCHED);
    expect(draftRfiFromTask(doc, task.id, RFI_INPUT)!.impact).toContain("not yet scheduled");
  });

  it("leaves the suggested resolution to a person", () => {
    const { doc, task } = blockedTaskBoard();
    const draft = draftRfiFromTask(doc, task.id, RFI_INPUT)!;
    expect(draft.suggested_resolution).toBe("");
    expect(draft.text).toMatch(/to be added before sending/i);
  });

  it("addresses the draft", () => {
    const { doc, task } = blockedTaskBoard();
    const draft = draftRfiFromTask(doc, task.id, RFI_INPUT)!;
    expect(draft.text).toContain("To: EOR");
    expect(draft.text).toContain("From: N. Lorteezy");
  });
});
