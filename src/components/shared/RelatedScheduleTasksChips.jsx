/**
 * RelatedScheduleTasksChips.jsx — read-only chip strip listing schedule
 * tasks that link to a given RFI / Change Order / Action Item.
 *
 * Inbound surface for the cross-link epic: the outbound side is the
 * LINKS tab on TaskDetailDrawer, which writes UUIDs into one of three
 * JSONB id-array columns on schedule_tasks (migration 055). This
 * component queries from the OTHER direction — "which tasks point at
 * this RFI?" — and renders chips with task name + phase + effective
 * dates so the user sees impact in date terms, not stored terms.
 *
 * Read-only on purpose. Editing the link from the RFI/CO/AI side is
 * deferred to keep this slice scoped — a user who wants to wire a
 * task to an RFI opens the schedule task and uses the LINKS tab.
 *
 * Props
 *   projectId        — required, scopes the schedule_tasks fetch
 *   relatedField     — one of 'related_rfi_ids' | 'related_change_order_ids'
 *                      | 'related_action_item_ids'
 *   targetId         — the id we're searching for inside the array column
 *   label            — section heading (default: "Related Tasks")
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { entities } from "@/api/supabaseClient";
import { computeEffectiveDates } from '@/services/scheduleCascade';

const VALID_FIELDS = new Set([
  'related_rfi_ids',
  'related_change_order_ids',
  'related_action_item_ids',
]);

// Match the asIdArray idiom used in the entity wrapper / DailyLogForm —
// JSONB columns can come back as arrays OR stringified JSON depending on
// the supabase-js path. We tolerate both.
function asIdArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

// Format a YYYY-MM-DD date as "MMM D" — small chip footprint, no year.
function fmtMD(iso) {
  if (!iso) return null;
  try {
    const d = typeof iso === 'string'
      ? new Date(iso + 'T00:00:00Z')
      : iso;
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch { return null; }
}

const sectionLabelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: 'var(--text-muted)',
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: 6,
};

export default function RelatedScheduleTasksChips({
  projectId,
  relatedField,
  targetId,
  label = 'Related Schedule Tasks',
}) {
  if (!VALID_FIELDS.has(relatedField)) {
    // Programming error — surface in dev so we don't silently render nothing.
     
    console.warn(`[RelatedScheduleTasksChips] unknown relatedField: ${relatedField}`);
  }

  // Fetch every schedule_task in the project, then filter client-side.
  // Server-side jsonb-contains queries via PostgREST would require RPC
  // support that isn't wired up — and the per-project task volume is
  // small (low hundreds at most), so client filtering is correct.
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['schedule-tasks-for-link', projectId],
    queryFn: () =>
      projectId
        ? entities.ScheduleTask.filter({ project_id: projectId })
        : Promise.resolve([]),
    enabled: !!projectId && !!targetId,
    staleTime: 60 * 1000,
  });

  // Compute effective dates ONCE across the whole task set so cycle
  // detection and predecessor cascading work (a slipping predecessor
  // shifts every successor's effective dates). Cheap — same memo idiom
  // ScheduleGantt uses.
  const effective = useMemo(() => computeEffectiveDates(tasks), [tasks]);

  const linkedTasks = useMemo(() => {
    if (!targetId) return [];
    return tasks.filter((t) =>
      asIdArray(t[relatedField]).includes(targetId)
    );
  }, [tasks, relatedField, targetId]);

  if (!projectId || !targetId) return null;
  if (isLoading) {
    return (
      <div>
        <span style={sectionLabelStyle}>{label}</span>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Loading...
        </div>
      </div>
    );
  }
  if (linkedTasks.length === 0) {
    return (
      <div>
        <span style={sectionLabelStyle}>{label}</span>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No schedule tasks linked yet.
        </div>
      </div>
    );
  }

  return (
    <div>
      <span style={sectionLabelStyle}>{label} ({linkedTasks.length})</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {linkedTasks.map((t) => {
          const eff = effective[t.id];
          // Prefer effective dates — they reflect predecessor cascades
          // — but fall back to stored when effective is missing or a
          // cycle was detected. Same precedence ScheduleTaskList uses.
          const start = eff?.start && !eff.cycle ? eff.start : t.start_date;
          const end   = eff?.end   && !eff.cycle ? eff.end   : t.end_date;
          const range = [fmtMD(start), fmtMD(end)].filter(Boolean).join(' – ');
          const cycleFlag = eff?.cycle;
          const shifted = eff?.shifted && !eff.cycle;
          return (
            <span
              key={t.id}
              title={[
                t.task_name,
                t.phase ? `Phase: ${t.phase}` : null,
                t.wbs_code ? `WBS: ${t.wbs_code}` : null,
                range ? `Dates: ${range}` : null,
                cycleFlag ? 'Cycle detected — falling back to stored dates' : null,
                shifted ? 'Effective dates shifted by predecessor cascade' : null,
              ].filter(Boolean).join('\n')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                maxWidth: 320,
              }}
            >
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 180,
              }}>
                {t.task_name || `Task ${t.id?.slice(0, 6)}`}
              </span>
              {t.phase ? (
                <span style={{
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: 9,
                  letterSpacing: '0.06em',
                }}>
                  · {t.phase}
                </span>
              ) : null}
              {range ? (
                <span style={{
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: 9,
                }}>
                  · {range}
                </span>
              ) : null}
              {shifted ? (
                <span title="Shifted by predecessor cascade" style={{ color: 'var(--status-warning)', fontSize: 10 }}>↗</span>
              ) : null}
              {cycleFlag ? (
                <span title="Cycle detected" style={{ color: 'var(--status-error)', fontSize: 10 }}>⚠</span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
