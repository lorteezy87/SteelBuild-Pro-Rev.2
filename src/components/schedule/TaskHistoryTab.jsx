import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { entities } from '@/api/supabaseClient';
import { buildChangeLog, summarizeEntry } from '@/services/scheduleChangeLog';
import { drawerMutedText, drawerMutedBorder, drawerPanel, drawerText } from './taskDetailPrimitives';

/**
 * Per-task change history (audit §1.3 / §7.6).
 *
 * The HISTORY tab rendered the literal string "No history yet" while
 * `planner_action_events` held a complete before/after trail for every task —
 * written by a database trigger, so it covers the Gantt drag, the bulk
 * toolbars, CSV/MPP import, the MCP server and direct SQL alike. This reads it.
 *
 * The trail is append-only by construction: the table has a SELECT policy and
 * no INSERT policy, so the only writer is the SECURITY DEFINER trigger. Nothing
 * here can add to it, and nothing in the client could have forged it.
 */

const KIND_COLORS = {
  date: 'var(--status-warning)',
  actual: 'var(--status-info)',
  logic: 'var(--accent)',
  status: 'var(--status-success)',
  progress: 'var(--text-muted)',
  other: 'var(--text-muted)',
};

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Local time, not UTC: a change made at 6pm Arizona reads as the next day in
  // UTC, which makes the log disagree with the user's memory of when they did it.
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function TaskHistoryTab({ taskId, projectId }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['schedule-task-history', projectId, taskId],
    queryFn: () =>
      entities.PlannerActionEvent.filter(
        { project_id: projectId, entity_id: taskId, entity_type: 'schedule_task' },
        '-occurred_at',
        200,
      ),
    enabled: !!taskId && !!projectId,
  });

  const entries = useMemo(
    // hideEmpty: a save that touched only untracked columns produces an event
    // with an empty diff, and a list of "no tracked fields changed" rows buries
    // the entries that matter.
    () => buildChangeLog(data || [], { hideEmpty: true }),
    [data],
  );

  const base = {
    fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText,
    textAlign: 'center', padding: '40px 0',
  };

  if (!taskId || !projectId) return <div style={base}>Save this task to start recording its history.</div>;
  if (isLoading) return <div style={base}>Loading history…</div>;
  if (isError) {
    // Distinguished from "no history": an empty list because the read failed
    // would otherwise read as "nothing ever happened to this task".
    return (
      <div style={{ ...base, color: 'var(--status-error)' }}>
        Couldn't load history — {error?.message || 'unknown error'}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div style={base}>
        No recorded changes.
        <div style={{ fontSize: 10, marginTop: 6, opacity: 0.8 }}>
          Changes have been recorded since 5 Aug 2026. Anything before that predates the log.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            padding: '10px 12px',
            background: drawerPanel,
            border: `1px solid ${drawerMutedBorder}`,
            borderRadius: 8,
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            gap: 10, marginBottom: entry.changes.length ? 8 : 0,
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: entry.eventType === 'deleted' ? 'var(--status-error)' : drawerText,
            }}>
              {entry.eventType === 'created' ? 'Created'
                : entry.eventType === 'deleted' ? 'Deleted'
                : summarizeEntry(entry)}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, color: drawerMutedText, whiteSpace: 'nowrap',
            }}>
              {formatWhen(entry.occurredAt)}
            </span>
          </div>

          {entry.changes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {entry.changes.map((change) => (
                <div
                  key={change.field}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '96px minmax(0, 1fr)',
                    gap: 8, alignItems: 'baseline',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    color: KIND_COLORS[change.kind] || drawerMutedText,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {change.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: drawerText,
                    wordBreak: 'break-word',
                  }}>
                    {/* An em dash for absence on BOTH sides, so "was blank" and
                        "is now blank" read the same way round. */}
                    {change.from ?? '—'} <span style={{ color: drawerMutedText }}>→</span> {change.to ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
