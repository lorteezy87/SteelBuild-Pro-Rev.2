const DEFAULT_OWNER = "";

const KEYWORD_RULES = [
  {
    type: "Delivery",
    priority: "Critical",
    duration: 30,
    impactArea: "Shipping",
    pattern: /\b(ship|shipping|deliver|delivery|truck|load list|loadlist|site access)\b/i,
  },
  {
    type: "VIF",
    priority: "Critical",
    duration: 30,
    impactArea: "Fabrication",
    pattern: /\b(vif|verify in field|field dimension|field dims?|field measurement)\b/i,
  },
  {
    type: "Shop Drawing",
    priority: "High",
    duration: 30,
    impactArea: "Fabrication",
    pattern: /\b(shop drawing|drawing revision|current revision|e sheet|erection sheet|superseded)\b/i,
  },
  {
    type: "RFI",
    priority: "High",
    duration: 30,
    impactArea: "GC Approval",
    pattern: /\b(rfi|clarification|answer pending|gc response|architect|engineer|eor|aor)\b/i,
  },
  {
    type: "Change Order",
    priority: "High",
    duration: 45,
    impactArea: "Cost",
    pattern: /\b(change order|co\b|cost exposure|notice|extra|backcharge|claim)\b/i,
  },
  {
    type: "Field",
    priority: "High",
    duration: 30,
    impactArea: "Erection",
    pattern: /\b(erect|install|field|crane|foreman|site|sequence|manpower)\b/i,
  },
  {
    type: "Production",
    priority: "Normal",
    duration: 30,
    impactArea: "Fabrication",
    pattern: /\b(fab|fabricat|shop|galv|galvaniz|paint|release|material)\b/i,
  },
];

const OWNER_PATTERN = /\b(?:owner|assigned to|assign to|by|responsible)\s*[:\-]?\s*([A-Z]{2,4})\b/i;
const DATE_PATTERN = /\b(?:due|by|before|needed|need|ship(?:ping)?|deliver(?:y)?|install(?:ing)?)\s*(?:on|by|before)?\s*(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i;

function normalizeLine(line) {
  return line
    .replace(/^[\s>*-]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}

function inferRule(line) {
  return KEYWORD_RULES.find((rule) => rule.pattern.test(line)) || {
    type: "Task",
    priority: "Normal",
    duration: 30,
    impactArea: "Project",
  };
}

function inferOwner(line) {
  const match = line.match(OWNER_PATTERN);
  return match?.[1]?.toUpperCase() || DEFAULT_OWNER;
}

function inferDueDate(line, now = new Date()) {
  const explicit = line.match(DATE_PATTERN)?.[1];
  if (explicit) {
    const [m, d, y] = explicit.split(/[/-]/).map(Number);
    const year = y ? (y < 100 ? 2000 + y : y) : now.getFullYear();
    const parsed = new Date(year, m - 1, d);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  const lower = line.toLowerCase();
  const date = new Date(now);
  if (/\btomorrow\b/.test(lower)) {
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  if (/\b(today|asap|urgent|critical)\b/.test(lower)) {
    return date.toISOString().slice(0, 10);
  }
  if (/\bnext week\b/.test(lower)) {
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  }
  if (/\b48[- ]?hour|next 48\b/.test(lower)) {
    date.setDate(date.getDate() + 2);
    return date.toISOString().slice(0, 10);
  }
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

function isActionable(line) {
  return /\b(need|needs|confirm|verify|check|follow up|send|submit|release|hold|blocked|pending|due|ship|deliver|install|assign|call|email|coordinate|review|update|provide|resolve)\b/i.test(line);
}

function titleFromLine(line, rule) {
  const clean = line.replace(/\s+/g, " ").trim();
  if (clean.length <= 96) return clean;
  return `${clean.slice(0, 93).trim()}...`;
}

export function parseProductionMeetingNotes(notes, options = {}) {
  const now = options.now || new Date();
  const source = options.source || "Production meeting parser";
  const lines = String(notes || "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  return lines
    .filter(isActionable)
    .map((line, index) => {
      const rule = inferRule(line);
      return {
        id: `parsed-${index}`,
        title: titleFromLine(line, rule),
        description: [
          line,
          "",
          `Generated from ${source}. Review owner, due date, and linked records before relying on this as project direction.`,
          `Task Type: ${rule.type}`,
          `Impact Area: ${rule.impactArea}`,
          `Estimated Duration: ${rule.duration} min`,
        ].join("\n"),
        assigned_to: inferOwner(line),
        due_date: inferDueDate(line, now),
        priority: rule.priority,
        status: "Open",
        meeting_reference: source,
        metadata: {
          created_from: "production_meeting_parser",
          task_type: rule.type,
          impact_area: rule.impactArea,
          estimated_duration_minutes: rule.duration,
          source_line: line,
        },
      };
    });
}
