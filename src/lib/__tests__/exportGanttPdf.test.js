import { describe, it, expect, vi, beforeEach } from "vitest";

const textCalls = [];
const saveCalls = [];
const rectCalls = [];

vi.mock("jspdf", () => {
  class FakePdf {
    constructor() {
      this._pages = 1;
      this.internal = {
        pageSize: { getWidth: () => 1224, getHeight: () => 792 },
        getNumberOfPages: () => this._pages,
      };
    }
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setFillColor() {}
    line() {}
    rect(...args) { rectCalls.push(args); }
    getTextWidth(t) { return String(t).length * 4.2; }
    addPage() { this._pages += 1; }
    setPage() {}
    text(t) { textCalls.push(Array.isArray(t) ? t.join(" ") : String(t)); }
    save(name) { saveCalls.push(name); }
  }
  return { jsPDF: FakePdf };
});

import { buildGanttPdf, exportGanttToPdf } from "../exportGanttPdf";

const TASKS = [
  {
    id: "1",
    wbs_code: "1.1",
    phase: "Detailing",
    task_name: "Shop drawings — Level 2",
    start_date: "2026-08-03",
    end_date: "2026-08-21",
    duration: 15,
    status: "In Progress",
    percent_complete: 40,
  },
  {
    id: "2",
    wbs_code: "4.1",
    phase: "Fabrication",
    task_name: "Fab columns grid A",
    start_date: "2026-09-01",
    end_date: "2026-09-18",
    duration: 14,
    status: "Not Started",
    percent_complete: 0,
  },
];

describe("buildGanttPdf", () => {
  beforeEach(() => {
    textCalls.length = 0;
    saveCalls.length = 0;
    rectCalls.length = 0;
  });

  it("prints project title, task names, WBS, and phase headers", () => {
    buildGanttPdf({
      project: { name: "Desert Ridge", project_number: "26012" },
      tasks: TASKS,
      now: new Date(2026, 7, 30),
    });
    const blob = textCalls.join(" | ");
    expect(blob).toContain("Schedule — Desert Ridge");
    expect(blob).toContain("Project #26012");
    expect(blob).toContain("Shop drawings");
    expect(blob).toContain("Fab columns");
    expect(blob).toContain("1.1");
    expect(blob).toContain("Detailing");
    expect(blob).toContain("Fabrication");
  });

  it("throws when there are no tasks", () => {
    expect(() => buildGanttPdf({ project: { name: "Empty" }, tasks: [] })).toThrow(/no schedule tasks/i);
  });

  it("does not throw on partial task records", () => {
    expect(() => buildGanttPdf({
      tasks: [
        { task_name: "No dates", status: "Not Started" },
        { wbs_code: "9", phase: "Erection", start_date: "2026-10-01", end_date: "2026-10-10" },
      ],
    })).not.toThrow();
    expect(textCalls.join(" | ")).toContain("Installation");
  });

  it("downloads a locally dated filename", async () => {
    await exportGanttToPdf({
      project: { project_number: "26012" },
      tasks: TASKS,
      now: new Date(2026, 7, 30),
    });
    expect(saveCalls).toEqual(["schedule-26012-2026-08-30.pdf"]);
  });
});
