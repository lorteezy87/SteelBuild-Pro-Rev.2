import { describe, expect, it } from "vitest";
import { DOCUMENT_EXTENSIONS, IMAGE_EXTENSIONS } from "@/lib/uploadValidation";
import {
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
  DOW_NAMES_SHORT,
  DOW_NAMES_LONG,
} from "@/lib/calendarMath";
import { SENT_OFA, RR_SOURCES } from "@/lib/commentDispositionGate";
import { ACTIVE_REVIEW_STATUSES } from "@/lib/submittalForecast";
import { DONE_TERMINALS } from "@/lib/submittalActionEngine";
import { SENT_OFA_STATUSES } from "@/lib/ofsCompletionGate";
import { DRAFTING_SET, RELEASE_SET } from "@/lib/detailingPackageState";
import { VALID_STAMP_TYPES } from "@/lib/drawingHub/signoffs";
import { AVATAR_COLORS } from "@/lib/avatars";
import { ALLOWED } from "@/lib/themeResolution";
import { LOCAL_HTTP_HOSTNAMES } from "@/lib/recordLinks";
import { REQUIRED_DESKTOP_CONNECT_PARAMS } from "@/lib/desktopSessionHandoff";
import {
  PRIORITIES,
  CLOSED_STATUSES as CONSTRAINT_CLOSED,
  NON_BLOCKING_RFI_STATUSES,
  PRODUCTION_PHASES as CONSTRAINT_PHASES,
} from "@/services/constraintEngine";
import {
  CLOSED_STATUSES as GATE_CLOSED,
  PRODUCTION_PHASES as GATE_PHASES,
} from "@/services/scheduleGatekeeper";
import { VOIDED } from "@/services/costRollup";
import { BLOCKED } from "@/lib/authMeta";
import { RISK_MILESTONES } from "@/lib/detailingSchedule";

describe("residual catalog atoms batch AG", () => {
  it("upload extensions and calendar name catalogs", () => {
    expect(DOCUMENT_EXTENSIONS).toContain("pdf");
    expect(IMAGE_EXTENSIONS).toContain("png");
    expect(MONTH_NAMES[0]).toBe("January");
    expect(MONTH_NAMES_SHORT[11]).toBe("Dec");
    expect(DOW_NAMES_SHORT[0]).toBe("Sun");
    expect(DOW_NAMES_LONG[1]).toBe("Monday");
  });

  it("submittal/gate status catalogs", () => {
    expect(SENT_OFA.size).toBeGreaterThan(0);
    expect(RR_SOURCES.size).toBeGreaterThan(0);
    expect(ACTIVE_REVIEW_STATUSES.size).toBeGreaterThan(0);
    expect(DONE_TERMINALS.size).toBeGreaterThan(0);
    expect(SENT_OFA_STATUSES.size).toBeGreaterThan(0);
    expect(DRAFTING_SET.size).toBeGreaterThan(0);
    expect(RELEASE_SET.size).toBeGreaterThan(0);
  });

  it("stamp types, avatars, theme, desktop connect", () => {
    expect(VALID_STAMP_TYPES.size || Array.isArray(VALID_STAMP_TYPES)).toBeTruthy();
    expect(AVATAR_COLORS.length).toBeGreaterThan(0);
    expect(ALLOWED.has("dark")).toBe(true);
    expect(LOCAL_HTTP_HOSTNAMES.has("localhost")).toBe(true);
    expect(REQUIRED_DESKTOP_CONNECT_PARAMS).toContain("state");
  });

  it("constraint/gate/cost catalogs and auth blocked keys", () => {
    expect(PRIORITIES.has("Critical")).toBe(true);
    expect(CONSTRAINT_CLOSED.has("closed")).toBe(true);
    expect(NON_BLOCKING_RFI_STATUSES.has("answered")).toBe(true);
    expect(CONSTRAINT_PHASES.has("fabrication")).toBe(true);
    expect(GATE_CLOSED.has("void")).toBe(true);
    expect(GATE_PHASES.has("fab")).toBe(true);
    expect(VOIDED.has("voided")).toBe(true);
    expect(BLOCKED.has("role")).toBe(true);
    expect(Array.isArray(RISK_MILESTONES)).toBe(true);
    expect(RISK_MILESTONES.length).toBeGreaterThan(0);
  });
});
