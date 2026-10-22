// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ItemDetailDrawer from "../ItemDetailDrawer";

afterEach(cleanup);

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function go(item: Record<string, unknown>): string {
  render(
    <MemoryRouter initialEntries={["/CommandCenter"]}>
      <Routes>
        <Route path="*" element={<><ItemDetailDrawer item={item} onClose={() => {}} /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Go to item/i }));
  return screen.getByTestId("where").textContent ?? "";
}

describe("ItemDetailDrawer → Go to item", () => {
  it("opens the RFI itself, in its project", () => {
    expect(go({ itemType: "RFI", title: "RFI-1", projectId: "p1", raw: { id: "r1", project_id: "p1" } })).toBe("/RFIs?project=p1&id=r1");
  });

  it("uses recordId where the page reads it (submittal)", () => {
    expect(go({ itemType: "SUB", title: "S", projectId: "p1", raw: { id: "s1" } })).toBe("/Submittals?project=p1&recordId=s1");
  });

  it("uses recordId where the page reads it (change order)", () => {
    expect(go({ itemType: "CO", title: "C", projectId: "p1", raw: { id: "c1" } })).toBe("/ChangeOrders?project=p1&recordId=c1");
  });

  it("keeps a feed item's own route", () => {
    expect(go({ itemType: "DWG", title: "Set", projectId: "p1", quickAction: { route: "/DrawingSubmittalHub?hub_tab=drawings" }, raw: {} }))
      .toBe("/DrawingSubmittalHub?hub_tab=drawings");
  });
});
