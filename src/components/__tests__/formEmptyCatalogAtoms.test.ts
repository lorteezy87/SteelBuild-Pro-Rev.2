import { describe, expect, it } from "vitest";
import { EMPTY_CHANGE_ORDER_FORM } from "../changeorders/coFormModalHelpers";
import { EMPTY_SOV_FORM } from "../sov/sovFormModalHelpers";
import { EMPTY_COST_CODE_FORM } from "../financials/costCodeFormModalHelpers";
import {
  EMPTY_WARRANTY_FORM,
  WARRANTY_INPUT_STYLE,
} from "../warranty/warrantyFormModalHelpers";
import {
  EMPTY_SAFETY_INCIDENT_FORM,
  SAFETY_FORM_LABEL_STYLE,
} from "../safety/safetyIncidentFormModalHelpers";
import {
  EMPTY_PUNCHLIST_FORM,
  PUNCHLIST_INPUT_STYLE,
} from "../punchlist/punchlistFormModalHelpers";
import {
  BULK_SCOPE_BTN_PRIMARY,
  SCOPE_CATEGORIES,
} from "../scope/bulkScopeHelpers";
import { RFI_INSIGHT_CARD } from "../../pages/rfis/rfiInsightsHelpers";
import { NUDGE_FIELD_STYLE } from "../../pages/rfis/nudgeDraftModalHelpers";
import { EXPENSE_FILTER_SELECT_STYLE } from "../../pages/expenses/filterBarHelpers";
import {
  SETTINGS_LABEL_STYLE,
  SETTINGS_SECTION_STYLE,
} from "../settings/settingsTabStyleHelpers";
import {
  TRANSMITTAL_PURPOSES,
  TRANSMITTAL_INPUT_STYLE,
} from "../../pages/documents/transmittalModalHelpers";

describe("form empty + style pure catalogs", () => {
  it("co/sov/cost empties", () => {
    expect(EMPTY_CHANGE_ORDER_FORM.status).toBe("Draft");
    expect(EMPTY_CHANGE_ORDER_FORM.reason_code).toBe("Owner Request");
    expect(EMPTY_SOV_FORM.retainage_percent).toBe(10);
    expect(EMPTY_COST_CODE_FORM.phase).toBe("Materials");
  });

  it("warranty/safety/punchlist empties and styles", () => {
    expect(EMPTY_WARRANTY_FORM.warranty_type).toBe("Material");
    expect(WARRANTY_INPUT_STYLE.borderRadius).toBe("8px");
    expect(EMPTY_SAFETY_INCIDENT_FORM.severity).toBe("Medium");
    expect(SAFETY_FORM_LABEL_STYLE.textTransform).toBe("uppercase");
    expect(EMPTY_PUNCHLIST_FORM.category).toBe("Other");
    expect(PUNCHLIST_INPUT_STYLE.fontSize).toBe(12);
  });

  it("bulk scope + rfi + expense + settings + transmittal", () => {
    expect(SCOPE_CATEGORIES).toContain("Structural");
    expect(BULK_SCOPE_BTN_PRIMARY.background).toBe("var(--accent)");
    expect(RFI_INSIGHT_CARD.borderRadius).toContain("radius-card");
    expect(NUDGE_FIELD_STYLE.borderRadius).toBe(6);
    expect(EXPENSE_FILTER_SELECT_STYLE.fontSize).toBe(10);
    expect(SETTINGS_LABEL_STYLE.fontSize).toBe(8);
    expect(SETTINGS_SECTION_STYLE.marginBottom).toBe(20);
    expect(TRANSMITTAL_PURPOSES).toContain("For Review");
    expect(TRANSMITTAL_INPUT_STYLE.fontSize).toBe(12);
  });
});
