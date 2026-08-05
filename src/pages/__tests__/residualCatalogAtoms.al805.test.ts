import { describe, expect, it } from "vitest";
import { EDITABLE_FIELDS } from "@/components/changeorders/changeOrderPayload";
import {
  ACTION_STATUSES,
  CLOSED_SUBMITTAL_STATUSES,
} from "@/components/submittals/processBoard.derive";
import {
  CLOSED_CO_STATUSES,
  CLOSED_TASK_STATUSES,
  CLOSED_DELIVERY_STATUSES,
} from "@/pages/dashboardCC/dashboardControlCenter.derive";
import { RESOLVED_STATUSES } from "@/pages/riskHub/riskControlCenter.derive";
import {
  OPEN_PUNCH_STATUSES,
  CLOSED_PUNCH_STATUSES,
} from "@/pages/fieldToday/fieldTodayControlCenter.derive";
import {
  LABOR_TYPES,
  EQUIPMENT_TYPES,
} from "@/pages/resources/resourcesControlCenter.derive";
import { BILLED_SOV_STATUSES } from "@/pages/dashboard/projectMetrics";
import {
  OPEN_RFI_STATUSES,
  PENDING_SUB_STATUSES,
  PENDING_CO_STATUSES,
} from "@/pages/commandCenter/commandCenterControlCenter.derive";
import { KNOWN_SKILLS_RS } from "@/pages/resourceScheduling/utils";
import { OPEN_STATUSES as RFI_OPEN } from "@/pages/rfis/rfiControlCenter.derive";
import { CLOSED_STATUSES as RFI_CLOSED } from "@/pages/rfis/rfiOverdueAlerts";
import { RFI_STATUS_SHORT } from "@/pages/rfis/utils";
import { FEATURED_SLUGS } from "@/pages/reportsHub/reportsHubControlCenter.derive";
import {
  REVIEW_STATUSES,
  SEARCH_FIELDS,
} from "@/pages/documents/documentsControlCenter.derive";
import {
  PHASE_ORDER,
  CLOSED_STATUSES as WP_CLOSED,
  APPROVED_DRAWING_STAGES,
} from "@/pages/workPackages/analytics";
import {
  CLOSED_STATUSES as FAB_CLOSED,
  RELEASED_DRAWING_STATES,
} from "@/pages/fabRelease/analytics";
import {
  TERMINAL_STATUSES as PROC_TERMINAL,
  OPEN_STATUSES as PROC_OPEN,
} from "@/pages/procurement/procurementControlCenter.derive";
import { ACTIVE_STATUSES as PORT_ACTIVE } from "@/pages/portfolio/portfolioControlCenter.derive";
import { ACTIVE_STATUSES as AI_ACTIVE } from "@/pages/actionItems/actionItemsControlCenter.derive";
import { OVERDUE_EXEMPT_STATUSES } from "@/pages/submittals/submittalRegister.derive";
import { WORKFLOW_STAGE_STATES } from "@/pages/drawingSubmittalHub/format";
import {
  TERMINAL as CO_TERMINAL,
  PENDING_STATUSES as CO_PENDING,
} from "@/pages/changeOrders/coControlCenter.derive";
import { titleblockRectStyle } from "@/components/drawings/titleblockMarkerModalHelpers";

describe("residual catalog atoms batch AL", () => {
  it("exports status/type catalogs across control centers", () => {
    expect(EDITABLE_FIELDS.length || EDITABLE_FIELDS.size).toBeTruthy();
    expect(ACTION_STATUSES.size || Array.isArray(ACTION_STATUSES)).toBeTruthy();
    expect(CLOSED_SUBMITTAL_STATUSES.size).toBeGreaterThan(0);
    expect(CLOSED_CO_STATUSES.size).toBeGreaterThan(0);
    expect(CLOSED_TASK_STATUSES.size).toBeGreaterThan(0);
    expect(CLOSED_DELIVERY_STATUSES.size).toBeGreaterThan(0);
    expect(RESOLVED_STATUSES.size).toBeGreaterThan(0);
    expect(OPEN_PUNCH_STATUSES.size).toBeGreaterThan(0);
    expect(CLOSED_PUNCH_STATUSES.size).toBeGreaterThan(0);
    expect(LABOR_TYPES.length || LABOR_TYPES.size).toBeTruthy();
    expect(EQUIPMENT_TYPES.length || EQUIPMENT_TYPES.size).toBeTruthy();
    expect(BILLED_SOV_STATUSES.size).toBeGreaterThan(0);
    expect(OPEN_RFI_STATUSES.size).toBeGreaterThan(0);
    expect(PENDING_SUB_STATUSES.size).toBeGreaterThan(0);
    expect(PENDING_CO_STATUSES.size).toBeGreaterThan(0);
    expect(KNOWN_SKILLS_RS.size || KNOWN_SKILLS_RS.length).toBeTruthy();
    expect(RFI_OPEN.size).toBeGreaterThan(0);
    expect(RFI_CLOSED.size).toBeGreaterThan(0);
    expect(typeof RFI_STATUS_SHORT).toBe("object");
    expect(FEATURED_SLUGS.length || FEATURED_SLUGS.size).toBeTruthy();
    expect(REVIEW_STATUSES.size).toBeGreaterThan(0);
    expect(SEARCH_FIELDS.length).toBeGreaterThan(0);
    expect(PHASE_ORDER.length).toBeGreaterThan(0);
    expect(WP_CLOSED.size).toBeGreaterThan(0);
    expect(APPROVED_DRAWING_STAGES.size).toBeGreaterThan(0);
    expect(FAB_CLOSED.size).toBeGreaterThan(0);
    expect(RELEASED_DRAWING_STATES.size).toBeGreaterThan(0);
    expect(PROC_TERMINAL.size).toBeGreaterThan(0);
    expect(PROC_OPEN.size).toBeGreaterThan(0);
    expect(PORT_ACTIVE.size).toBeGreaterThan(0);
    expect(AI_ACTIVE.size).toBeGreaterThan(0);
    expect(OVERDUE_EXEMPT_STATUSES.length).toBeGreaterThan(0);
    expect(WORKFLOW_STAGE_STATES.length || WORKFLOW_STAGE_STATES.size).toBeTruthy();
    expect(CO_TERMINAL.size).toBeGreaterThan(0);
    expect(CO_PENDING.size).toBeGreaterThan(0);
  });

  it("titleblock marker rect chrome pure", () => {
    expect(titleblockRectStyle(null, "red")).toBeNull();
    const style = titleblockRectStyle(
      { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      "blue",
    );
    expect(style?.left).toBe("10%");
    expect(style?.top).toBe("20%");
    expect(style?.width).toBe("30%");
    expect(style?.height).toBe("40%");
    expect(style?.border).toBe("2px solid blue");
    expect(style?.background).toBe("blue22");
  });
});
