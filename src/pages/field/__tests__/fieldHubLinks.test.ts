import { describe, expect, it } from "vitest";
import { fieldHubHref, pageOfHref } from "../fieldHubLinks";

describe("fieldHubHref", () => {
  it("maps a field register to its Field Hub tab and keeps the query", () => {
    expect(fieldHubHref("/Punchlist?id=p1")).toBe("/FieldHub?field_tab=punchlist&id=p1");
    expect(fieldHubHref("/QualityControl")).toBe("/FieldHub?field_tab=quality");
    expect(fieldHubHref("/DailyLogs?new=1")).toBe("/FieldHub?field_tab=dailylogs&new=1");
  });

  it("leaves pages outside Field Hub unchanged", () => {
    expect(fieldHubHref("/Deliveries?receive=1")).toBe("/Deliveries?receive=1");
    expect(fieldHubHref("/RFIs?id=r1")).toBe("/RFIs?id=r1");
  });

  it("reads the page name off an href", () => {
    expect(pageOfHref("/Safety?id=s1")).toBe("Safety");
    expect(pageOfHref("Photos#top")).toBe("Photos");
  });
});
