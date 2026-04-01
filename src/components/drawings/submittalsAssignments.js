const getAssignmentStorageKey = (projectId) => `submittals_set_assignments_${projectId || "global"}`;

const readPersistedAssignments = (projectId) => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(getAssignmentStorageKey(projectId));
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writePersistedAssignments = (projectId, assignments) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getAssignmentStorageKey(projectId), JSON.stringify(assignments || {}));
  } catch {}
};

const getAssignmentLookupKeys = (drawing) => {
  const keys = [];
  if (drawing?.id) keys.push(`id:${drawing.id}`);
  if (drawing?.sheet_number) keys.push(`sheet:${String(drawing.sheet_number).trim().toUpperCase()}`);
  return keys;
};

export const getPersistedAssignment = (projectId, drawing) => {
  const assignments = readPersistedAssignments(projectId);
  for (const key of getAssignmentLookupKeys(drawing)) {
    const value = String(assignments?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

export const persistAssignment = (projectId, drawing, setName) => {
  const trimmedSetName = String(setName || "").trim();
  if (!trimmedSetName) return;
  const assignments = readPersistedAssignments(projectId);
  getAssignmentLookupKeys(drawing).forEach((key) => {
    assignments[key] = trimmedSetName;
  });
  writePersistedAssignments(projectId, assignments);
};

export const clearPersistedAssignment = (projectId, drawing) => {
  const assignments = readPersistedAssignments(projectId);
  let changed = false;
  getAssignmentLookupKeys(drawing).forEach((key) => {
    if (key in assignments) {
      delete assignments[key];
      changed = true;
    }
  });
  if (changed) writePersistedAssignments(projectId, assignments);
};
