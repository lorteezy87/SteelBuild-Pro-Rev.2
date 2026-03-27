import { base44 } from "@/api/base44Client";

/**
 * Get the next number in sequence for a project + record type.
 * Routes through the secureNumberSequence backend function — never touches
 * ProjectNumberSequence directly from the frontend.
 */
export const getNextNumber = async (projectId, recordType) => {
  if (!projectId) throw new Error("projectId is required");
  if (!recordType) throw new Error("recordType is required");

  const response = await base44.functions.invoke('secureNumberSequence', {
    action: 'next',
    project_id: projectId,
    record_type: recordType,
  });

  return response.data.number;
};

/**
 * Preview the next number without incrementing.
 * Used to show in create form UI.
 */
export const previewNextNumber = async (projectId, recordType) => {
  if (!projectId) return null;
  if (!recordType) return null;

  const response = await base44.functions.invoke('secureNumberSequence', {
    action: 'preview',
    project_id: projectId,
    record_type: recordType,
  });

  return response.data.number;
};

/**
 * Display a record number with project context.
 * Used in list views and cross-project displays.
 */
export const displayNumber = (number, project, omitProject = false) => {
  if (!number) return "";
  if (omitProject || !project) return number;
  const shortName = project?.name?.split(" ")[0] || "";
  return `${number} · ${shortName}`;
};