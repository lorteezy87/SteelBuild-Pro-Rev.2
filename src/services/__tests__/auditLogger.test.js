/**
 * auditLogger.test.js — activity record construction + fire-and-forget safety.
 *
 * logActivity/logTransition write to base44.entities.Activity. The logic worth
 * pinning: entity-label mapping, human name extraction, status-change
 * descriptions, user resolution (auth session, not localStorage), and the
 * guarantee that an audit failure never throws into the caller.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: { entities: { Activity: { create: mocks.create } } },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: mocks.getUser } },
}));

import { logActivity, logTransition } from "../auditLogger";

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({ id: "act1" });
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: null } });
});

describe("logActivity — record shape", () => {
  it("maps the entity key to a label and pulls a human name", async () => {
    await logActivity(
      "rfi",
      "created",
      { rfi_number: "RFI-001", project_id: "p1", project_name: "Tower" },
      { userName: "Jane" },
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const rec = mocks.create.mock.calls[0][0];
    expect(rec.entity_type).toBe("RFI");
    expect(rec.entity_name).toBe("RFI-001");
    expect(rec.action).toBe("created");
    expect(rec.project_id).toBe("p1");
    expect(rec.project_name).toBe("Tower");
    expect(rec.performed_by).toBe("Jane");
    expect(typeof rec.timestamp).toBe("string");
  });

  it("falls back to '<Label> #<id>' when no name field is present", async () => {
    await logActivity("delivery", "created", { id: "d9" }, { userName: "X" });
    expect(mocks.create.mock.calls[0][0].entity_name).toBe("Delivery #d9");
  });

  it("derives projectId/projectName from the record when not in options", async () => {
    await logActivity("expense", "created", { id: "e1", project_id: "px", project_name: "Annex" }, { userName: "X" });
    const rec = mocks.create.mock.calls[0][0];
    expect(rec.project_id).toBe("px");
    expect(rec.project_name).toBe("Annex");
  });

  it("uses the project's own id as project_id for the 'project' entity", async () => {
    // A project record has `id`, not `project_id`; without this fallback the
    // audit row would have a null project_id and be rejected by activities RLS.
    await logActivity("project", "updated", { id: "proj1", name: "Tower" }, { userName: "X" });
    expect(mocks.create.mock.calls[0][0].project_id).toBe("proj1");
  });
});

describe("logActivity — status change descriptions", () => {
  it("describes a status_changed action from the record's status field", async () => {
    await logActivity("change_order", "status_changed", { id: "c1", status: "Approved" }, { userName: "X" });
    expect(mocks.create.mock.calls[0][0].description).toBe("status → Approved");
  });

  it("lets an explicit description win over the derived one", async () => {
    await logActivity("change_order", "status_changed", { id: "c1", status: "Approved" }, { userName: "X", description: "Manual note" });
    expect(mocks.create.mock.calls[0][0].description).toBe("Manual note");
  });

  it("leaves description empty for a plain update (no status synthesis)", async () => {
    await logActivity("drawing", "updated", { id: "dr1", status: "IFC" }, { userName: "X" });
    expect(mocks.create.mock.calls[0][0].description).toBe("");
  });
});

describe("logActivity — user resolution + safety", () => {
  it("uses the auth session's full name when no userName is supplied", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { email: "s@x.com", user_metadata: { full_name: "Sam Smith" } } } });
    await logActivity("rfi", "created", { rfi_number: "RFI-2" });
    expect(mocks.create.mock.calls[0][0].performed_by).toBe("Sam Smith");
  });

  it("falls back to 'System' when there is no user", async () => {
    await logActivity("rfi", "created", { rfi_number: "RFI-3" });
    expect(mocks.create.mock.calls[0][0].performed_by).toBe("System");
  });

  it("never throws when the audit write fails (fire-and-forget)", async () => {
    mocks.create.mockRejectedValue(new Error("db down"));
    await expect(logActivity("rfi", "created", { rfi_number: "RFI-4" }, { userName: "X" })).resolves.toBeUndefined();
    expect(mocks.create).toHaveBeenCalled();
  });
});

describe("logTransition", () => {
  it("logs a status_changed activity with a from → to description", async () => {
    await logTransition("rfi", { rfi_number: "RFI-9" }, "Open", "Answered", { projectId: "p1", userName: "X" });
    const rec = mocks.create.mock.calls[0][0];
    expect(rec.action).toBe("status_changed");
    expect(rec.description).toBe("Open → Answered");
    expect(rec.entity_type).toBe("RFI");
    expect(rec.entity_name).toBe("RFI-9");
    expect(rec.project_id).toBe("p1");
  });
});
