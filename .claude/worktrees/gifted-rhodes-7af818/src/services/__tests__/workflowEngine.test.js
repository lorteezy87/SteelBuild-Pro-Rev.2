/**
 * workflowEngine.test.js — Tests for trust-critical workflow transitions.
 *
 * Covers:
 *   1. Drawing set approval (legal transitions, role enforcement, required fields)
 *   2. RFI status transitions
 *   3. Change Order approval flow
 *   4. Expense payment status
 *   5. Work Package phase transitions (with drawing guard)
 *   6. Delivery status advancement
 *   7. Edge cases: invalid transitions, missing context, no-op
 */

import { describe, it, expect } from "vitest";
import {
  validateTransition,
  getValidTransitions,
  getWorkflowField,
  buildTransitionAudit,
  WORKFLOWS,
} from "../workflowEngine";

// ─── Helpers ────────────────────────────────────────────────────────────

const asAdmin = { user: { role: "admin", email: "admin@test.com", id: "u1" } };
const asPM    = { user: { role: "pm",    email: "pm@test.com",    id: "u2" } };
const asField = { user: { role: "field", email: "field@test.com", id: "u3" } };
const asViewer = { user: { role: "viewer", email: "view@test.com", id: "u4" } };

// ─── 1. Drawing Set Approval ────────────────────────────────────────────

describe("Drawing Set Approval", () => {
  const wf = "drawing_approval";

  it("allows pending → approved with reviewer field and pm role", () => {
    const result = validateTransition(wf, "pending", "approved", {
      ...asPM,
      record: { reviewer: "John" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects pending → approved without reviewer", () => {
    const result = validateTransition(wf, "pending", "approved", {
      ...asPM,
      record: {},
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("reviewer");
  });

  it("rejects pending → approved for viewer role", () => {
    const result = validateTransition(wf, "pending", "approved", {
      ...asViewer,
      record: { reviewer: "John" },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("role");
  });

  it("allows pending → rejected with notes", () => {
    const result = validateTransition(wf, "pending", "rejected", {
      ...asPM,
      record: { notes: "Missing detail A" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects pending → rejected without notes", () => {
    const result = validateTransition(wf, "pending", "rejected", {
      ...asPM,
      record: {},
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("notes");
  });

  it("blocks approved → pending (not a valid transition)", () => {
    const result = validateTransition(wf, "approved", "pending", asPM);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not allowed");
  });

  it("allows approved → superseded", () => {
    const result = validateTransition(wf, "approved", "superseded", asPM);
    expect(result.valid).toBe(true);
  });

  it("allows rejected → pending (re-submit)", () => {
    const result = validateTransition(wf, "rejected", "pending", asPM);
    expect(result.valid).toBe(true);
  });
});

// ─── 2. RFI Status ──────────────────────────────────────────────────────

describe("RFI Status Transitions", () => {
  const wf = "rfi";

  it("allows Open → Under Review with assigned_to", () => {
    const result = validateTransition(wf, "Open", "Under Review", {
      ...asField,
      record: { assigned_to: "Engineer" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects Open → Under Review without assigned_to", () => {
    const result = validateTransition(wf, "Open", "Under Review", {
      ...asField,
      record: {},
    });
    expect(result.valid).toBe(false);
  });

  it("allows Under Review → Answered with response", () => {
    const result = validateTransition(wf, "Under Review", "Answered", {
      ...asPM,
      record: { response: "See attached." },
    });
    expect(result.valid).toBe(true);
  });

  it("blocks Closed → Open for non-admin", () => {
    const result = validateTransition(wf, "Closed", "Open", asPM);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("role");
  });

  it("allows Closed → Open for admin", () => {
    const result = validateTransition(wf, "Closed", "Open", asAdmin);
    expect(result.valid).toBe(true);
  });

  it("blocks Open → Closed (must go through Answered)", () => {
    const result = validateTransition(wf, "Open", "Closed", asPM);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not allowed");
  });
});

// ─── 3. Change Order Approval ───────────────────────────────────────────

describe("Change Order Approval", () => {
  const wf = "change_order";

  it("allows Draft → Submitted with amount and title", () => {
    const result = validateTransition(wf, "Draft", "Submitted", {
      ...asPM,
      record: { co_amount: 5000, title: "Extra work" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects Draft → Submitted without title", () => {
    const result = validateTransition(wf, "Draft", "Submitted", {
      ...asPM,
      record: { co_amount: 5000 },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("title");
  });

  it("rejects Under Review → Approved without approved_by", () => {
    const result = validateTransition(wf, "Under Review", "Approved", {
      ...asPM,
      record: { co_amount: 5000 },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("approved_by");
  });

  it("rejects Under Review → Approved with zero amount (guard)", () => {
    const result = validateTransition(wf, "Under Review", "Approved", {
      ...asPM,
      record: { co_amount: 0, approved_by: "Owner" },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("non-zero");
  });

  it("allows Under Review → Approved with all fields", () => {
    const result = validateTransition(wf, "Under Review", "Approved", {
      ...asPM,
      record: { co_amount: 12000, approved_by: "Owner" },
    });
    expect(result.valid).toBe(true);
  });

  it("blocks Approved → Void for non-admin", () => {
    const result = validateTransition(wf, "Approved", "Void", {
      ...asPM,
      record: { notes: "Cancelled" },
    });
    expect(result.valid).toBe(false);
  });

  it("allows Approved → Void for admin with notes", () => {
    const result = validateTransition(wf, "Approved", "Void", {
      ...asAdmin,
      record: { notes: "Cancelled" },
    });
    expect(result.valid).toBe(true);
  });

  it("blocks Draft → Approved (must go through Submitted + Under Review)", () => {
    const result = validateTransition(wf, "Draft", "Approved", {
      ...asPM,
      record: { co_amount: 5000, approved_by: "Owner" },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not allowed");
  });
});

// ─── 4. Expense Payment ────────────────────────────────────────────────

describe("Expense Payment Status", () => {
  const wf = "expense_payment";

  it("allows Unpaid → Pending Approval for field", () => {
    const result = validateTransition(wf, "Unpaid", "Pending Approval", asField);
    expect(result.valid).toBe(true);
  });

  it("allows Pending Approval → Paid with approved_by", () => {
    const result = validateTransition(wf, "Pending Approval", "Paid", {
      ...asPM,
      record: { approved_by: "PM" },
    });
    expect(result.valid).toBe(true);
  });

  it("blocks Paid → Voided for non-admin", () => {
    const result = validateTransition(wf, "Paid", "Voided", {
      ...asPM,
      record: { notes: "Error" },
    });
    expect(result.valid).toBe(false);
  });

  it("allows Paid → Voided for admin with notes", () => {
    const result = validateTransition(wf, "Paid", "Voided", {
      ...asAdmin,
      record: { notes: "Duplicate entry" },
    });
    expect(result.valid).toBe(true);
  });
});

// ─── 5. Work Package Phase ─────────────────────────────────────────────

describe("Work Package Phase Transitions", () => {
  const wf = "work_package";

  it("allows Not Started → Detailing for pm", () => {
    const result = validateTransition(wf, "Not Started", "Detailing", asPM);
    expect(result.valid).toBe(true);
  });

  it("blocks Detailing → Fabrication without linked drawings", () => {
    const result = validateTransition(wf, "Detailing", "Fabrication", {
      ...asPM,
      record: {},
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("drawing");
  });

  it("allows Detailing → Fabrication with linked drawings", () => {
    const result = validateTransition(wf, "Detailing", "Fabrication", {
      ...asPM,
      record: { linked_drawing_ids: "d1,d2" },
    });
    expect(result.valid).toBe(true);
  });

  it("blocks Not Started → Fabrication (must go through Detailing)", () => {
    const result = validateTransition(wf, "Not Started", "Fabrication", asPM);
    expect(result.valid).toBe(false);
  });
});

// ─── 6. Delivery Status ────────────────────────────────────────────────

describe("Delivery Status Transitions", () => {
  const wf = "delivery";

  it("allows Scheduled → In Transit for field", () => {
    const result = validateTransition(wf, "Scheduled", "In Transit", asField);
    expect(result.valid).toBe(true);
  });

  it("allows In Transit → Delivered for field", () => {
    const result = validateTransition(wf, "In Transit", "Delivered", asField);
    expect(result.valid).toBe(true);
  });

  it("allows In Transit → Partial with notes", () => {
    const result = validateTransition(wf, "In Transit", "Partial", {
      ...asField,
      record: { notes: "5 of 10 pieces" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects In Transit → Partial without notes", () => {
    const result = validateTransition(wf, "In Transit", "Partial", asField);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("notes");
  });

  it("blocks Delivered → Scheduled (not a valid transition)", () => {
    const result = validateTransition(wf, "Delivered", "Scheduled", asField);
    expect(result.valid).toBe(false);
  });

  it("allows Scheduled → Delayed with notes", () => {
    const result = validateTransition(wf, "Scheduled", "Delayed", {
      ...asField,
      record: { notes: "Vendor delay" },
    });
    expect(result.valid).toBe(true);
  });
});

// ─── 7. Edge Cases ─────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("no-op transition (same status) is valid", () => {
    const result = validateTransition("rfi", "Open", "Open", asPM);
    expect(result.valid).toBe(true);
    expect(result.transition).toBeNull();
  });

  it("unknown workflow returns invalid", () => {
    const result = validateTransition("nonexistent", "A", "B", asPM);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Unknown workflow");
  });

  it("missing user context defaults to viewer", () => {
    const result = validateTransition("rfi", "Open", "Under Review", {
      record: { assigned_to: "Eng" },
    });
    // viewer rank (3) > field floor (2), so this should fail
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("role");
  });

  it("getValidTransitions returns all legal next states", () => {
    const transitions = getValidTransitions("change_order", "Under Review", asPM);
    const statuses = transitions.map((t) => t.toStatus);
    expect(statuses).toContain("Approved");
    expect(statuses).toContain("Rejected");
    expect(statuses).not.toContain("Void");
  });

  it("getWorkflowField returns the correct field", () => {
    expect(getWorkflowField("rfi")).toBe("status");
    expect(getWorkflowField("drawing_approval")).toBe("set_approval_status");
    expect(getWorkflowField("expense_payment")).toBe("payment_status");
  });

  it("buildTransitionAudit produces complete audit record", () => {
    const audit = buildTransitionAudit("rfi", "Open", "Under Review", {
      user: { email: "pm@test.com", role: "pm", id: "u2" },
      record: { id: "rfi-1", project_id: "proj-1" },
    });
    expect(audit.workflow).toBe("rfi");
    expect(audit.from_status).toBe("Open");
    expect(audit.to_status).toBe("Under Review");
    expect(audit.transitioned_by).toBe("pm@test.com");
    expect(audit.record_id).toBe("rfi-1");
    expect(audit.project_id).toBe("proj-1");
    expect(audit.transitioned_at).toBeTruthy();
  });

  it("fields from context.fields merge into record for validation", () => {
    const result = validateTransition("drawing_approval", "pending", "approved", {
      ...asPM,
      record: {},
      fields: { reviewer: "Jane" },
    });
    expect(result.valid).toBe(true);
  });
});

// ─── 8. Workflow Completeness ──────────────────────────────────────────

describe("Workflow Completeness", () => {
  it("all workflows have initial state and at least one transition", () => {
    for (const [name, wf] of Object.entries(WORKFLOWS)) {
      expect(wf.states.length).toBeGreaterThan(0);
      expect(wf.initial).toBeTruthy();
      expect(wf.states).toContain(wf.initial);
      expect(Object.keys(wf.transitions).length).toBeGreaterThan(0);
    }
  });

  it("all transition endpoints are valid states", () => {
    for (const [name, wf] of Object.entries(WORKFLOWS)) {
      for (const key of Object.keys(wf.transitions)) {
        const [from, to] = key.split("→");
        expect(wf.states).toContain(from);
        expect(wf.states).toContain(to);
      }
    }
  });
});
