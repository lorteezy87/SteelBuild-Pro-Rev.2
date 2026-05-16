# SteelBuild Pro — AI Scheduling Assistant v2

Production-oriented implementation with structured reasoning, RLS-by-default, and a safe-answer contract.

## What changed from v1

| Area | v1 | v2 |
|---|---|---|
| **Reasoning** | Claude reasoned over raw rows | Reasoning layer normalizes facts first (float bands, gap analysis, chain walks) |
| **Auth** | Service role default | JWT + RLS default, service role is opt-in server-only |
| **Risk analysis** | `impacts_activity_id` only | Predecessor tracing + float bands + promised-vs-needed gaps + status freshness |
| **Answers** | Free-form | Provenance + confidence + safe-answer contract |

## Architecture

The schedule assistant owns JWT verification, the RLS-scoped Supabase
client, schedule tool execution, provenance, and the safe-answer
contract. Each model turn is routed through `llm-proxy` with
`useCase: "schedule-assist"` so provider selection, token telemetry,
latency telemetry, and cost reporting stay centralized in
`llm_telemetry`.

```
┌────────────────────────┐
│ SteelBuild Pro (PMA)   │ user asks with Bearer JWT
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Edge Fn: verifies JWT  │
│ builds RLS-scoped      │
│ Supabase client        │
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Agent loop             │
│  ↓                     │
│ Claude tool call       │
│  ↓                     │
│ Tool handler           │
│  ↓                     │
│ Reasoning layer        │ ← normalizes rows → facts
│  ↓                     │
│ Provenance wrapper     │ ← adds confidence/evidence
│  ↓                     │
│ Returned to Claude     │ ← model reasons over facts, not rows
│  ↓                     │
│ Answer with contract   │ ← cites evidence, declares confidence
└────────────────────────┘
```

## Files

| File | Purpose |
|---|---|
| `schedule-reasoning.ts` | Domain reasoning — float classification, variance math, blocker normalization, predecessor chain walks, risk scoring, confidence inference |
| `provenance.ts` | Wraps every tool result with `{ confidence, evidence, staleness_warnings, data_gaps, source_tables, row_counts, as_of }` |
| `tool-schemas.ts` | 10 Claude tool definitions (unchanged from v1) |
| `tool-handlers.ts` | Upgraded handlers — call reasoning layer, add provenance, flag gaps |
| `index.ts` | Edge Function with JWT verification, RLS-scoped client, llm-proxy model routing, safe-answer contract in system prompt |

## Reasoning layer — what it computes

Instead of handing Claude raw activity rows, `buildScheduleFacts()` returns:

| Field | Computed by |
|---|---|
| `float_band` | CRITICAL (≤0d) / NEAR_CRITICAL (1-5d) / COMFORTABLE / UNKNOWN |
| `variance_days` | forecast_finish − baseline_finish |
| `is_behind` | variance > 0 AND not complete |
| `freshness` | FRESH (≤3d) / AGING (≤10d) / STALE / MISSING |
| `gap_days` (blockers) | promised_eta − needed_by_date |
| `upstream_blockers` | predecessor chain walk up to 3 levels |
| `driving_cause` | plain-language summary ("Zero float; PO-2245 late 5d; 2 stale RFIs") |
| `confidence` (activity) | based on evidence count + freshness + float availability |
| `confidence` (overall) | based on staleness warnings + data gaps |

## Safe Answer Contract (enforced by system prompt)

Every answer must:

1. **Disclose confidence** — end with `**Confidence:** LEVEL — based on N evidence items, as of DATE`
2. **Surface staleness** — if any tool returned staleness warnings, state them explicitly
3. **Handle empty data honestly** — "No matching records found" not guessed numbers
4. **Flag contradictions** — don't pick winners when two tools disagree
5. **Never extrapolate** — ranges or "cannot be computed reliably" instead of precise-sounding fabrications
6. **Never mutate** — all schedule changes are recommendations requiring PM approval

Example answer shape is baked into the system prompt and will be enforced.

## Deployment

### 1. Supabase schema additions

Required FK additions on RFIs, submittals, deliveries:

```sql
alter table rfis add column if not exists impacts_activity_ids uuid[];
alter table submittals add column if not exists impacts_activity_ids uuid[];
alter table deliveries add column if not exists impacts_activity_ids uuid[];
alter table deliveries add column if not exists needed_by_date date;

alter table projects add column if not exists schedule_last_updated timestamptz;
alter table schedule_activities add column if not exists last_updated timestamptz;
alter table schedule_activities add column if not exists predecessors text[] default '{}';
alter table schedule_activities add column if not exists successors text[] default '{}';
```

### 2. Audit log table

```sql
create table if not exists ai_audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  user_id uuid references auth.users(id),
  user_messages jsonb not null,
  final_answer text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index on ai_audit_log(project_id, created_at desc);
alter table ai_audit_log enable row level security;

create policy "Users read their own project logs"
  on ai_audit_log for select
  using (auth.uid() = user_id);

create policy "Service role writes logs"
  on ai_audit_log for insert
  with check (auth.role() = 'authenticated');
```

### 3. RLS policies required on tables

Confirm RLS is ON and policies exist for every entity the AI reads:

```sql
alter table schedule_activities enable row level security;
alter table rfis enable row level security;
alter table submittals enable row level security;
alter table deliveries enable row level security;
alter table drawings enable row level security;
alter table production_status enable row level security;
alter table projects enable row level security;
```

Each needs a policy like:
```sql
create policy "Users read their org's data"
  on schedule_activities for select
  using (
    project_id in (
      select project_id from project_members where user_id = auth.uid()
    )
  );
```

### 4. Edge Function secrets

```bash
# schedule-assistant needs SUPABASE_URL and SUPABASE_ANON_KEY.
# llm-proxy owns provider keys and telemetry inserts.
# SUPABASE_URL, SUPABASE_ANON_KEY auto-injected
# Do NOT set SUPABASE_SERVICE_ROLE_KEY unless you truly need it
```

`ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` belong on
`llm-proxy`, not this function, because model calls and
`llm_telemetry` writes are centralized there.

### 5. Deploy

```bash
supabase functions deploy schedule-assistant
# Keep JWT verification ON — no --no-verify-jwt flag
```

### 6. Client call pattern

```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session) throw new Error("Not authenticated");

const res = await fetch(
  `${SUPABASE_URL}/functions/v1/schedule-assistant`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      project_id: "25531-uuid",
      messages: [{ role: "user", content: "Top delay risks next 3 weeks?" }],
    }),
  }
);
const { answer, tool_calls, usage, iterations } = await res.json();
```

## Service role escape hatch (cron/internal only)

For scheduled jobs that need full access (weekly narrative generator, nightly risk scan):

```bash
# On the specific function that needs it:
supabase secrets set SERVICE_ROLE_OVERRIDE=true
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

The Edge Function logs a `[WARN] SERVICE_ROLE_OVERRIDE active` line whenever this path runs. Audit the logs.

## Tunable thresholds

All in `schedule-reasoning.ts` under `THRESHOLDS`:

- `FLOAT_CRITICAL_MAX: 0` — what counts as critical
- `FLOAT_NEAR_CRITICAL_MAX: 5` — near-critical band
- `RFI_STALE_DAYS: 14` — when an RFI counts as stale
- `DATA_STALENESS_WARN_DAYS: 7` — when to warn about schedule freshness
- `MIN_EVIDENCE_FOR_HIGH_CONFIDENCE: 3` — minimum evidence count for HIGH

Adjust to your S&H conventions.

## Test plan

Before going live:

1. **Happy path** — Skyport (25531) with fresh data: expect HIGH confidence, specific RFI/PO citations
2. **Stale path** — set `schedule_last_updated` to 30d ago: expect staleness warning in answer + LOW/MEDIUM confidence
3. **Gap path** — create RFIs with no `impacts_activity_ids`: expect "orphaned RFIs" warning in answer
4. **Empty path** — project with no open blockers: expect "no matching records" not a guess
5. **RLS path** — log in as a user without access to Skyport, ask about it: expect empty results, not a data leak

## Next iterations

1. **Streaming** — add a streaming-compatible gateway path for token-by-token UI
2. **Write-proposal tool** — `propose_schedule_update` that writes to a `schedule_proposals` table (never to live schedule)
3. **pgvector layer** — spec/drawing search for grounded document Q&A
4. **Weekly narrative cron** — scheduled function using `SERVICE_ROLE_OVERRIDE` for Monday status summaries
5. **Threshold calibration UI** — let PMs adjust float bands and staleness windows per project
