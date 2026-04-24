/**
 * wbsBuilder.js — Deterministic scope-of-work → WBS generator.
 *
 * The user types (or pastes) a scope description and this module
 * turns it into a draft Work Breakdown Structure: a list of
 * schedule_tasks keyed by phase, with durations, dependencies, and
 * human-readable WBS codes. The result is a preview the user can
 * edit before committing to the schedule — no destructive writes
 * happen here.
 *
 * Why deterministic (not AI)?
 *   - Zero external dependency (no API credits, no network round
 *     trip, offline-safe).
 *   - Predictable for PMs — same scope always generates the same
 *     WBS, which makes estimating + template-sharing sane.
 *   - Easy to audit: every generated task traces back to a single
 *     regex hit in the user's text.
 *
 * The keyword library below is tuned for steel-shop scopes (anchor
 * bolts, embeds, main steel, joists, stairs, railing, miscellaneous
 * steel, etc.). Adding a new trade / scope item is a single entry
 * in SCOPE_ITEMS.
 *
 * Phase containment: every generated task MUST use one of the
 * canonical PHASES from utils/phases.js. The assertAllTemplatesValid
 * self-test below runs at module load so a typo ("Installations" vs
 * "Installation") fails loudly rather than silently scheduling tasks
 * into a phase the Gantt doesn't know about.
 *
 * Core flow:
 *   parseScope(text)        → [{ itemKey, matches, buildingRef? }, ...]
 *   buildWbs(parsed, opts)  → { tasks, warnings, summary }
 *   toScheduleTaskRows(wbs) → schedule_tasks payload ready for insert
 */
import { PHASES, PHASE_ABBREV } from "@/utils/phases";

// Fast-lookup set for validation.
const VALID_PHASES = new Set(PHASES);
const VALID_ABBREVS = new Set(Object.values(PHASE_ABBREV));

// ── Canonical scope items ───────────────────────────────────────────
//
// Each entry is a *scope element* that usually generates one task per
// relevant phase (Detailing → Procurement / Fabrication → Delivery →
// Installation). Durations are defaults in business days — the user
// can edit them in the preview before committing.
//
// `matches` is an array of regexes; the first match wins. Be generous
// with synonyms (anchor bolts / AB / anchors) — missing a scope item
// is more annoying than an extra task the user deletes.
//
// `tasks` lists the phase-level tasks this scope generates. Each task
// declares:
//   label        — base task name (suffix attached from the scope item)
//   phase        — canonical phase key (must match utils/phases.js PHASES)
//   duration     — business days; app multiplies × 1 day for now
//   wbsPrefix    — 3-letter abbrev used in wbs_code
//   dependsOn    — phase key of the task this one waits on (or null)
//
// The first detailing task is typically predecessor for the
// procurement / fab task, which is predecessor for delivery, which
// is predecessor for installation. `dependsOn` captures that chain
// so the Gantt lays them out in sequence automatically.
const SCOPE_ITEMS = {
  anchor_bolts: {
    label: "Anchor Bolts",
    matches: [/\banchor[\s-]?bolts?\b/i, /\bab['']?s\b/i, /\ba\.?\s*b\.?\b(?!\w)/i],
    tasks: [
      { label: "Anchor Bolt Detailing",    phase: "Detailing",    duration: 10, wbsPrefix: "DET" },
      { label: "Anchor Bolt Procurement",  phase: "Procurement",  duration: 14, wbsPrefix: "PRO", dependsOn: "Detailing" },
      { label: "Anchor Bolts to Site",     phase: "Delivery",     duration:  1, wbsPrefix: "DEL", dependsOn: "Procurement" },
      { label: "Anchor Bolt Install",      phase: "Installation", duration:  3, wbsPrefix: "INS", dependsOn: "Delivery" },
    ],
  },
  embeds: {
    label: "Panel Embeds",
    matches: [/\bpanel[\s-]?embeds?\b/i, /\bembeds?\b/i, /\bembed(?:ded)?\s+plates?\b/i],
    tasks: [
      { label: "Panel Embed Detailing",    phase: "Detailing",    duration: 10, wbsPrefix: "DET" },
      { label: "Panel Embed Fabrication",  phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", dependsOn: "Detailing" },
      { label: "Panel Embeds to Site",     phase: "Delivery",     duration:  1, wbsPrefix: "DEL", dependsOn: "Fabrication" },
      { label: "Panel Embed Install",      phase: "Installation", duration:  3, wbsPrefix: "INS", dependsOn: "Delivery" },
    ],
  },
  main_steel: {
    label: "Main Steel",
    matches: [
      /\bmain[\s-]?steel\b/i,
      /\bstructural[\s-]?steel\b/i,
      /\b(?:steel[\s-]?)?frame\b/i,
      /\bcolumns?\s*(?:&|and)?\s*beams?\b/i,
    ],
    tasks: [
      { label: "Main Steel Detailing",     phase: "Detailing",    duration: 21, wbsPrefix: "DET" },
      { label: "Main Steel Fabrication",   phase: "Fabrication",  duration: 28, wbsPrefix: "FAB", dependsOn: "Detailing" },
      { label: "Main Steel to Site",       phase: "Delivery",     duration:  2, wbsPrefix: "DEL", dependsOn: "Fabrication" },
      { label: "Main Steel Erection",      phase: "Installation", duration: 14, wbsPrefix: "INS", dependsOn: "Delivery" },
    ],
  },
  stairs: {
    label: "Stairs",
    matches: [/\bstairs?\b/i, /\bstair[\s-]?(?:case|tower)s?\b/i],
    tasks: [
      { label: "Stair Detailing",          phase: "Detailing",    duration: 14, wbsPrefix: "DET" },
      { label: "Stair Fabrication",        phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", dependsOn: "Detailing" },
      { label: "Stairs to Site",           phase: "Delivery",     duration:  1, wbsPrefix: "DEL", dependsOn: "Fabrication" },
      { label: "Stair Install",            phase: "Installation", duration:  5, wbsPrefix: "INS", dependsOn: "Delivery" },
    ],
  },
  railing: {
    label: "Railings",
    matches: [/\bhand[\s-]?rails?\b/i, /\brailing\b/i, /\bguard[\s-]?rails?\b/i, /\bbalcony[\s-]?rails?\b/i],
    tasks: [
      { label: "Railing Detailing",        phase: "Detailing",    duration: 10, wbsPrefix: "DET" },
      { label: "Railing Fabrication",      phase: "Fabrication",  duration: 10, wbsPrefix: "FAB", dependsOn: "Detailing" },
      { label: "Railings to Site",         phase: "Delivery",     duration:  1, wbsPrefix: "DEL", dependsOn: "Fabrication" },
      { label: "Railing Install",          phase: "Installation", duration:  5, wbsPrefix: "INS", dependsOn: "Delivery" },
    ],
  },
  joists_deck: {
    label: "Joists / Deck",
    matches: [
      /\bjoists?\b/i,
      /\b(?:metal|steel)?[\s-]?deck(?:ing)?\b/i,
      /\bbar[\s-]?joist[s]?\b/i,
    ],
    tasks: [
      { label: "Joist / Deck Detailing",   phase: "Detailing",    duration: 10, wbsPrefix: "DET" },
      { label: "Joist / Deck Procurement", phase: "Procurement",  duration: 28, wbsPrefix: "PRO", dependsOn: "Detailing" },
      { label: "Joists / Deck to Site",    phase: "Delivery",     duration:  2, wbsPrefix: "DEL", dependsOn: "Procurement" },
      { label: "Joist / Deck Install",     phase: "Installation", duration: 10, wbsPrefix: "INS", dependsOn: "Delivery" },
    ],
  },
  ladders: {
    label: "Ladders",
    matches: [/\bladders?\b/i, /\broof[\s-]?access\b/i, /\bship[\s-]?(?:s|['']s)?[\s-]?ladder\b/i],
    tasks: [
      { label: "Ladder Detailing",         phase: "Detailing",    duration:  7, wbsPrefix: "DET" },
      { label: "Ladder Fabrication",       phase: "Fabrication",  duration:  7, wbsPrefix: "FAB", dependsOn: "Detailing" },
      { label: "Ladders to Site",          phase: "Delivery",     duration:  1, wbsPrefix: "DEL", dependsOn: "Fabrication" },
      { label: "Ladder Install",           phase: "Installation", duration:  2, wbsPrefix: "INS", dependsOn: "Delivery" },
    ],
  },
  canopy: {
    label: "Canopies",
    matches: [/\bcanop(?:y|ies)\b/i, /\bawning[s]?\b/i, /\bentry[\s-]?canop(?:y|ies)\b/i],
    tasks: [
      { label: "Canopy Detailing",         phase: "Detailing",    duration: 10, wbsPrefix: "DET" },
      { label: "Canopy Fabrication",       phase: "Fabrication",  duration: 10, wbsPrefix: "FAB", dependsOn: "Detailing" },
      { label: "Canopies to Site",         phase: "Delivery",     duration:  1, wbsPrefix: "DEL", dependsOn: "Fabrication" },
      { label: "Canopy Install",           phase: "Installation", duration:  5, wbsPrefix: "INS", dependsOn: "Delivery" },
    ],
  },
  misc: {
    label: "Miscellaneous Steel",
    matches: [
      /\bmisc(?:ellaneous)?[\s-]?(?:steel|metals?)\b/i,
      /\bsite[\s-]?misc\b/i,
      /\bbollards?\b/i,
      /\btrench[\s-]?frames?\b/i,
      /\bdumpster[\s-]?enclosures?\b/i,
    ],
    tasks: [
      { label: "Site Misc Detailing",      phase: "Detailing",    duration: 10, wbsPrefix: "DET" },
      { label: "Site Misc Fabrication",    phase: "Fabrication",  duration: 14, wbsPrefix: "FAB", dependsOn: "Detailing" },
      { label: "Site Misc to Site",        phase: "Delivery",     duration:  1, wbsPrefix: "DEL", dependsOn: "Fabrication" },
      { label: "Site Misc Install",        phase: "Installation", duration:  5, wbsPrefix: "INS", dependsOn: "Delivery" },
    ],
  },
};

export const WBS_SCOPE_ITEM_KEYS = Object.keys(SCOPE_ITEMS);

// ── Building-reference parser ──────────────────────────────────────
//
// Scopes often say "Anchor Bolts — Bldg. 1 & 2" or "Main Steel —
// Building A, Building B". We extract those so the generator can
// emit one group per building instead of collapsing them. Missing a
// building reference is fine — that line just becomes a single group.
const BUILDING_RE = /\b(?:bldg\.?|building)\s*([A-Za-z0-9&,\s]{1,30}?)(?=(?:[:;\-–—]|$))/i;

function extractBuildings(line) {
  const m = BUILDING_RE.exec(line);
  if (!m) return [];
  // "1 & 2"      → ["1", "2"]
  // "A, B, C"    → ["A", "B", "C"]
  // "2"          → ["2"]
  const raw = m[1].trim().replace(/\band\b/gi, "&");
  const parts = raw
    .split(/[,&]/)
    .map((p) => p.trim())
    .filter((p) => /^[A-Za-z0-9]+$/.test(p));
  return parts;
}

// ── Parse ───────────────────────────────────────────────────────────
/**
 * Break the scope text into lines, detect scope items per line, and
 * return a structured parse result. Each hit carries the matching
 * line (for the UI preview) and any extracted building references.
 *
 * Returns: {
 *   hits: [{ itemKey, buildings: [...], rawLine }],
 *   unmatched: [rawLine, ...],
 * }
 *
 * A single line can hit multiple scope items (e.g. "Anchor Bolts +
 * Embeds — Bldg. 1"). We emit one hit per (item, line) pair.
 */
export function parseScope(text) {
  const hits = [];
  const unmatched = [];
  if (!text || typeof text !== "string") return { hits, unmatched };

  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const line of lines) {
    let matchedAny = false;
    const buildings = extractBuildings(line);
    for (const [key, item] of Object.entries(SCOPE_ITEMS)) {
      if (item.matches.some((re) => re.test(line))) {
        hits.push({ itemKey: key, buildings, rawLine: line });
        matchedAny = true;
      }
    }
    if (!matchedAny) unmatched.push(line);
  }

  return { hits, unmatched };
}

// ── Build WBS ───────────────────────────────────────────────────────
/**
 * Expand a parsed scope into a list of schedule_tasks-shaped rows.
 *
 * Strategy:
 *   - For each hit, emit one task per phase-template in its scope item.
 *   - If the hit has multiple buildings, emit one task group per
 *     building with its label suffixed ("- Bldg. 1", "- Bldg. 2").
 *   - Compute dates sequentially from `startDate`, respecting
 *     per-task `dependsOn` (FS + 1 day lag). Dates stored in
 *     YYYY-MM-DD.
 *   - WBS codes: each phase's tasks share a running counter across
 *     the whole build (DET-001, DET-002, …), so reading the schedule
 *     top-to-bottom matches source order.
 *
 * Returns: {
 *   tasks: [{ task_name, phase, wbs_code, start_date, end_date,
 *             duration, depends_on_wbs }],
 *   summary: { tasksByPhase: {Detailing: N, ...}, totalDays },
 * }
 */
export function buildWbs(parseResult, { startDate = null } = {}) {
  const tasks = [];
  const phaseCounters = {}; // wbsPrefix → next index
  const start = resolveStartDate(startDate);

  // Per-hit "last task per phase" lookup so dependsOn resolves to a
  // real wbs_code. We only chain within the same hit group (you don't
  // want "Anchor Bolt Install" waiting on "Embeds Delivery").
  let groupIndex = 0;
  for (const hit of (parseResult?.hits || [])) {
    const item = SCOPE_ITEMS[hit.itemKey];
    if (!item) continue;
    const buildings = hit.buildings.length > 0 ? hit.buildings : [null];
    for (const building of buildings) {
      groupIndex += 1;
      const suffix = building ? ` — Bldg. ${building}` : "";
      const byPhase = {}; // phase → { wbs_code, end_date }
      // Cursor advances as we chain tasks. Seed with project start.
      let cursor = new Date(start);

      for (const tmpl of item.tasks) {
        // Advance start to the day after the dependsOn task's end,
        // if this tmpl has one; otherwise sequential from the current
        // cursor. If dependsOn isn't found (misconfigured template),
        // fall back to cursor so we don't create floating tasks.
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

        phaseCounters[tmpl.wbsPrefix] = (phaseCounters[tmpl.wbsPrefix] || 0) + 1;
        const wbs_code = `${tmpl.wbsPrefix}-${String(phaseCounters[tmpl.wbsPrefix]).padStart(3, "0")}`;

        const task = {
          task_name:      `${tmpl.label}${suffix}`.trim(),
          phase:          tmpl.phase,
          wbs_code,
          start_date:     toIsoDate(taskStart),
          end_date:       toIsoDate(taskEnd),
          duration:       Math.max(1, tmpl.duration),
          depends_on_wbs: depWbs,
          _scopeGroupIndex: groupIndex,
          _scopeLabel:     item.label,
        };
        tasks.push(task);
        byPhase[tmpl.phase] = { wbs_code, end_date: task.end_date };
        // Keep the group cursor at the latest end so the NEXT unchained
        // phase picks up after the previous one.
        if (taskEnd > cursor) cursor = new Date(taskEnd);
      }
    }
  }

  // Runtime guard: drop any task whose phase isn't in the canonical
  // list so the preview + save path can't surface illegal phases even
  // if the templates drift. Self-test above catches most of this at
  // import; this is belt-and-suspenders against mutation + hotfix.
  const validated = tasks.filter((t) => VALID_PHASES.has(t.phase));
  const rejected = tasks.length - validated.length;

  // Summary: counts per phase + total business days covered.
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

// ── Translate WBS → schedule_tasks payload for DB insert ────────────
/**
 * Turn the buildWbs() output into rows ready for
 * `base44.entities.ScheduleTask.create()`. Resolves dependsOn wbs
 * codes to real task IDs AFTER the first batch has been inserted (the
 * caller provides a lookup). Designed to be called twice:
 *   1. First insert: no dependencies; returns the wbs→id map.
 *   2. Update: dependencies JSON on each task that needs one.
 *
 * Keeping this two-pass means we don't have to care about insert
 * ordering vs PostgREST's lack of deferred FKs.
 */
export function toScheduleTaskRows(wbs, { projectId }) {
  if (!projectId) throw new Error("toScheduleTaskRows: projectId required");
  return wbs.tasks.map((t) => ({
    project_id:      projectId,
    task_name:       t.task_name,
    phase:           t.phase,
    wbs_code:        t.wbs_code,
    start_date:      t.start_date,
    end_date:        t.end_date,
    duration:        t.duration,
    status:          "Not Started",
    percent_complete: 0,
  }));
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
  // Default: today (UTC midnight).
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function toIsoDate(d) { return d.toISOString().slice(0, 10); }
function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return Math.round((db - da) / 86400000);
}

// Small exported helper so the UI can render "X scope items recognized".
export function describeScopeItem(itemKey) {
  const item = SCOPE_ITEMS[itemKey];
  return item ? item.label : itemKey;
}

// Exposed for tests / introspection.
export const __SCOPE_ITEMS__ = SCOPE_ITEMS;

// ── Phase-containment guard ─────────────────────────────────────────
//
// Every scope item's task template must use a phase that exists in
// the canonical PHASES list (utils/phases.js) and a wbsPrefix that
// matches one of the canonical PHASE_ABBREV values. If a template
// drifts — e.g. a new scope entry uses "Erection" instead of
// "Installation" — this test throws at import so the app fails loudly
// during build rather than silently generating tasks the Gantt can't
// render correctly. Also runs on every buildWbs() call as a
// belt-and-suspenders against runtime input mutation.
function assertAllTemplatesValid() {
  const violations = [];
  for (const [key, item] of Object.entries(SCOPE_ITEMS)) {
    if (!item?.tasks?.length) continue;
    for (const tmpl of item.tasks) {
      if (!VALID_PHASES.has(tmpl.phase)) {
        violations.push(`SCOPE_ITEMS.${key}: task "${tmpl.label}" uses phase "${tmpl.phase}" which is not in PHASES`);
      }
      if (!VALID_ABBREVS.has(tmpl.wbsPrefix)) {
        violations.push(`SCOPE_ITEMS.${key}: task "${tmpl.label}" uses wbsPrefix "${tmpl.wbsPrefix}" which is not in PHASE_ABBREV`);
      }
      // Sanity: the prefix should actually map to the declared phase.
      // A "PRO" task in phase "Fabrication" would be internally
      // inconsistent even though both are individually valid.
      if (PHASE_ABBREV[tmpl.phase] && PHASE_ABBREV[tmpl.phase] !== tmpl.wbsPrefix) {
        violations.push(
          `SCOPE_ITEMS.${key}: task "${tmpl.label}" uses wbsPrefix "${tmpl.wbsPrefix}" but phase "${tmpl.phase}" expects "${PHASE_ABBREV[tmpl.phase]}"`,
        );
      }
      // If dependsOn is set, it has to name another phase this same
      // item actually generates — otherwise the dependency silently
      // drops at buildWbs time. Guard against that.
      if (tmpl.dependsOn) {
        const exists = item.tasks.some((t) => t.phase === tmpl.dependsOn);
        if (!exists) {
          violations.push(
            `SCOPE_ITEMS.${key}: task "${tmpl.label}" dependsOn phase "${tmpl.dependsOn}" that isn't in this item's tasks`,
          );
        }
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `wbsBuilder: invalid scope-item template(s):\n  - ${violations.join("\n  - ")}`,
    );
  }
}
assertAllTemplatesValid();

/**
 * Validate a generated WBS against the canonical phase list. Called
 * automatically by buildWbs() but also exported so callers who
 * hand-craft tasks (e.g. future "edit in preview before saving"
 * flows) can re-check before committing.
 *
 * Returns: { ok, violations: [string, ...] }
 * Never throws — the caller decides whether to surface warnings or
 * block the save.
 */
export function validateWbsPhases(tasks) {
  const violations = [];
  for (const t of (tasks || [])) {
    if (!VALID_PHASES.has(t.phase)) {
      violations.push(`Task "${t.task_name}" has phase "${t.phase}" which is not a canonical phase`);
    }
  }
  return { ok: violations.length === 0, violations };
}
