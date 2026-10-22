import { describe, expect, it } from "vitest";
import { searchResultHref } from "../searchResultHref";

describe("searchResultHref", () => {
  it("opens record hits on the record, in the record's project", () => {
    expect(searchResultHref({ type: "RFI", id: "r1", page: "RFIs", projectId: "p2" })).toBe("/RFIs?id=r1&projectId=p2");
    expect(searchResultHref({ type: "ChangeOrder", id: "c1", page: "ChangeOrders", projectId: "p2" })).toBe("/ChangeOrders?recordId=c1&projectId=p2");
    expect(searchResultHref({ type: "WorkPackage", id: "w1", page: "WorkPackages", projectId: "p2" })).toBe("/WorkPackages?id=w1&projectId=p2");
    expect(searchResultHref({ type: "Project", id: "p2", page: "Projects", projectId: "p2" })).toBe("/Projects?recordId=p2");
  });

  it("opens a drawing hit in the drawing viewer, not Documents", () => {
    expect(searchResultHref({ type: "Drawing", id: "d1", page: "Documents", projectId: "p2" })).toBe("/DrawingViewer?recordId=d1&projectId=p2");
  });

  it("keeps module quick-nav and unmapped types on their page", () => {
    expect(searchResultHref({ type: "Module", id: "RFIs", page: "RFIs" })).toBe("/RFIs");
    expect(searchResultHref({ type: "Contact", id: "x", page: "Contacts" })).toBe("/Contacts");
  });
});
