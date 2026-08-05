import { describe, it, expect } from "vitest";
import { landingForRole } from "@/lib/landingForRole";

describe("landingForRole", () => {
  it("sends field users to Field Today", () => {
    expect(landingForRole("field", true)).toBe("FieldToday");
  });

  it("sends pm / admin / owner to the Detailing Control Center", () => {
    expect(landingForRole("pm", true)).toBe("DrawingSubmittalHub");
    expect(landingForRole("admin", true)).toBe("DrawingSubmittalHub");
    expect(landingForRole("owner", true)).toBe("DrawingSubmittalHub");
  });

  it("keeps viewers on the Dashboard (null → no redirect)", () => {
    expect(landingForRole("viewer", true)).toBeNull();
  });

  it("returns null for unknown / empty roles (safe default = Dashboard)", () => {
    expect(landingForRole(null, true)).toBeNull();
    expect(landingForRole(undefined, true)).toBeNull();
    expect(landingForRole("superuser", true)).toBeNull();
  });

  it("never redirects without an active project — the role can't be trusted there", () => {
    // useProjectRole defaults to "viewer" when disabled (no project); even a
    // would-be office role must not redirect to a project-scoped page with no
    // project selected. This is the guard against the dead-redirect trap.
    expect(landingForRole("pm", false)).toBeNull();
    expect(landingForRole("field", false)).toBeNull();
    expect(landingForRole("owner", false)).toBeNull();
    expect(landingForRole("admin", false)).toBeNull();
  });
});
