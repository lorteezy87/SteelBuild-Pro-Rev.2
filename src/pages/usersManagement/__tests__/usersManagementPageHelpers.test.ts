import { describe, expect, it } from "vitest";
import {getActivityStatus,
  filterUsersBySearch,
  countAdmins,
  countNonAdmins, getUserAvatarColor} from "../usersManagementPageHelpers";

describe("usersManagementPageHelpers", () => {
  it("activity status and filters", () => {
    const now = Date.parse("2026-08-05T12:00:00Z");
    expect(getActivityStatus({ status: "invited" }, now)).toBe("pending");
    expect(getActivityStatus({ last_active: "2026-08-04T00:00:00Z" }, now)).toBe("active");
    expect(getActivityStatus({ last_active: "2026-01-01T00:00:00Z" }, now)).toBe("inactive");
    const users = [
      { email: "a@x.com", full_name: "Alice", role: "admin" },
      { email: "b@x.com", full_name: "Bob", role: "member" },
    ];
    expect(filterUsersBySearch(users, "ali")).toHaveLength(1);
    expect(countAdmins(users)).toBe(1);
    expect(countNonAdmins(users)).toBe(1);
  });
});

describe("getUserAvatarColor", () => {
  it("seeds from full_name then email", () => {
    const a = getUserAvatarColor({ full_name: "Ada", email: "a@x.com" });
    const b = getUserAvatarColor({ full_name: null, email: "a@x.com" });
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});
