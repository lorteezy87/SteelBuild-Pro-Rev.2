import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildDemoProjectForm,
  buildInvitePrefill,
  buildPayloadWithTeamPlan,
  buildPreviewProject,
  createDefaultProjectForm,
  formatCountLabel,
  isProjectFormReady,
  nextProjectFormWithField,
} from "../onboardingPageHelpers";

describe("onboardingPageHelpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a default project form anchored to today", () => {
    const form = createDefaultProjectForm();
    expect(form.start_date).toBe("2026-07-27");
    expect(form.target_completion_date).toBe("2026-10-25");
    expect(form.contract_type).toBe("Lump Sum");
  });

  it("requires core fields unless demo template is selected", () => {
    const incomplete = createDefaultProjectForm();
    expect(isProjectFormReady(incomplete, "fabrication_erection")).toBe(false);
    expect(isProjectFormReady(incomplete, "structural_demo")).toBe(true);

    const ready = {
      ...incomplete,
      project_number: "P-1",
      name: "Tower",
      client: "Owner",
    };
    expect(isProjectFormReady(ready, "fabrication_erection")).toBe(true);
  });

  it("builds preview projects and team-plan metadata", () => {
    const form = {
      ...createDefaultProjectForm(),
      project_number: "P-1",
      name: "Tower",
      client: "Owner",
    };
    expect(buildPreviewProject(null, form, false).name).toBe("Tower");

    const payload = buildPayloadWithTeamPlan(form, "fabrication_erection", [
      { email: " a@x.com ", role: "pm", discipline: " PM " },
      { email: "", role: "field", discipline: "" },
    ]);
    expect(payload.metadata.onboarding.team_plan).toEqual([
      { email: "a@x.com", role: "pm", discipline: "PM" },
    ]);
  });

  it("updates start_date with a 90-day target and builds demo defaults", () => {
    const next = nextProjectFormWithField(createDefaultProjectForm(), "start_date", "2026-08-01");
    expect(next.start_date).toBe("2026-08-01");
    expect(next.target_completion_date).toBe("2026-10-30");

    const demo = buildDemoProjectForm();
    expect(demo.project_number).toBe("DEMO-001");
    expect(demo.target_completion_date).toBe("2026-11-24");
  });

  it("formats seed labels and invite prefills", () => {
    expect(formatCountLabel("drawingSets")).toBe("Drawing Sets");
    expect(buildInvitePrefill([
      { email: " a@x.com ", role: "pm" },
      { email: "  ", role: "field" },
    ])).toEqual([{ email: "a@x.com", role: "pm" }]);
  });
});
