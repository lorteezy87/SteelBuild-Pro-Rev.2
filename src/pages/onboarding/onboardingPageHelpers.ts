/**
 * Pure page helpers for Onboarding — form/payload/invite derivation only.
 * Mutations and entity I/O stay in Onboarding.jsx for this slice.
 */
import {
  SAMPLE_PROJECT,
  SAMPLE_PROJECT_TEMPLATE_KEY,
  PROJECT_TEMPLATES,
  addDaysIso,
  buildProjectPayload,
  todayIso,
} from "@/lib/onboardingTemplates";

export function createDefaultProjectForm() {
  const start = todayIso();
  return {
    project_number: "",
    name: "",
    client: "",
    general_contractor: "",
    engineer_of_record: "",
    project_manager: "",
    superintendent: "",
    contract_type: "Lump Sum",
    original_contract_value: "",
    start_date: start,
    target_completion_date: addDaysIso(start, 90),
    retainage_percent: 10,
    contingency_amount: "",
    address: "",
    notes: "",
  };
}

export function buildPayloadWithTeamPlan(projectForm: any, templateKey: any, teamRows: any[]) {
  const payload = buildProjectPayload(projectForm, templateKey);
  const teamPlan = teamRows
    .map((row: any) => ({
      email: row.email.trim(),
      role: row.role,
      discipline: row.discipline.trim(),
    }))
    .filter((row: any) => row.email || row.discipline);

  return {
    ...payload,
    metadata: {
      ...(payload.metadata || {}),
      onboarding: {
        ...(payload.metadata?.onboarding || {}),
        team_plan: teamPlan,
      },
    },
  };
}

export function formatCountLabel(key: any) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char: any) => char.toUpperCase());
}

export function isProjectFormReady(projectForm: any, templateKey: any) {
  const isDemoTemplate = templateKey === SAMPLE_PROJECT_TEMPLATE_KEY;
  return isDemoTemplate || (
    Boolean(projectForm.project_number.trim())
    && Boolean(projectForm.name.trim())
    && Boolean(projectForm.client.trim())
    && Boolean(projectForm.start_date)
  );
}

export function buildPreviewProject(selectedProject: any, projectForm: any, isDemoTemplate: any) {
  return selectedProject || {
    id: "preview-project",
    name: projectForm.name || (isDemoTemplate ? SAMPLE_PROJECT.name : "New project"),
    start_date: projectForm.start_date,
  };
}

export function nextProjectFormWithField(prev: any, field: any, value: any) {
  return {
    ...prev,
    [field]: value,
    ...(field === "start_date" ? { target_completion_date: addDaysIso(value, 90) } : {}),
  };
}

export function buildDemoProjectForm() {
  const start = todayIso();
  return {
    ...createDefaultProjectForm(),
    project_number: "DEMO-001",
    name: SAMPLE_PROJECT.name,
    client: "Demo Client",
    general_contractor: "Demo GC",
    engineer_of_record: "Demo EOR",
    project_manager: "Sample PM",
    superintendent: "Sample Superintendent",
    original_contract_value: 1250000,
    start_date: start,
    target_completion_date: addDaysIso(start, 120),
    notes: "Demo data created from onboarding. Safe to delete after training.",
  };
}

export function buildInvitePrefill(teamRows: any[]) {
  return teamRows
    .filter((row: any) => row.email.trim())
    .map((row: any) => ({ email: row.email.trim(), role: row.role }));
}


export function updateTeamRowAt<T extends Record<string, unknown>>(
  rows: T[],
  index: number,
  field: keyof T | string,
  value: unknown,
): T[] {
  return (rows || []).map((row, rowIndex) =>
    rowIndex === index ? { ...row, [field]: value } : row,
  );
}

export function removeTeamRowAt<T>(rows: T[], index: number): T[] {
  return (rows || []).filter((_, rowIndex) => rowIndex !== index);
}

export function appendEmptyTeamRow<T extends { email: string; role: string; discipline: string }>(
  rows: T[],
  empty: T = { email: "", role: "member", discipline: "" } as T,
): T[] {
  return [...(rows || []), empty];
}

/** Sample + library templates offered on the onboarding project step. */
export const TEMPLATE_OPTIONS = [SAMPLE_PROJECT, ...PROJECT_TEMPLATES];
