/**
 * useTaskLinkOptions.test.js — option-mapping logic for the task LINKS tab.
 *
 * The hook just wraps these pure mappers in React Query, so pinning the
 * label/sublabel fallback rules here lets the hook's data layer be refactored
 * freely without changing what the LINKS tab renders.
 */

import { describe, it, expect, vi } from "vitest";

// The hook module imports the supabase-backed entity client at load; stub it.
vi.mock("@/api/supabaseClient", () => ({ entities: {} }));

import { toRfiOption, toChangeOrderOption, toActionItemOption } from "../useTaskLinkOptions";

describe("toRfiOption", () => {
  it("prefers rfi_number, with title as the sublabel when both exist", () => {
    expect(toRfiOption({ id: "r1", rfi_number: "RFI-001", title: "Beam clash", status: "Open" }))
      .toEqual({ id: "r1", label: "RFI-001", sublabel: "Beam clash" });
  });
  it("falls back to title, then status as sublabel when there is no rfi_number", () => {
    expect(toRfiOption({ id: "r2", title: "Only title", status: "Open" }))
      .toEqual({ id: "r2", label: "Only title", sublabel: "Open" });
  });
  it("falls back to a truncated id label and empty sublabel", () => {
    expect(toRfiOption({ id: "abcdef1234" }))
      .toEqual({ id: "abcdef1234", label: "RFI abcdef", sublabel: "" });
  });
});

describe("toChangeOrderOption", () => {
  it("prefers co_number, with title as the sublabel when both exist", () => {
    expect(toChangeOrderOption({ id: "c1", co_number: "CO-12", title: "Extra steel", status: "Pending" }))
      .toEqual({ id: "c1", label: "CO-12", sublabel: "Extra steel" });
  });
  it("falls back to a truncated id label and uses status as sublabel", () => {
    expect(toChangeOrderOption({ id: "c2abcdef", status: "Approved" }))
      .toEqual({ id: "c2abcdef", label: "CO c2abcd", sublabel: "Approved" });
  });
});

describe("toActionItemOption", () => {
  it("prefers the title and uses status as sublabel", () => {
    expect(toActionItemOption({ id: "a1", title: "Call GC", status: "Open" }))
      .toEqual({ id: "a1", label: "Call GC", sublabel: "Open" });
  });
  it("falls back to a 40-char description slice", () => {
    const description = "A very long description that exceeds forty characters easily";
    const opt = toActionItemOption({ id: "a2", description, status: "Done" });
    expect(opt.label).toBe(description.slice(0, 40));
    expect(opt.label.length).toBe(40);
    expect(opt.sublabel).toBe("Done");
  });
  it("falls back to a truncated id label with empty sublabel", () => {
    expect(toActionItemOption({ id: "a3xxxxxx" }))
      .toEqual({ id: "a3xxxxxx", label: "Item a3xxxx", sublabel: "" });
  });
});
