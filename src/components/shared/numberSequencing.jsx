import { base44 } from "@/api/base44Client";

const SEQUENCE_FALLBACKS = {
  CO: { entityName: "ChangeOrder", fieldName: "co_number", prefix: "CO-", padLength: 3 },
  EXPENSE: { entityName: "Expense", fieldName: "expense_number", prefix: "EXP-", padLength: 3 },
  SOV: { entityName: "SOV", fieldName: "sov_id", prefix: "SOV-", padLength: 3 },
  RFI: { entityName: "RFI", fieldName: "rfi_number", prefix: "RFI-", padLength: 3 },
  DRAWING: { entityName: "Drawing", fieldName: "drawing_id", prefix: "DWG-", padLength: 3 },
  WORK_PACKAGE: { entityName: "WorkPackage", fieldName: "wp_number", prefix: "WP-", padLength: 3 },
  DAILY_LOG: { entityName: "DailyLog", fieldName: "log_id", prefix: "LOG-", padLength: 4 },
  DELIVERY: { entityName: "Delivery", fieldName: "delivery_id", prefix: "DEL-", padLength: 3 },
  MEETING: { entityName: "Meeting", fieldName: "meeting_number", prefix: "MTG-", padLength: 3 },
  ACTION_ITEM: { entityName: "ActionItem", fieldName: "action_item_number", prefix: "AI-", padLength: 3 },
  PRODUCTION_NOTE: { entityName: "ProductionNote", fieldName: "note_number", prefix: "PN-", padLength: 3 },
  LOOK_AHEAD: { entityName: "LookAhead", fieldName: "lookahead_number", prefix: "LA-", padLength: 3 },
  CONTACT: { entityName: "Contact", fieldName: "contact_id", prefix: "CON-", padLength: 3 },
};

const hasAuthToken = () => {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(
      window.localStorage.getItem("base44_access_token") ||
      window.localStorage.getItem("token") ||
      window.sessionStorage.getItem("base44_access_token") ||
      window.sessionStorage.getItem("token")
    );
  } catch {
    return false;
  }
};

/**
 * Get the next number in sequence for a project + record type.
 * Routes through the secureNumberSequence backend function — never touches
 * ProjectNumberSequence directly from the frontend.
 */
export const getNextNumber = async (projectId, recordType) => {
  if (!projectId) throw new Error("projectId is required");
  if (!recordType) throw new Error("recordType is required");
  const fallbackConfig = SEQUENCE_FALLBACKS[recordType];

  if (!hasAuthToken()) {
    if (!fallbackConfig) {
      throw new Error("Authentication required for secure number sequencing");
    }
    return getFallbackNumber({ projectId, ...fallbackConfig });
  }

  try {
    const response = await base44.functions.invoke('secureNumberSequence', {
      action: 'next',
      project_id: projectId,
      record_type: recordType,
    });

    return response.data.number;
  } catch (error) {
    if (!fallbackConfig) {
      throw error;
    }
    return getFallbackNumber({ projectId, ...fallbackConfig });
  }
};

const extractNumericSuffix = (value) => {
  if (value == null) return null;
  const match = String(value).match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
};

const normalizeArgs = (argsArray) => {
  if (typeof argsArray[0] === "string") {
    const [projectId, recordType, entityName, fieldName, prefix, padLength] = argsArray;
    return { projectId, recordType, entityName, fieldName, prefix, padLength };
  }
  return argsArray[0] || {};
};

const formatSequenceValue = (value, prefix, padLength = 3) => {
  const numericValue = extractNumericSuffix(value);
  if (numericValue != null) {
    return `${prefix}${String(numericValue).padStart(padLength, "0")}`;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
};

const getFallbackNumber = async ({ projectId, entityName, fieldName, prefix, padLength = 3 }) => {
  const existing = await base44.entities[entityName].filter({ project_id: projectId });
  const maxNumber = existing.reduce((max, item) => {
    const numericValue = extractNumericSuffix(item?.[fieldName]);
    return numericValue != null && numericValue > max ? numericValue : max;
  }, 0);

  return `${prefix}${String(maxNumber + 1).padStart(padLength, "0")}`;
};

export const getNextFormattedNumber = async (...rawArgs) => {
  const {
    projectId,
    recordType,
    entityName,
    fieldName,
    prefix,
    padLength = 3,
  } = normalizeArgs(rawArgs);

  if (!projectId) throw new Error("projectId is required");
  if (!recordType) throw new Error("recordType is required");
  if (!entityName) throw new Error("entityName is required");
  if (!fieldName) throw new Error("fieldName is required");
  if (!prefix) throw new Error("prefix is required");

  try {
    const nextValue = await getNextNumber(projectId, recordType);
    const formatted = formatSequenceValue(nextValue, prefix, padLength);
    if (formatted) {
      return formatted;
    }
  } catch (error) {
    // Fall back to the highest existing number for the project.
  }

  return getFallbackNumber({ projectId, entityName, fieldName, prefix, padLength });
};

/**
 * Preview the next number without incrementing.
 * Used to show in create form UI.
 */
export const previewNextNumber = async (projectId, recordType) => {
  if (!projectId) return null;
  if (!recordType) return null;
  const fallbackConfig = SEQUENCE_FALLBACKS[recordType];

  if (!hasAuthToken()) {
    if (!fallbackConfig) return null;
    return getFallbackNumber({ projectId, ...fallbackConfig });
  }

  try {
    const response = await base44.functions.invoke('secureNumberSequence', {
      action: 'preview',
      project_id: projectId,
      record_type: recordType,
    });

    return response.data.number;
  } catch (error) {
    if (!fallbackConfig) return null;
    return getFallbackNumber({ projectId, ...fallbackConfig });
  }
};

export const previewNextFormattedNumber = async ({
  projectId,
  recordType,
  entityName,
  fieldName,
  prefix,
  padLength = 3,
}) => {
  if (!projectId || !recordType || !entityName || !fieldName || !prefix) return null;

  try {
    const previewValue = await previewNextNumber(projectId, recordType);
    const formatted = formatSequenceValue(previewValue, prefix, padLength);
    if (formatted) return formatted;
  } catch (error) {
    // Fall through to non-mutating data scan.
  }

  return getFallbackNumber({ projectId, entityName, fieldName, prefix, padLength });
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
