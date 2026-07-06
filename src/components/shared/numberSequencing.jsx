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

  // Atomic, server-side sequencing via the get_next_sequence_number RPC
  // (INSERT...ON CONFLICT DO UPDATE...RETURNING under a row lock, plus a
  // project-access check). Concurrent callers serialize into DISTINCT numbers,
  // replacing the former client-side read-modify-write which — on a stale read
  // or retry exhaustion — could mint duplicate official record numbers. Retry
  // the SERVER call on a transient error, then fail closed; never invent a
  // number in the browser.
  let lastError = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data, error } = await supabase.rpc('get_next_sequence_number', {
      p_project_id: projectId,
      p_record_type: recordType,
    });
    if (!error && typeof data === 'number') return data;
    lastError = error;
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  throw new Error(
    `Failed to allocate sequence number for ${recordType} after ${MAX_RETRIES} retries`
    + (lastError?.message ? `: ${lastError.message}` : '')
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

  // Scan active records for the highest existing number. The atomic RPC starts a
  // fresh sequence at 1 and has no knowledge of pre-existing records, so a
  // sequence that trails the data (e.g. after a bulk import) can hand back a
  // value that would collide with an existing record number.
  // Only scans active rows — deleted numbers are reusable (partial unique index).
  const existing = await entities[entityName]?.filter({ project_id: projectId }) || [];
  const maxFromRecords = existing.reduce((max, item) => {
    const numericValue = extractNumericSuffix(item?.[fieldName]);
    return numericValue != null && numericValue > max ? numericValue : max;
  }, 0);

  // The number ALWAYS comes from the atomic RPC — never a client-side Math.max.
  // (Flooring client-side reintroduced duplicates: two concurrent callers that
  // read the same maxFromRecords both floored to the same value. The RPC
  // serializes callers into DISTINCT values.) If the sequence trails the data
  // and the RPC hands back a value that would collide with an existing record,
  // re-allocate — each call returns a fresh distinct number — until it clears
  // the existing max. This burns the stale low values once; afterwards the
  // sequence is ahead and a single call suffices. If the RPC can't allocate,
  // getNextNumber throws and we fail closed rather than invent a number here.
  let allocated = await getNextNumber(projectId, recordType);
  // Bounded by how far the sequence trails the data, so a pathological
  // non-advancing RPC can't spin forever.
  let remaining = maxFromRecords - allocated + 1;
  while (allocated <= maxFromRecords && remaining-- > 0) {
    allocated = await getNextNumber(projectId, recordType);
  }

  return `${prefix}${String(allocated).padStart(padLength, "0")}`;
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
