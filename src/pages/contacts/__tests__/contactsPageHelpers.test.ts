import { describe, expect, it } from "vitest";
import {filterContacts, computeContactStats, findById} from "../contactsPageHelpers";
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
});

describe("findById", () => {
  it("returns matching row or null", () => {
    expect(findById([{ id: "a" }, { id: "b" }], "b")?.id).toBe("b");
    expect(findById([{ id: "a" }], null)).toBeNull();
  });
});
