/**
 * wbsBuilder.js — Deterministic scope-of-work → WBS generator.
 *
 * Input: either a short category list ("Main Steel - Bldg. 1") OR a
 * bid-style numbered scope ("1. SC1 columns per P-S1.010 and P-S1.011"
 * with optional sub-items "1a. Railing per PA8.005A"). Both are
 * parsed with the same flow:
 *
 *     1. Split into items (numbered lines + continuation sub-items)
 *     2. Classify each item against an ordered keyword table
 *        (SCOPE_TYPES catalogue — 25+ entries covering columns, beams,
 *        moment frames, bracing, stairs, rails, ledgers, embeds, deck,
 *        studs, pour stops, bollards, equipment supports, RTU dunnage,
 *        PV supports, elevator steel, etc.)
 *     3. Expand each into a phase chain (Detailing → Procurement /
 *        Fabrication → Delivery → Installation) with per-type
 *        durations and dependencies
 *     4. Preserve the original scope text verbatim as the task name,
 *        with a phase suffix ("— Detailing", "— Fabrication", …) so
 *        drawing refs like "per P-S1.010 and P-S1.011" stay visible
 *        on the Gantt row
 *
 * Why deterministic (not AI)?
 *   - Zero external dependency: no API credits, no network round
 *     trip, offline-safe.
 *   - Predictable for PMs — the same scope always generates the same
 *     WBS, which makes estimating and template-sharing sane.
 *   - Easy to audit: every generated task traces back to a single
 *     regex hit in the user's text.
 *
 * Phase containment: every scope type declares its phases against the
 * canonical PHASES list from utils/phases.js. An assert at module
 * load (assertAllTypesValid) throws if any type uses a phase or
 * wbsPrefix outside the canonical set — the app fails loudly at
 * build rather than silently scheduling tasks into phases the Gantt
 * doesn't know about.
 */
import { PHASES, PHASE_ABBREV, PHASE_NUMBER } from "@/utils/phases";

// Fast-lookup sets for validation.
const VALID_PHASES  = new Set(PHASES);
const VALID_ABBREVS = new Set(Object.values(PHASE_ABBREV));

// ── Scope-type catalogue ────────────────────────────────────────────
//
// Each entry maps a classified scope type → a phase chain with per-
// phase durations (business days) and dependency links. `label` is a
// human-readable category name used by describeScopeItem() and the
// preview header. `verbs` are phase-specific suffixes appended to
// the original scope text (e.g. "— Erection" reads better than
// "— Installation" for structural columns).
//
// Adding a new scope type = one entry here + one (or more) regex
// classifiers below. Both lists are kept small and readable; priority
// of classifiers determines which type a line resolves to when the
// text could match multiple.
const SCOPE_TYPES = {
  // ─ Main structural frame ────────────────────────────────────────
  column: {
    label: "Columns",
    phases: [
      { phase: "Detailing",    duration: 14, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 28, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  2, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  7, wbsPrefix: "INS", verb: "Erection",     dependsOn: "Delivery" },
    ],
  },
  beam: {
    label: "Beams",
    phases: [
      { phase: "Detailing",    duration: 14, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 28, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  2, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  7, wbsPrefix: "INS", verb: "Erection",     dependsOn: "Delivery" },
    ],
  },
  girder: {
    label: "Girders",
    phases: [
      { phase: "Detailing",    duration: 14, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 28, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  2, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  7, wbsPrefix: "INS", verb: "Erection",     dependsOn: "Delivery" },
    ],
  },
  moment_frame: {
    label: "Moment Frames",
    phases: [
      { phase: "Detailing",    duration: 21, wbsPrefix: "DET", verb: "Detailing + Calcs" },
      { phase: "Fabrication",  duration: 35, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  2, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration: 10, wbsPrefix: "INS", verb: "Field Welds + Erection", dependsOn: "Delivery" },
    ],
  },
  bracing: {
    label: "Bracing",
    phases: [
      { phase: "Detailing",    duration: 10, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  5, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  truss: {
    label: "Trusses",
    phases: [
      { phase: "Detailing",    duration: 21, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 28, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  2, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  7, wbsPrefix: "INS", verb: "Erection",     dependsOn: "Delivery" },
    ],
  },
  mezzanine: {
    label: "Mezzanines",
    phases: [
      { phase: "Detailing",    duration: 14, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 21, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  2, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  7, wbsPrefix: "INS", verb: "Erection",     dependsOn: "Delivery" },
    ],
  },

  // ─ Embedments + base hardware ───────────────────────────────────
  anchor_bolt: {
    label: "Anchor Bolts / Rods",
    phases: [
      { phase: "Detailing",    duration:  7, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Procurement",  duration: 14, wbsPrefix: "PRO", verb: "Procurement",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Procurement" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Set",          dependsOn: "Delivery" },
    ],
  },
  embed: {
    label: "Embed Plates",
    phases: [
      { phase: "Detailing",    duration: 10, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Set w/ Concrete", dependsOn: "Delivery" },
    ],
  },
  base_plate: {
    label: "Base / Leveling Plates",
    phases: [
      { phase: "Detailing",    duration:  7, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 10, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Set + Grout",  dependsOn: "Delivery" },
    ],
  },
  shelf_angle: {
    label: "Shelf / Relieving / Edge Angles + Lintels",
    phases: [
      { phase: "Detailing",    duration:  7, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 10, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  pour_stop: {
    label: "Pour Stops / Edge Angles",
    phases: [
      { phase: "Detailing",    duration:  5, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 10, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  ledger: {
    label: "Ledger Angles",
    phases: [
      { phase: "Detailing",    duration:  7, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 10, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },

  // ─ Stairs + egress + rails + ladders ────────────────────────────
  stair: {
    label: "Stairs",
    phases: [
      { phase: "Detailing",    duration: 14, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  5, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  railing: {
    label: "Railings / Handrails / Guardrails",
    phases: [
      { phase: "Detailing",    duration:  7, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 10, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  ladder: {
    label: "Ladders",
    phases: [
      { phase: "Detailing",    duration:  7, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration:  7, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  2, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },

  // ─ Deck + studs ─────────────────────────────────────────────────
  deck: {
    label: "Metal Deck (Floor / Roof)",
    phases: [
      { phase: "Detailing",    duration:  5, wbsPrefix: "DET", verb: "Submittals" },
      { phase: "Procurement",  duration: 21, wbsPrefix: "PRO", verb: "Procurement",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  2, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Procurement" },
      { phase: "Installation", duration:  5, wbsPrefix: "INS", verb: "Place + Fasten", dependsOn: "Delivery" },
    ],
  },
  stud: {
    label: "Shear Studs",
    phases: [
      { phase: "Detailing",    duration:  3, wbsPrefix: "DET", verb: "Schedule" },
      { phase: "Procurement",  duration: 14, wbsPrefix: "PRO", verb: "Procurement",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Procurement" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Weld",         dependsOn: "Delivery" },
    ],
  },

  // ─ Secondary / architectural steel ──────────────────────────────
  canopy: {
    label: "Canopies",
    phases: [
      { phase: "Detailing",    duration: 10, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  5, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  grating: {
    label: "Grating / Checker Plate",
    phases: [
      { phase: "Detailing",    duration:  5, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Procurement",  duration: 14, wbsPrefix: "PRO", verb: "Procurement",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Procurement" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  bollard: {
    label: "Bollards",
    phases: [
      { phase: "Detailing",    duration:  3, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration:  7, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  2, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  bike_rack: {
    label: "Bike Racks",
    phases: [
      { phase: "Detailing",    duration:  2, wbsPrefix: "DET", verb: "Submittal" },
      { phase: "Procurement",  duration: 14, wbsPrefix: "PRO", verb: "Procurement",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Procurement" },
      { phase: "Installation", duration:  2, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  equipment_support: {
    label: "Equipment Support Steel",
    phases: [
      { phase: "Detailing",    duration: 10, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  5, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  rtu_dunnage: {
    label: "RTU Dunnage",
    phases: [
      { phase: "Detailing",    duration: 10, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  5, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  pv_support: {
    label: "PV / Solar Support Steel",
    phases: [
      { phase: "Detailing",    duration: 10, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  5, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  elevator: {
    label: "Elevator Steel",
    phases: [
      { phase: "Detailing",    duration: 14, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 21, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  2, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  7, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  safety: {
    label: "Safety / Fall-Protection Steel",
    phases: [
      { phase: "Detailing",    duration:  7, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 10, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  roof_screen: {
    label: "Roof / Mechanical Screens",
    phases: [
      { phase: "Detailing",    duration:  7, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 10, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  3, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  misc: {
    label: "Miscellaneous Steel",
    phases: [
      { phase: "Detailing",    duration: 10, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  5, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
  generic: {
    label: "Steel Scope",
    phases: [
      { phase: "Detailing",    duration:  7, wbsPrefix: "DET", verb: "Detailing" },
      { phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", verb: "Fabrication",  dependsOn: "Detailing" },
      { phase: "Delivery",     duration:  1, wbsPrefix: "DEL", verb: "to Site",      dependsOn: "Fabrication" },
      { phase: "Installation", duration:  5, wbsPrefix: "INS", verb: "Install",      dependsOn: "Delivery" },
    ],
  },
};

// Exposed (backward compat with the older SCOPE_ITEMS export).
export const __SCOPE_TYPES__ = SCOPE_TYPES;
export const WBS_SCOPE_ITEM_KEYS = Object.keys(SCOPE_TYPES);
export function describeScopeItem(typeKey) {
  return SCOPE_TYPES[typeKey]?.label || typeKey;
}

// ── Classifiers ─────────────────────────────────────────────────────
//
// Priority-ordered list: the first regex to match a line's text wins.
// Put the MOST SPECIFIC patterns at the top (e.g. "moment frame" must
// match before plain "frame", "bike rack" must match before "rack").
// The last entry `/./` is the generic fallback so every line classifies
// into something — the modal surfaces generics so the user can review.
const CLASSIFIERS = [
  // Specialty / high-signal keywords first
  { type: "pv_support",        re: /\bpv\b|\bphotovoltaic|\bsolar\s*(support|screen|racking)/i },
  { type: "rtu_dunnage",       re: /\brtu[\s-]*dunnage|\bdunnage[\s-]*(fram|steel)/i },
  { type: "moment_frame",      re: /\bmoment[\s-]?(resist(?:ing)?[\s-]?)?frames?\b|\b(?:smf|omf|bfrs)\b/i },
  { type: "elevator",          re: /\belevator\b|\bhoist[\s-]?beam|\bhoistway\b/i },
  { type: "bracing",           re: /\b(?:x|k|v|chevron)[\s-]?brac(?:e|ing)\b|\b(?:lateral|cross)[\s-]?brac/i },
  { type: "truss",             re: /\btrusses?\b/i },
  { type: "mezzanine",         re: /\bmezzan/i },
  { type: "roof_screen",       re: /\b(?:roof|mechanical|mech)[\s-]?screen/i },
  { type: "canopy",            re: /\bcanop(?:y|ies)|\bawning|\bsunshade|\bentry[\s-]?canopy/i },
  { type: "equipment_support", re: /\b(?:equipment|mechanical|electrical|transformer|generator)\s+(?:support|curb|fram|skid|pad)|\b(?:transformer|generator)\s*(pad|skid)\b/i },

  // Safety / egress / rails first (before generic frames/beams)
  { type: "ladder",            re: /\bladders?\b|\broof[\s-]?access(?:\s*ladder)?\b|\bship(?:'|’)?s[\s-]?ladder/i },
  { type: "safety",            re: /\b(?:fall[\s-]?protection|safety[\s-]?(anchor|line|cage)|anchor[\s-]?point)/i },
  { type: "stair",             re: /\bstair(?:case|tower|s)?\b|\begress\s*stair|\bjump[\s-]?stair/i },
  { type: "railing",           re: /\b(?:hand|guard|grab|cable|pipe)?[\s-]?rail(?:ing)?s?\b|\btoe[\s-]?(plate|board)/i },

  // Accessories
  { type: "bike_rack",         re: /\bbike[\s-]?rack/i },
  { type: "bollard",           re: /\bbollards?\b/i },
  { type: "grating",           re: /\b(?:bar[\s-]?)?gratings?\b|\bcheck(?:er(?:ed)?)?[\s-]?plate|\bdiamond[\s-]?plate/i },

  // Deck / studs
  { type: "stud",              re: /\b(?:shear|headed)[\s-]?studs?\b/i },
  { type: "deck",              re: /\b(?:metal|composite|roof|floor|steel)[\s-]?deck(?:ing)?\b|\btype[\s-]?b[\s-]?(roof[\s-]?)?deck|\bcomposite[\s-]?deck/i },

  // Embedments / plates / small steel
  { type: "pour_stop",         re: /\bpour[\s-]?stop/i },
  { type: "anchor_bolt",       re: /\banchor[\s-]?(bolt|rod)s?\b|\banchor\s*hardware\b|\bab['']?s?\b(?!ec)/i },
  { type: "base_plate",        re: /\b(?:base|bearing|leveling)[\s-]?(plate|nut)s?\b/i },
  { type: "shelf_angle",       re: /\b(?:shelf|reliev(?:ing)?|relief|masonry)[\s-]?angles?\b|\blintels?\b|\bedge[\s-]?angles?\b/i },
  { type: "ledger",            re: /\bledgers?\b/i },
  { type: "embed",             re: /\bembed(?:ment|ded)?[\s-]?(plate|steel)?s?\b|\bembeds?\b|\bpanel[\s-]?embeds?/i },

  // Primary structural — these are LAST among specific types because
  // "beam" / "column" / "girder" often appear in lines that more
  // specifically describe a moment frame, bracing, etc.
  { type: "girder",            re: /\bgirders?\b/i },
  { type: "beam",              re: /\bbeams?\b|\bw\d+x\d+\b/i },
  { type: "column",            re: /\bcolumns?\b|\bsc\d+\b|\bhss[\s-]?\d+\w*[\s-]?x[\s-]?\d/i },

  // Catch-all misc
  { type: "misc",              re: /\bmisc(?:ellaneous)?[\s-]?(?:steel|metals?|items?)\b|\bsite[\s-]?misc\b|\btrench[\s-]?frames?\b|\bdumpster[\s-]?enclosures?\b|\bdoor[\s-]?frames?\b/i },

  // Absolute fallback — anything non-empty gets generic
  { type: "generic",           re: /\S/ },
];

/** Pick a SCOPE_TYPES key from a free-text scope line. */
export function classifyScopeLine(text) {
  if (!text) return "generic";
  for (const c of CLASSIFIERS) {
    if (c.re.test(text)) return c.type;
  }
  return "generic";
}

// ── Parsing ─────────────────────────────────────────────────────────
//
// Two input shapes, auto-detected:
//
// Bid-style (preferred for richer scopes):
//     1. SC1 columns per P-S1.010 and P-S1.011
//     2. W27x84 beams per P-S1.012 and P-S1.013
//     3. Canopy per P-S1.012 and P-S1.013 ref detail 308
//     a. Railing per PA8.005A        ← sub-item of most-recent top-level
//     b. Installed with titen HD
//     ii. Another sub-item           ← lowercase roman
//
// Category-list (the original simpler flow, still supported):
//     Main Steel - Bldg. 1 & 2
//     Stairs
//     Railings
//
// Detection is simple: if at least ~40% of non-empty lines start with
// a number+period token, we treat the whole thing as bid-style. That
// way a mixed input ("1. Item\n2. Item\nExtra note") still parses
// correctly without forcing the user to pick a format.

// Extract buildings ("Bldg. 1 & 2", "Building A, B") so one scope line
// can emit one task group per building without the user duplicating.
const BUILDING_RE = /\b(?:bldg\.?|building)\s*([A-Za-z0-9&,\s]{1,30}?)(?=(?:[:;\-–—]|$))/i;
function extractBuildings(line) {
  const m = BUILDING_RE.exec(line);
  if (!m) return [];
  const raw = m[1].trim().replace(/\band\b/gi, "&");
  return raw
    .split(/[,&]/)
    .map((p) => p.trim())
    .filter((p) => /^[A-Za-z0-9]+$/.test(p));
}

// Extract drawing refs (P-S1.010, PA6.003, A-101, S-301, etc.) and
// detail refs ("Detail 308", "Detail PT8", "5/PA8.002", "keynote 107",
// "ref S3/P-S2.003") — stashed on the task's metadata so the detailer
// can see which sheet the scope traces back to without opening the
// original bid doc.
const DRAWING_REF_RE = /\b[A-Z]{1,3}[-]?[A-Z]?\d+\.\d{3}[A-Z]?\b/g;    // P-S1.010, PA8.005A, PA1.101B
const DETAIL_REF_RE  = /\b(?:ref(?:erence)?\s+)?(?:detail\s+[A-Z]*\d+|[A-Z]*\d+\s*\/\s*[A-Z-]+\d+(?:\.\d+)?[A-Z]?|keynote\s+\d+(?:\/[A-Z-]+\d+(?:\.\d+)?[A-Z]?)?)/gi;

function extractRefs(text) {
  if (!text) return { drawings: [], details: [] };
  const drawings = Array.from(new Set((text.match(DRAWING_REF_RE) || []).map((s) => s.trim())));
  const details  = Array.from(new Set((text.match(DETAIL_REF_RE)  || []).map((s) => s.replace(/\s+/g, " ").trim())));
  return { drawings, details };
}

// Collapse whitespace + strip leading bullet / number tokens so the
// task label reads cleanly on the Gantt. Preserves drawing refs.
function cleanLabel(raw) {
  if (!raw) return "";
  return raw
    .replace(/^\s*(?:\d+[a-z]?|[a-z]|[ivx]+)\.\s*/i, "")   // "1.", "1a.", "a.", "ii."
    .replace(/^\s*[-•*]\s*/, "")                         // bullet markers
    .replace(/\s+/g, " ")
    .trim();
}

// Is a given line a numbered or sub-numbered item? Returns the parsed
// tokens so callers can group sub-items under their parent.
const NUM_LINE_RE = /^\s*(\d+)\s*\.\s+(.*)$/;               // "1. Foo"
const SUB_LINE_RE = /^\s*(\d+)?([a-z])\s*\.\s+(.*)$/i;      // "1a. Foo", "a. Foo"
function parseLineHeader(line) {
  const top = NUM_LINE_RE.exec(line);
  if (top) return { kind: "top", number: parseInt(top[1], 10), rest: top[2] };
  const sub = SUB_LINE_RE.exec(line);
  if (sub) return { kind: "sub", parentNumber: sub[1] ? parseInt(sub[1], 10) : null, suffix: sub[2].toLowerCase(), rest: sub[3] };
  return { kind: "cont", rest: line.trim() };
}

function isBidStyle(lines) {
  if (!lines || lines.length === 0) return false;
  let numbered = 0;
  for (const l of lines) {
    if (NUM_LINE_RE.test(l) || SUB_LINE_RE.test(l)) numbered += 1;
  }
  return numbered >= 2 && (numbered / lines.length) >= 0.3;
}

/**
 * Parse the scope. Returns:
 *   {
 *     items: [{
 *       typeKey, label, buildings, drawingRefs, detailRefs,
 *       sourceText, parentIndex?  // sub-items reference their parent
 *     }],
 *     unmatched: []               // reserved for future strict-mode use
 *   }
 */
export function parseScope(text) {
  const items = [];
  if (!text || typeof text !== "string") return { items, unmatched: [] };
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/g, "")).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return { items, unmatched: [] };

  // Group continuation lines into logical "items". A new top-level
  // (numbered) line starts a new item; a sub-line becomes a child of
  // the most recent top-level; continuation lines append to whichever
  // item is currently open.
  const bid = isBidStyle(rawLines);
  const groups = []; // [{ lines: [string], parentIndex?: number }]
  let currentTopIdx = -1;
  for (const line of rawLines) {
    if (!bid) {
      // Category-list mode — every non-empty line is its own item.
      groups.push({ lines: [line], parentIndex: null });
      continue;
    }
    const h = parseLineHeader(line);
    if (h.kind === "top") {
      groups.push({ lines: [line], parentIndex: null });
      currentTopIdx = groups.length - 1;
    } else if (h.kind === "sub") {
      groups.push({ lines: [line], parentIndex: currentTopIdx >= 0 ? currentTopIdx : null });
    } else {
      // continuation — attach to the most recent group
      if (groups.length === 0) groups.push({ lines: [line], parentIndex: null });
      else groups[groups.length - 1].lines.push(line);
    }
  }

  // Build items from groups
  for (const group of groups) {
    const sourceText = group.lines.join(" ").trim();
    const firstLine = group.lines[0];
    const headerRest = (() => {
      const h = parseLineHeader(firstLine);
      if (h.kind === "top" || h.kind === "sub") return h.rest;
      return firstLine;
    })();
    const label = cleanLabel(headerRest + " " + group.lines.slice(1).join(" "));
    if (!label) continue;
    const typeKey = classifyScopeLine(sourceText);
    const buildings = extractBuildings(sourceText);
    const { drawings: drawingRefs, details: detailRefs } = extractRefs(sourceText);
    items.push({
      typeKey,
      label,
      buildings,
      drawingRefs,
      detailRefs,
      sourceText,
      parentIndex: group.parentIndex ?? null,
    });
  }

  return { items, unmatched: [] };
}

// ── Build WBS ───────────────────────────────────────────────────────
/**
 * Expand a parsed scope into schedule_tasks-shaped rows.
 *   - One task per phase in the scope type's chain
 *   - Label preserves the original scope text with a phase verb
 *     ("per P-S1.010 — Detailing", "per P-S1.010 — Erection")
 *   - If buildings were detected, emit one group per building
 *   - Sub-items inherit their parent's building set so "28a. Railing"
 *     lands in the same building as "28. North Stair A and B"
 *   - Dependencies link within a group via depends_on_wbs
 *   - Dates step sequentially from startDate using the chain's
 *     dependsOn links; groups run in parallel (independent of each
 *     other)
 *
 * Returns: { tasks, summary: { tasksByPhase, totalDays, phasesAllowed, rejected } }
 */
export function buildWbs(parseResult, { startDate = null } = {}) {
  const tasks = [];
  const phaseCounters = {};
  const start = resolveStartDate(startDate);

  const items = parseResult?.items || [];
  let groupIndex = 0;
  items.forEach((item, idx) => {
    const type = SCOPE_TYPES[item.typeKey] || SCOPE_TYPES.generic;
    if (!type) return;
    // Sub-items inherit buildings from their parent top-level; if the
    // sub-item has its own, those win.
    const parent = item.parentIndex != null ? items[item.parentIndex] : null;
    const inheritedBuildings = (parent?.buildings?.length > 0 ? parent.buildings : []);
    const ownBuildings = item.buildings?.length > 0 ? item.buildings : [];
    const buildings = ownBuildings.length > 0 ? ownBuildings : inheritedBuildings;
    const expanded = buildings.length > 0 ? buildings : [null];

    for (const bldg of expanded) {
      groupIndex += 1;
      const buildingSuffix = bldg ? ` — Bldg. ${bldg}` : "";
      // The label is the user's original scope text; we append phase
      // verb so the four phase rows are distinguishable. Scope text
      // wins out over the type's generic label so drawing refs stay
      // visible on each row.
      const base = item.label + buildingSuffix;
      const byPhase = {};
      let cursor = new Date(start);

      for (const tmpl of type.phases) {
        // Skip invalid templates (assertAllTypesValid catches this at
        // module load, but defend at runtime too).
        if (!VALID_PHASES.has(tmpl.phase)) continue;

        let taskStart;
        let depWbs = null;
        if (tmpl.dependsOn && byPhase[tmpl.dependsOn]) {
          const depEnd = new Date(byPhase[tmpl.dependsOn].end_date + "T00:00:00Z");
          depEnd.setUTCDate(depEnd.getUTCDate() + 1);
          taskStart = depEnd;
          depWbs = byPhase[tmpl.dependsOn].wbs_code;
        } else {
          taskStart = new Date(cursor);
        }
        const taskEnd = new Date(taskStart);
        taskEnd.setUTCDate(taskEnd.getUTCDate() + Math.max(1, tmpl.duration) - 1);

        // Counters still keyed by the legacy wbsPrefix so phases that
        // share a prefix (e.g. multiple Detailing scope types) count
        // independently of Fabrication / Delivery. Output format is
        // the new decimal scheme "<phase>.<n>" keyed off PHASE_NUMBER.
        phaseCounters[tmpl.wbsPrefix] = (phaseCounters[tmpl.wbsPrefix] || 0) + 1;
        const phaseNum = PHASE_NUMBER[tmpl.phase] ?? 0;
        const wbs_code = `${phaseNum}.${phaseCounters[tmpl.wbsPrefix]}`;

        const task = {
          task_name:      `${base} — ${tmpl.verb}`,
          phase:          tmpl.phase,
          wbs_code,
          start_date:     toIsoDate(taskStart),
          end_date:       toIsoDate(taskEnd),
          duration:       Math.max(1, tmpl.duration),
          depends_on_wbs: depWbs,
          // Non-persisted hints — the modal uses these for the preview
          // grouping / drawing-ref chip.
          _scopeGroupIndex: groupIndex,
          _scopeLabel:      type.label,
          _scopeTypeKey:    item.typeKey,
          _drawingRefs:     item.drawingRefs.slice(),
          _detailRefs:      item.detailRefs.slice(),
          _sourceText:      item.sourceText,
          _subOf:           item.parentIndex != null ? idx : null,
        };
        tasks.push(task);
        byPhase[tmpl.phase] = { wbs_code, end_date: task.end_date };
        if (taskEnd > cursor) cursor = new Date(taskEnd);
      }
    }
  });

  // Runtime guard — belt-and-suspenders.
  const validated = tasks.filter((t) => VALID_PHASES.has(t.phase));
  const rejected = tasks.length - validated.length;

  const tasksByPhase = {};
  for (const t of validated) tasksByPhase[t.phase] = (tasksByPhase[t.phase] || 0) + 1;
  let totalDays = 0;
  if (validated.length > 0) {
    const first = validated.reduce((m, t) => (t.start_date < m ? t.start_date : m), validated[0].start_date);
    const last  = validated.reduce((m, t) => (t.end_date   > m ? t.end_date   : m), validated[0].end_date);
    totalDays = daysBetween(first, last);
  }

  return {
    tasks: validated,
    summary: { tasksByPhase, totalDays, phasesAllowed: PHASES.slice(), rejected },
  };
}

// ── Phase-containment guard ─────────────────────────────────────────
function assertAllTypesValid() {
  const violations = [];
  for (const [key, type] of Object.entries(SCOPE_TYPES)) {
    if (!type?.phases?.length) continue;
    for (const tmpl of type.phases) {
      if (!VALID_PHASES.has(tmpl.phase)) {
        violations.push(`SCOPE_TYPES.${key}: phase "${tmpl.phase}" not in canonical PHASES`);
      }
      if (!VALID_ABBREVS.has(tmpl.wbsPrefix)) {
        violations.push(`SCOPE_TYPES.${key}: wbsPrefix "${tmpl.wbsPrefix}" not in canonical PHASE_ABBREV`);
      }
      if (PHASE_ABBREV[tmpl.phase] && PHASE_ABBREV[tmpl.phase] !== tmpl.wbsPrefix) {
        violations.push(`SCOPE_TYPES.${key}: phase ${tmpl.phase} should use prefix ${PHASE_ABBREV[tmpl.phase]}, got ${tmpl.wbsPrefix}`);
      }
      if (tmpl.dependsOn) {
        const exists = type.phases.some((t) => t.phase === tmpl.dependsOn);
        if (!exists) {
          violations.push(`SCOPE_TYPES.${key}: dependsOn "${tmpl.dependsOn}" not generated by this type`);
        }
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`wbsBuilder: invalid scope-type definition(s):\n  - ${violations.join("\n  - ")}`);
  }
}
assertAllTypesValid();

/** Validate a generated WBS against the canonical phase list. */
export function validateWbsPhases(tasks) {
  const violations = [];
  for (const t of (tasks || [])) {
    if (!VALID_PHASES.has(t.phase)) {
      violations.push(`Task "${t.task_name}" has phase "${t.phase}" (not canonical)`);
    }
  }
  return { ok: violations.length === 0, violations };
}

// ── Helpers ─────────────────────────────────────────────────────────
function resolveStartDate(input) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    const d = new Date(input + "T00:00:00Z");
    if (!Number.isNaN(d.getTime())) return d;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function toIsoDate(d) { return d.toISOString().slice(0, 10); }
function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return Math.round((db - da) / 86400000);
}

// ── Back-compat exports ─────────────────────────────────────────────
//
// The old WbsBuilderModal.jsx path expected a SCOPE_ITEMS-shaped
// object and a `parseScope → { hits: [{ itemKey, buildings, rawLine }]
// , unmatched: [...] }`. We ship a compatibility shim so older tests
// or imports keep working, but the primary API is now `items[]`.
export const __SCOPE_ITEMS__ = Object.fromEntries(
  Object.entries(SCOPE_TYPES).map(([key, t]) => [
    key,
    { label: t.label, matches: [/^$/], tasks: t.phases.map((p) => ({
      label: `${t.label} ${p.verb}`,
      phase: p.phase,
      duration: p.duration,
      wbsPrefix: p.wbsPrefix,
      dependsOn: p.dependsOn,
    })) },
  ]),
);
