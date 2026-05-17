/**
 * autoLinkEngine.js — Pattern-based cross-entity auto-linking.
 *
 * Parses entity text fields for recognizable patterns (drawing numbers,
 * WP codes, sequences, gridlines, areas) and suggests links to matching
 * entities in the project.
 *
 * Deterministic — no ML, just pattern matching against known entity indexes.
 */

// --- Pattern matchers ---

const PATTERNS = {
  // Drawing sheet numbers: S3.2, A2.1, M1.04, E-2.3
  drawingNumber: /\b([SAEMPC])-?(\d{1,3})[.](\d{1,3})\b/gi,
  // Work package codes: WP-104, WP 204, WP104
  wpCode: /\bWP[-\s]?(\d{2,5})\b/gi,
  // Sequence references: S2, Seq 2, Sequence 2
  sequence: /\b(?:S|Seq(?:uence)?)\s*(\d{1,3})\b/gi,
  // Gridline references: A-5, B.3, Grid C-7
  gridline: /\b(?:Grid(?:line)?[-\s]?)?([A-Z])-?(\d{1,3})\b/gi,
  // Area references: common steel areas
  area: /\b((?:East|West|North|South|Central|Core)\s+(?:Wing|Bay|Tower|Addition|Side))\b/gi,
  // Revision: Rev 3, R3, Rev. A
  revision: /\b(?:Rev(?:ision)?\.?\s*)([A-Z0-9]{1,3})\b/gi,
  // RFI numbers: RFI-001, RFI 42
  rfiNumber: /\bRFI[-\s]?(\d{1,5})\b/gi,
};

function extractPatterns(text) {
  if (!text || typeof text !== "string") return [];
  const matches = [];

  for (const [type, regex] of Object.entries(PATTERNS)) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
      matches.push({ type, match: match[0], value: match[0].toUpperCase().replace(/\s+/g, ""), fullMatch: match });
    }
  }
  return matches;
}

// --- Index builders ---

function buildDrawingIndex(drawings = []) {
  const index = new Map();
  for (const d of drawings) {
    if (!d || d.is_deleted) continue;
    const num = String(d.sheet_number || "").trim().toUpperCase().replace(/\s+/g, "");
    if (num) index.set(num, d);
    // Also index without dashes
    const noDash = num.replace(/-/g, "");
    if (noDash !== num) index.set(noDash, d);
  }
  return index;
}

function buildWPIndex(workPackages = []) {
  const index = new Map();
  for (const wp of workPackages) {
    if (!wp || wp.is_deleted) continue;
    const num = String(wp.wp_number || "").trim().toUpperCase().replace(/[-\s]/g, "");
    if (num) index.set(num, wp);
    // Also try with WP prefix
    if (!num.startsWith("WP")) index.set(`WP${num}`, wp);
  }
  return index;
}

function buildRFIIndex(rfis = []) {
  const index = new Map();
  for (const rfi of rfis) {
    if (!rfi || rfi.is_deleted) continue;
    const num = String(rfi.rfi_number || "").trim().toUpperCase().replace(/[-\s#]/g, "");
    if (num) index.set(num, rfi);
    if (!num.startsWith("RFI")) index.set(`RFI${num}`, rfi);
  }
  return index;
}

function buildSequenceIndex(workPackages = []) {
  const index = new Map();
  for (const wp of workPackages) {
    if (!wp || wp.is_deleted) continue;
    const seq = String(wp.sequence_number || "").trim().toUpperCase();
    if (seq) {
      if (!index.has(seq)) index.set(seq, []);
      index.get(seq).push(wp);
    }
  }
  return index;
}

// --- Main export ---

/**
 * Find suggested links for a piece of text against project entities.
 * Returns an array of { type, pattern, matchedEntity, entityType, entityId, confidence }.
 */
export function findAutoLinks(text, sources = {}) {
  const patterns = extractPatterns(text);
  if (patterns.length === 0) return [];

  const drawingIdx = buildDrawingIndex(sources.drawings);
  const wpIdx = buildWPIndex(sources.workPackages);
  const rfiIdx = buildRFIIndex(sources.rfis);
  const seqIdx = buildSequenceIndex(sources.workPackages);

  const suggestions = [];

  for (const p of patterns) {
    const key = p.value;

    if (p.type === "drawingNumber") {
      const drawing = drawingIdx.get(key) || drawingIdx.get(key.replace(/-/g, ""));
      if (drawing) {
        suggestions.push({
          type: "drawing",
          pattern: p.match,
          matchedEntity: drawing,
          entityType: "Drawing",
          entityId: drawing.id,
          label: `Drawing ${drawing.sheet_number}: ${drawing.title || ""}`,
          confidence: "high",
        });
      }
    }

    if (p.type === "wpCode") {
      const wp = wpIdx.get(key) || wpIdx.get(key.replace(/[-\s]/g, ""));
      if (wp) {
        suggestions.push({
          type: "work_package",
          pattern: p.match,
          matchedEntity: wp,
          entityType: "WorkPackage",
          entityId: wp.id,
          label: `WP ${wp.wp_number}: ${wp.name || ""}`,
          confidence: "high",
        });
      }
    }

    if (p.type === "rfiNumber") {
      const rfi = rfiIdx.get(key) || rfiIdx.get(key.replace(/[-\s]/g, ""));
      if (rfi) {
        suggestions.push({
          type: "rfi",
          pattern: p.match,
          matchedEntity: rfi,
          entityType: "RFI",
          entityId: rfi.id,
          label: `RFI ${rfi.rfi_number}: ${rfi.title || ""}`,
          confidence: "high",
        });
      }
    }

    if (p.type === "sequence") {
      const seqKey = `S${p.fullMatch[1]}`;
      const wps = seqIdx.get(seqKey) || seqIdx.get(`SEQUENCE${p.fullMatch[1]}`) || seqIdx.get(p.fullMatch[1]);
      if (wps && wps.length > 0) {
        for (const wp of wps) {
          suggestions.push({
            type: "sequence",
            pattern: p.match,
            matchedEntity: wp,
            entityType: "WorkPackage",
            entityId: wp.id,
            label: `Sequence ${wp.sequence_number} -> WP ${wp.wp_number || wp.name}`,
            confidence: "medium",
          });
        }
      }
    }
  }

  // Deduplicate by entityId
  const seen = new Set();
  return suggestions.filter(s => {
    if (seen.has(s.entityId)) return false;
    seen.add(s.entityId);
    return true;
  });
}

/**
 * Build link suggestions for a new/edited entity.
 * Scans title, description, drawing_reference, notes fields.
 */
export function suggestLinksForEntity(entity, sources = {}) {
  const textFields = [
    entity.title,
    entity.description,
    entity.question,
    entity.drawing_reference,
    entity.notes,
    entity.name,
    entity.spec_section,
  ].filter(Boolean);

  const text = textFields.join(" ");
  return findAutoLinks(text, sources);
}
