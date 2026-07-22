// @vitest-environment jsdom
/**
 * The Field Hub routed row clicks to `?id=<uuid>` but nothing ever read the
 * param, so clicking a previously-created item switched tabs and opened
 * nothing. These tests pin the read side.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { useAutoOpenEdit } from "../useAutoOpenEdit";

const ITEMS = [
  { id: "a", name: "Item A" },
  { id: "b", name: "Item B" },
];

/** Renders the hook under a router seeded at `url`, exposing the live params. */
function setup(url, records, openEdit, options) {
  const seen = { params: null };
  const wrapper = ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  const view = renderHook(
    ({ recs, opts }) => {
      const [params] = useSearchParams();
      seen.params = params;
      useAutoOpenEdit(recs, openEdit, opts);
    },
    { wrapper, initialProps: { recs: records, opts: options } },
  );
  return { ...view, seen };
}

describe("useAutoOpenEdit", () => {
  it("opens the record named by ?id= and strips the param", () => {
    const openEdit = vi.fn();
    const { seen } = setup("/punchlist?id=b", ITEMS, openEdit);
    expect(openEdit).toHaveBeenCalledTimes(1);
    expect(openEdit).toHaveBeenCalledWith({ id: "b", name: "Item B" });
    expect(seen.params.get("id")).toBeNull();
  });

  it("does nothing when there is no ?id=", () => {
    const openEdit = vi.fn();
    setup("/punchlist", ITEMS, openEdit);
    expect(openEdit).not.toHaveBeenCalled();
  });

  it("preserves other query params while stripping id", () => {
    const openEdit = vi.fn();
    const { seen } = setup("/fieldhub?field_tab=punchlist&id=a", ITEMS, openEdit);
    expect(openEdit).toHaveBeenCalledWith({ id: "a", name: "Item A" });
    expect(seen.params.get("field_tab")).toBe("punchlist");
    expect(seen.params.get("id")).toBeNull();
  });

  it("waits for the list to settle instead of consuming the param early", () => {
    const openEdit = vi.fn();
    // Records still loading: empty list, enabled=false — the id must survive.
    const { rerender, seen } = setup("/punchlist?id=b", [], openEdit, { enabled: false });
    expect(openEdit).not.toHaveBeenCalled();
    expect(seen.params.get("id")).toBe("b");

    // Query resolves.
    rerender({ recs: ITEMS, opts: { enabled: true } });
    expect(openEdit).toHaveBeenCalledTimes(1);
    expect(openEdit).toHaveBeenCalledWith({ id: "b", name: "Item B" });
    expect(seen.params.get("id")).toBeNull();
  });

  it("gives up on a stale id once the list has settled, and clears the param", () => {
    const openEdit = vi.fn();
    const { seen } = setup("/punchlist?id=deleted", ITEMS, openEdit, { enabled: true });
    expect(openEdit).not.toHaveBeenCalled();
    // Param must not linger, or the next tab would try to open it too.
    expect(seen.params.get("id")).toBeNull();
  });

  it("fires once per id even as the records array identity changes", () => {
    const openEdit = vi.fn();
    const { rerender } = setup("/punchlist?id=a", [...ITEMS], openEdit, { enabled: true });
    expect(openEdit).toHaveBeenCalledTimes(1);
    rerender({ recs: [...ITEMS], opts: { enabled: true } });
    rerender({ recs: [...ITEMS], opts: { enabled: true } });
    expect(openEdit).toHaveBeenCalledTimes(1);
  });

  it("supports a custom param name", () => {
    const openEdit = vi.fn();
    setup("/punchlist?punch=a", ITEMS, openEdit, { param: "punch" });
    expect(openEdit).toHaveBeenCalledWith({ id: "a", name: "Item A" });
  });

  it("consumes canonical recordId while preserving project scope", () => {
    const openEdit = vi.fn();
    const { seen } = setup("/RFIs?projectId=project-1&recordId=b", ITEMS, openEdit, {
      param: "recordId",
    });

    expect(openEdit).toHaveBeenCalledWith({ id: "b", name: "Item B" });
    expect(seen.params.get("projectId")).toBe("project-1");
    expect(seen.params.get("recordId")).toBeNull();
  });
});
