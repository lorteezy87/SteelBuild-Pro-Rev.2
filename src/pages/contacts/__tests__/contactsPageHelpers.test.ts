import { describe, expect, it } from "vitest";
import {
  filterContacts,
  computeContactStats,
  findById,
  CONTACT_TYPE_FILTER_OPTIONS,
  nextContactTypeFilter,
  contactsCommandSubtitle,
} from "../contactsPageHelpers";
import { CONTACT_TYPE } from "@/lib/enums";

describe("contactsPageHelpers", () => {
  const contacts = [
    { first_name: "Ada", last_name: "Lovelace", company: "Analytical", email: "a@x.com", role: "PE", contact_type: CONTACT_TYPE.ENGINEER },
    { first_name: "Bob", last_name: "Builder", company: "GC Co", email: "b@x.com", role: "PM", contact_type: CONTACT_TYPE.GC },
  ];

  it("filters by type and search", () => {
    expect(filterContacts(contacts, CONTACT_TYPE.ENGINEER, "").map((c) => c.first_name)).toEqual(["Ada"]);
    expect(filterContacts(contacts, "all", "gc co").map((c) => c.first_name)).toEqual(["Bob"]);
    expect(filterContacts(contacts, "all", "pe").map((c) => c.first_name)).toEqual(["Ada"]);
  });

  it("computes type stats", () => {
    const stats = computeContactStats(contacts);
    expect(stats.total).toBe(2);
    expect(stats.engineer).toBe(1);
    expect(stats.gc).toBe(1);
    expect(stats.owner).toBe(0);
  });

  it("CONTACT_TYPE_FILTER_OPTIONS starts with all then CONTACT_TYPE values", () => {
    expect(CONTACT_TYPE_FILTER_OPTIONS[0]).toBe("all");
    expect(CONTACT_TYPE_FILTER_OPTIONS).toContain(CONTACT_TYPE.ENGINEER);
    expect(CONTACT_TYPE_FILTER_OPTIONS).toContain(CONTACT_TYPE.GC);
    expect(CONTACT_TYPE_FILTER_OPTIONS.length).toBe(1 + Object.values(CONTACT_TYPE).length);
  });

  it("nextContactTypeFilter toggles active type to all", () => {
    expect(nextContactTypeFilter("all", "all")).toBe("all");
    expect(nextContactTypeFilter("Owner", "all")).toBe("all");
    expect(nextContactTypeFilter("all", "Owner")).toBe("Owner");
    expect(nextContactTypeFilter("Owner", "Owner")).toBe("all");
    expect(nextContactTypeFilter("Owner", "GC")).toBe("GC");
  });

  it("contactsCommandSubtitle appends filter when not all", () => {
    expect(contactsCommandSubtitle("all")).toBe(
      "Project directory · Owner / GC / Engineer / Subs / Suppliers / Inspectors",
    );
    expect(contactsCommandSubtitle("Owner")).toBe(
      "Project directory · Owner / GC / Engineer / Subs / Suppliers / Inspectors · filtered: Owner",
    );
  });
});

describe("findById", () => {
  it("returns matching row or null", () => {
    expect(findById([{ id: "a" }, { id: "b" }], "b")?.id).toBe("b");
    expect(findById([{ id: "a" }], null)).toBeNull();
  });
});

import { createEmptyContactFilters } from "../contactsPageHelpers";

describe("createEmptyContactFilters", () => {
  it("resets type and search", () => {
    expect(createEmptyContactFilters()).toEqual({
      filterType: "all",
      search: "",
    });
  });
});
