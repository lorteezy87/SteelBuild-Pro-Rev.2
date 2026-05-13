const NATURAL_COMPARE_OPTIONS = { numeric: true, sensitivity: "base" };

function firstPresent(values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function metadataNumber(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  return firstPresent([
    metadata.drawing_set_number,
    metadata.set_number,
    metadata.package_number,
    metadata.number,
  ]);
}

function numberFromName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(?:(?:drawing\s*)?set|package|pkg)?\s*#?\s*([A-Za-z]?\d+(?:[.-]\d+)*[A-Za-z]?)(?=\s|[-_:]|$)/i);
  return match?.[1] || "";
}

export function getDrawingSetNumber(set) {
  if (!set) return "";
  const explicit = firstPresent([
    set.drawing_set_number,
    set.set_number,
    set.package_number,
    metadataNumber(set.metadata),
  ]);
  if (explicit) return explicit;
  return numberFromName(set.set_name || set.name);
}

export function formatDrawingSetNumber(set) {
  return getDrawingSetNumber(set) || "TBD";
}

export function compareDrawingSetPackages(a, b) {
  const aUngrouped = Boolean(a?.isUngrouped);
  const bUngrouped = Boolean(b?.isUngrouped);
  if (aUngrouped && !bUngrouped) return 1;
  if (!aUngrouped && bUngrouped) return -1;

  const aNumber = getDrawingSetNumber(a);
  const bNumber = getDrawingSetNumber(b);
  if (aNumber && bNumber) {
    const byNumber = aNumber.localeCompare(bNumber, undefined, NATURAL_COMPARE_OPTIONS);
    if (byNumber !== 0) return byNumber;
  } else if (aNumber) {
    return -1;
  } else if (bNumber) {
    return 1;
  }

  return String(a?.set_name || a?.name || "").localeCompare(
    String(b?.set_name || b?.name || ""),
    undefined,
    NATURAL_COMPARE_OPTIONS,
  );
}

export function sortDrawingSetPackages(sets) {
  return [...(sets || [])].sort(compareDrawingSetPackages);
}

export function withDrawingSetNumberMetadata(metadata, setNumber) {
  const next = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...metadata }
    : {};
  const trimmed = String(setNumber || "").trim();
  if (trimmed) {
    next.drawing_set_number = trimmed;
  } else {
    delete next.drawing_set_number;
  }
  return next;
}
