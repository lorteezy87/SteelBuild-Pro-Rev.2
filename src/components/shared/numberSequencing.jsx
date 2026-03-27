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

const extractNumericSuffix = (value) => {
  if (value == null) return null;
  const match = String(value).match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
};

export const getNextFormattedNumber = async ({
  projectId,
  recordType,
  entityName,
  fieldName,
  prefix,
  padLength = 3,
}) => {
  if (!projectId) throw new Error("projectId is required");
  if (!recordType) throw new Error("recordType is required");
  if (!entityName) throw new Error("entityName is required");
  if (!fieldName) throw new Error("fieldName is required");
  if (!prefix) throw new Error("prefix is required");

  try {
    const nextValue = await getNextNumber(projectId, recordType);
    const numericValue = extractNumericSuffix(nextValue);
    if (numericValue != null) {
      return `${prefix}${String(numericValue).padStart(padLength, "0")}`;
    }
    if (typeof nextValue === "string" && nextValue.trim()) {
      return nextValue.trim();
    }
  } catch (error) {
    // Fall back to the highest existing number for the project.
  }

  const existing = await base44.entities[entityName].filter({ project_id: projectId });
  const maxNumber = existing.reduce((max, item) => {
    const numericValue = extractNumericSuffix(item?.[fieldName]);
    return numericValue != null && numericValue > max ? numericValue : max;
  }, 0);

  return `${prefix}${String(maxNumber + 1).padStart(padLength, "0")}`;
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
