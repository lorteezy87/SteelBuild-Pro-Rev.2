// @vitest-environment jsdom
// jsdom supplies DOMParser for parseMsProjectXml.

import { File as NodeFile } from "node:buffer";
import { createElement } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TextDecodingError } from "@/lib/textDecoding";
import { parseMsProjectXml } from "../mppImport";
import type { ParsedMppTask } from "../types";
import {
  readMsProjectXmlFile,
  useScheduleMutations,
  type UseScheduleMutationsParams,
} from "../useScheduleMutations";

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): an MS
// Project XML export saved as UTF-16 and read with `file.text()` (UTF-8 only)
// could put U+0000 into the task rows handleImportMpp writes.

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({ entities: {} }));
vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
  },
}));
vi.mock("../commitImportedTasks", () => ({
  commitImportedScheduleTasks: mocks.commit,
}));

const BACKSLASH = String.fromCharCode(92);
/** How JSON.stringify (and so the PostgREST body) spells U+0000. */
const NUL_ESCAPE = `${BACKSLASH}u0000`;

type Encoding = "utf8" | "utf8bom" | "utf16le" | "utf16lebom";

function encode(text: string, encoding: Encoding): Uint8Array {
  const utf8 = new TextEncoder().encode(text);
  if (encoding === "utf8") return utf8;
  if (encoding === "utf8bom") return new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
  const out: number[] = encoding === "utf16lebom" ? [0xff, 0xfe] : [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    out.push(unit & 0xff, unit >> 8);
  }
  return new Uint8Array(out);
}

// jsdom 25's File has no arrayBuffer(); Node's File is a spec Blob.
function xmlFile(bytes: Uint8Array, name = "project.xml"): File {
  return new NodeFile([bytes], name, { type: "text/xml" }) as unknown as File;
}

function hasNul(value: unknown): boolean {
  return JSON.stringify(value).includes(NUL_ESCAPE);
}

function msProjectXml(declaredEncoding: string): string {
  return [
    `<?xml version="1.0" encoding="${declaredEncoding}" standalone="yes"?>`,
    '<Project xmlns="http://schemas.microsoft.com/project">',
    "<Tasks>",
    "<Task><UID>0</UID><Name>Job 1044</Name><Summary>1</Summary><OutlineLevel>0</OutlineLevel></Task>",
    "<Task><UID>1</UID><Name>Detailing</Name><Summary>1</Summary><OutlineLevel>1</OutlineLevel>" +
      "<OutlineNumber>1</OutlineNumber><Start>2026-03-01T08:00:00</Start>" +
      "<Finish>2026-03-14T17:00:00</Finish><Duration>PT80H0M0S</Duration></Task>",
    "<Task><UID>2</UID><Name>Issue IFC</Name><Summary>0</Summary><OutlineLevel>2</OutlineLevel>" +
      "<OutlineNumber>1.1</OutlineNumber><Start>2026-03-15T08:00:00</Start>" +
      "<Finish>2026-03-16T17:00:00</Finish><Duration>PT16H0M0S</Duration>" +
      "<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type>" +
      "<LinkLag>4800</LinkLag></PredecessorLink></Task>",
    "</Tasks>",
    "</Project>",
    "",
  ].join("\r\n");
}

const TASK_NAMES = ["Detailing", "Issue IFC"];
/** Local-file-header signature of a zip container (.xlsx, .docx). */
const ZIP_BYTES = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04,
  ...new TextEncoder().encode("[Content_Types].xml"),
]);

describe("readMsProjectXmlFile text encodings", () => {
  it.each(["utf16lebom", "utf16le"] as const)(
    "decodes MS Project XML saved as %s to clean tasks",
    async (encoding) => {
      const xml = msProjectXml("UTF-16");
      const tasks = await readMsProjectXmlFile(xmlFile(encode(xml, encoding)));
      expect(hasNul(tasks)).toBe(false);
      expect(tasks.map((task) => task.name)).toEqual(TASK_NAMES);
      expect(tasks).toEqual(parseMsProjectXml(xml));
    },
  );

  it("rejects a zip container with re-save guidance", async () => {
    await expect(readMsProjectXmlFile(xmlFile(ZIP_BYTES))).rejects.toThrow(/CSV UTF-8/);
    await expect(readMsProjectXmlFile(xmlFile(ZIP_BYTES))).rejects.toBeInstanceOf(
      TextDecodingError,
    );
  });

  it("keeps plain UTF-8 and UTF-8 with a BOM unchanged", async () => {
    const xml = msProjectXml("UTF-8");
    const expected = parseMsProjectXml(xml);
    expect(expected.map((task) => task.name)).toEqual(TASK_NAMES);
    for (const encoding of ["utf8", "utf8bom"] as const) {
      expect(await readMsProjectXmlFile(xmlFile(encode(xml, encoding)))).toEqual(expected);
    }
  });
});

describe("handleImportMpp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commit.mockImplementation(async ({ tasks }: { tasks: ParsedMppTask[] }) => ({
      created: tasks.length,
    }));
  });

  function renderMutations() {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const params: UseScheduleMutationsParams = {
      projectId: "proj-1",
      qc,
      scheduleTasks: [],
      enrichedTasks: [],
      tasksWithEffective: [],
      selectedProject: null,
      selectedTask: null,
      selectedIds: new Set(),
      setSelectedTask: vi.fn(),
      setSelectedIds: vi.fn(),
      setShowDrawer: vi.fn(),
      setShowBulkAdd: vi.fn(),
      setShowBulkResource: vi.fn(),
      setShowBulkDates: vi.fn(),
      setShowBulkDuration: vi.fn(),
      setShowBulkParent: vi.fn(),
      setShowBulkDeleteConfirm: vi.fn(),
      setDeleteTarget: vi.fn(),
      setBulkResourceValue: vi.fn(),
      setBulkSaving: vi.fn(),
      setImporting: vi.fn(),
      view: "gantt",
      exportingPdf: false,
      setExportingPdf: vi.fn(),
      fileInputRef: { current: null },
    };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    return renderHook(() => useScheduleMutations(params), { wrapper }).result;
  }

  it("hands the write path clean tasks from a BOM-less UTF-16LE export", async () => {
    const result = renderMutations();
    await result.current.handleImportMpp(xmlFile(encode(msProjectXml("UTF-16"), "utf16le")));
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    const { tasks } = mocks.commit.mock.calls[0][0] as { tasks: ParsedMppTask[] };
    expect(hasNul(tasks)).toBe(false);
    expect(tasks.map((task) => task.name)).toEqual(TASK_NAMES);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported 2 tasks from project.xml");
  });

  it("shows the re-save guidance in the import toast for a zip container", async () => {
    const result = renderMutations();
    await result.current.handleImportMpp(xmlFile(ZIP_BYTES));
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(String(mocks.toastError.mock.calls[0][0])).toMatch(/CSV UTF-8/);
  });
});
