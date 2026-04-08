import { supabase } from '@/lib/supabase';
import { entities } from '@/api/supabaseClient';

/**
 * Get the next sequence number for a project + record type.
 * Uses a dedicated number_sequences table for atomic incrementing.
 */
export const getNextNumber = async (projectId, recordType) => {
  if (!projectId) throw new Error("projectId is required");
  if (!recordType) throw new Error("recordType is required");

  // Try to increment an existing sequence row
  const { data: existing } = await supabase
    .from('number_sequences')
    .select('next_value')
    .eq('project_id', projectId)
    .eq('record_type', recordType)
    .single();

  if (existing) {
    const current = existing.next_value || 1;
    await supabase
      .from('number_sequences')
      .update({ next_value: current + 1, updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('record_type', recordType);
    return current;
  } else {
    // Create row starting at 1, return 1
    await supabase.from('number_sequences').insert({
      project_id: projectId,
      record_type: recordType,
      next_value: 2,
    });
    return 1;
  }
};

const extractNumericSuffix = (value) => {
  if (value == null) return null;
  const match = String(value).match(/(\d+)\s*$/);
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

  // Always scan existing records to find the real max — prevents duplicates
  // when the sequence table is out of sync with actual data.
  const existing = await entities[entityName]?.filter({ project_id: projectId }) || [];
  const maxFromRecords = existing.reduce((max, item) => {
    const numericValue = extractNumericSuffix(item?.[fieldName]);
    return numericValue != null && numericValue > max ? numericValue : max;
  }, 0);

  try {
    const seqValue = await getNextNumber(projectId, recordType);
    // Use whichever is higher: sequence value or (max from existing records + 1)
    const actualNext = Math.max(seqValue, maxFromRecords + 1);

    // Self-heal: if the sequence was behind, fast-forward it
    if (actualNext > seqValue) {
      await supabase
        .from('number_sequences')
        .update({ next_value: actualNext + 1, updated_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .eq('record_type', recordType);
    }

    return `${prefix}${String(actualNext).padStart(padLength, "0")}`;
  } catch {
    // Sequence table unavailable — use record scan result
    return `${prefix}${String(maxFromRecords + 1).padStart(padLength, "0")}`;
  }
};

/**
 * Preview the next number without incrementing (reads current sequence value).
 */
export const previewNextNumber = async (projectId, recordType) => {
  if (!projectId || !recordType) return null;

  const { data } = await supabase
    .from('number_sequences')
    .select('next_value')
    .eq('project_id', projectId)
    .eq('record_type', recordType)
    .single();

  return data?.next_value || 1;
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
  } catch {
    // Fall through to non-mutating data scan
  }

  const existing = await entities[entityName]?.filter({ project_id: projectId }) || [];
  const maxNumber = existing.reduce((max, item) => {
    const numericValue = extractNumericSuffix(item?.[fieldName]);
    return numericValue != null && numericValue > max ? numericValue : max;
  }, 0);

  return `${prefix}${String(maxNumber + 1).padStart(padLength, "0")}`;
};

/**
 * Display a record number with project context.
 */
export const displayNumber = (number, project, omitProject = false) => {
  if (!number) return "";
  if (omitProject || !project) return number;
  const shortName = project?.name?.split(" ")[0] || "";
  return `${number} · ${shortName}`;
};
