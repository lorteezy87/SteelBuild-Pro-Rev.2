import { supabase } from '@/lib/supabase';
import { entities } from '@/api/supabaseClient';

const MAX_RETRIES = 3;

/**
 * Get the next sequence number for a project + record type.
 * Uses optimistic concurrency: reads the current value then conditionally
 * updates only if the value hasn't changed, retrying on collision.
 */
export const getNextNumber = async (projectId, recordType) => {
  if (!projectId) throw new Error("projectId is required");
  if (!recordType) throw new Error("recordType is required");

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: existing } = await supabase
      .from('number_sequences')
      .select('next_value')
      .eq('project_id', projectId)
      .eq('record_type', recordType)
      .single();

    if (existing) {
      const current = existing.next_value || 1;
      // Conditional update: only succeeds if next_value still equals what we read
      const { data: updated } = await supabase
        .from('number_sequences')
        .update({ next_value: current + 1, updated_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .eq('record_type', recordType)
        .eq('next_value', current)
        .select();

      if (updated && updated.length > 0) {
        return current;
      }
      // Another call incremented first — retry
      continue;
    } else {
      // Create row starting at 1, return 1.
      // If two calls race to insert, one will fail on the unique constraint;
      // the retry loop will then find the existing row.
      const { error } = await supabase.from('number_sequences').insert({
        project_id: projectId,
        record_type: recordType,
        next_value: 2,
      });
      if (!error) return 1;
      // Insert conflict — another call created the row first, retry
      continue;
    }
  }

  throw new Error(
    `Failed to allocate sequence number for ${recordType} after ${MAX_RETRIES} retries`
  );
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

    // Self-heal: if the sequence was behind, fast-forward it.
    // Use conditional update to avoid regressing a value that another call
    // may have already advanced past our target.
    if (actualNext > seqValue) {
      await supabase
        .from('number_sequences')
        .update({ next_value: actualNext + 1, updated_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .eq('record_type', recordType)
        .lt('next_value', actualNext + 1);
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
