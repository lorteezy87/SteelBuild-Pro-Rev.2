// ============================================================================
// SteelBuild Pro — AI Scheduling Assistant Tool Schemas (Path B)
// ============================================================================
// Path B trims the v1 toolset to what SBP actually has today:
//   * Dropped get_submittal_status   — no submittals table yet
//   * Dropped get_production_status  — no production_status table yet
//   * Kept the rest, adapted vocabs to our schema (stage, status, phase)
//
// When Path C ships the full schema, re-enable the dropped tools and
// tighten the enums — the system prompt already knows to call them.
// ============================================================================

import type Anthropic from "npm:@anthropic-ai/sdk@0.40.0";

// Mirrors schedule_tasks.phase + older schedule_activities.wbs_phase.
// Includes both Fabrication + Delivery so the assistant can filter by the
// production pipeline stages users actually type.
const PHASES = [
  "Detailing",
  "Procurement",
  "Fabrication",
  "Delivery",
  "Equipment",
  "Installation",
  "Erection",
  "Closeout",
] as const;

// SBP rfi vocab, normalized.
const RFI_STATUSES_PENDING = ["Open", "Under Review"] as const;

// SBP deliveries uses free-form status. We don't enforce an enum.
// Common values seen: Scheduled, In Transit, Received, Delayed, Cancelled.

export const schedulingTools: Anthropic.Tool[] = [
  // --------------------------------------------------------------------------
  // SCHEDULE & ACTIVITIES
  // --------------------------------------------------------------------------
  {
    name: "get_schedule_activities",
    description:
      "Retrieve schedule tasks (fabrication, delivery, erection, etc.) for a project. " +
      "Use when the user asks about the schedule, dates, durations, sequencing, or specific activities. " +
      "Returns start/end dates, phase, status, and dependency info. " +
      "Note: SBP does not track baseline vs forecast separately today, so variance and float " +
      "are reported as UNKNOWN — answers should reflect this by qualifying confidence.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "Project UUID. Required.",
        },
        phase: {
          type: "string",
          enum: PHASES as unknown as string[],
          description: "Filter by WBS phase. Omit for all phases.",
        },
        status: {
          type: "string",
          description:
            "Filter by task status (SBP uses free-form, common values: " +
            "'Not Started', 'In Progress', 'Complete', 'On Hold', 'Delayed'). Omit for all.",
        },
        date_range: {
          type: "object",
          properties: {
            start: { type: "string", description: "ISO 8601 start date" },
            end: { type: "string", description: "ISO 8601 end date" },
          },
          description:
            "Filter tasks occurring within this window (by start_date / end_date).",
        },
        limit: {
          type: "number",
          description: "Max rows to return. Default 50, max 500.",
        },
      },
      required: ["project_id"],
    },
  },

  // --------------------------------------------------------------------------
  // OPEN RISKS — RFIs
  // --------------------------------------------------------------------------
  {
    name: "get_open_rfis",
    description:
      "Retrieve open RFIs for a project, optionally filtered by age. " +
      "Use when assessing schedule risk — unanswered RFIs block fab and erection.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID. Required." },
        min_age_days: {
          type: "number",
          description:
            "Only return RFIs open longer than this many days. Use to find stale blockers.",
        },
      },
      required: ["project_id"],
    },
  },

  // --------------------------------------------------------------------------
  // PROCUREMENT & DELIVERY
  // --------------------------------------------------------------------------
  {
    name: "get_delivery_status",
    description:
      "Retrieve material delivery status — mill orders, ETAs, received quantities. Use when " +
      "assessing material-driven schedule risk or fab release readiness.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID. Required." },
        status: {
          type: "string",
          description:
            "Filter by delivery status (free-form, common values: Scheduled, " +
            "In Transit, Received, Delayed, Cancelled). Omit for all.",
        },
        material_type: {
          type: "string",
          description:
            "Filter by material/load category (e.g., 'Wide Flange', 'HSS', 'Plate', 'Joists').",
        },
      },
      required: ["project_id"],
    },
  },

  // --------------------------------------------------------------------------
  // DRAWINGS LOG
  // --------------------------------------------------------------------------
  {
    name: "get_drawings_log",
    description:
      "Retrieve shop drawing log showing sheet numbers, revisions, stages, and linked RFIs. " +
      "Use to trace a sheet through detailing → approval → fabrication → install.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID. Required." },
        sheet_number: {
          type: "string",
          description: "Specific sheet number (e.g., 'E1.1', 'S-101').",
        },
        stage: {
          type: "string",
          enum: ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"],
          description:
            "Filter by stage (SBP drawing workflow: Not Started → OFA → BFA → OFS → BFS → FFF → Released).",
        },
      },
      required: ["project_id"],
    },
  },

  // --------------------------------------------------------------------------
  // SCHEDULE INTELLIGENCE
  // --------------------------------------------------------------------------
  {
    name: "get_critical_path",
    description:
      "Retrieve critical or high-priority activities for a project. SBP doesn't compute " +
      "float today, so this returns tasks marked priority='Critical' or explicitly flagged " +
      "as critical-path milestones. Confidence should be qualified accordingly.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID. Required." },
      },
      required: ["project_id"],
    },
  },

  {
    name: "analyze_delay_risk",
    description:
      "Cross-reference open RFIs and delayed deliveries against upcoming scheduled tasks " +
      "to score delay risk. Returns tasks at risk with driving causes. " +
      "Because SBP lacks baseline/float today, near-term pressure is inferred from " +
      "start_date proximity + open blockers rather than float bands.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID. Required." },
        lookahead_days: {
          type: "number",
          description: "How many days forward to assess. Default 21 (3-week lookahead).",
        },
      },
      required: ["project_id"],
    },
  },

  // --------------------------------------------------------------------------
  // PROJECT METADATA
  // --------------------------------------------------------------------------
  {
    name: "list_projects",
    description:
      "List all projects the user has access to. Use when the user references a project " +
      "by name/number and you need to resolve the project_id.",
    input_schema: {
      type: "object" as const,
      properties: {
        phase: {
          type: "string",
          description: "Filter by project phase (free-form text).",
        },
      },
    },
  },

  {
    name: "get_project_summary",
    description:
      "Retrieve high-level project facts — job number, GC, address, contract value, key dates. " +
      "Use as the first call when the user asks a broad question about a project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID. Required." },
      },
      required: ["project_id"],
    },
  },
];
