import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { usePMA } from '../usePMAContext';
import { useProjectContext } from '../../shared/useProjectContext';
import { flagLegalHold, exportAuditLogCSV, reproduceOutput } from '../auditUtils';
import { toast } from 'sonner';

const ACTION_TYPE_COLORS = {
  INSIGHT_GENERATED: '#8B5CF6',
  EMAIL_GENERATED: 'var(--status-info)',
  CHAT_RESPONSE: 'var(--status-success)',
  DATA_RETRIEVED: 'var(--text-muted)',
  DECISION_RECORDED: 'var(--accent)',
  POLICY_CHECK: 'var(--status-warning)',
  ACCESS_DENIED: 'var(--status-error)',
  LEGAL_HOLD_FLAGGED: 'var(--status-warning)',
  EXPORT_REQUESTED: 'var(--status-info)',
  MEMORY_UPDATED: '#8B5CF6',
};

export default function PMAudit() {
  const { activeProject } = useProjectContext();
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [legalHoldOnly, setLegalHoldOnly] = useState(false);
  const [reproducing, setReproducing] = useState(null);
  const [reproResult, setReproResult] = useState(null);

  // Load audit logs
  useEffect(() => {
    if (!activeProject?.id) return;
    loadAuditLogs();
  }, [activeProject]);

  const loadAuditLogs = async () => {
    try {
      setIsLoading(true);
      const logs = await base44.entities.PMAuditLog.filter({
        project_id: activeProject.id,
      });
      setEntries(logs || []);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      toast.error('Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (actionFilter !== 'all' && e.action_type !== actionFilter) return false;
    if (legalHoldOnly && !e.legal_hold_flag) return false;

    if (dateFilter !== 'all') {
      const entryDate = new Date(e.timestamp);
      const now = new Date();
      const daysDiff = (now - entryDate) / (1000 * 60 * 60 * 24);

      if (dateFilter === 'today' && daysDiff > 1) return false;
      if (dateFilter === 'week' && daysDiff > 7) return false;
      if (dateFilter === 'month' && daysDiff > 30) return false;
    }

    return true;
  });

  const handleLegalHold = async (entryId, reason) => {
    try {
      const user = await base44.auth.me();
      const success = await flagLegalHold(entryId, reason, user?.email);
      if (success) {
        loadAuditLogs();
        toast.success('Entry flagged for legal hold');
      }
    } catch (error) {
      console.error('Legal hold failed:', error);
      toast.error('Failed to flag legal hold');
    }
  };

  const handleReproduce = async (entry) => {
    setReproducing(entry.id);
    try {
      const result = await reproduceOutput(entry);
      setReproResult(result);
    } catch (error) {
      console.error('Reproduce failed:', error);
      toast.error('Failed to regenerate output');
    } finally {
      setReproducing(null);
    }
  };

  const handleExport = () => {
    try {
      exportAuditLogCSV(filteredEntries, activeProject.name);
      toast.success('Audit log exported');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export audit log');
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(160,175,210,0.4)' }}>
        <div style={{ fontSize: 12 }}>Loading audit logs...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              color: '#FFB400',
              letterSpacing: '0.08em',
            }}
          >
            AUDIT LOG
          </span>
          <span
            style={{
              background: 'rgba(255,180,0,0.12)',
              border: '1px solid rgba(255,180,0,0.25)',
              color: '#FFB400',
              borderRadius: 10,
              padding: '1px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: 7,
              fontWeight: 700,
            }}
          >
            {filteredEntries.length}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={handleExport}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: '#FFB400',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 4,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'rgba(255,180,0,0.08)')
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            ↓ EXPORT
          </button>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: 'rgba(160,175,210,0.5)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 4,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <input
              type="checkbox"
              checked={legalHoldOnly}
              onChange={(e) => setLegalHoldOnly(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            LEGAL HOLD ONLY
          </label>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '6px 10px',
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <option value="all">All Actions</option>
          <option value="INSIGHT_GENERATED">Insight Generated</option>
          <option value="EMAIL_GENERATED">Email Generated</option>
          <option value="CHAT_RESPONSE">Chat Response</option>
          <option value="DATA_RETRIEVED">Data Retrieved</option>
          <option value="DECISION_RECORDED">Decision</option>
          <option value="POLICY_CHECK">Policy Check</option>
          <option value="ACCESS_DENIED">Access Denied</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '6px 10px',
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

      {/* Entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredEntries.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '20px',
              color: 'rgba(160,175,210,0.4)',
              fontFamily: 'var(--font-body)',
              fontSize: 11,
            }}
          >
            No audit entries match your filters
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <AuditEntryCard
              key={entry.id}
              entry={entry}
              isExpanded={expandedId === entry.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === entry.id ? null : entry.id)
              }
              onLegalHold={handleLegalHold}
              onReproduce={handleReproduce}
              isReproducing={reproducing === entry.id}
            />
          ))
        )}
      </div>

      {/* Reproduced Output Modal */}
      {reproResult && !reproResult.error && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(6px)',
          }}
          onClick={() => setReproResult(null)}
        >
          <div
            style={{
              background: 'var(--bg-surface-low)',
              border: '1px solid var(--border-default)',
              borderRadius: 16,
              padding: 24,
              maxWidth: 600,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 40px 80px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: '#FFB400',
                letterSpacing: '0.08em',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}
            >
              ↺ REPRODUCED OUTPUT
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 7,
                color: 'var(--text-muted)',
                marginBottom: 12,
              }}
            >
              Original: {reproResult.originalTime} | Snapshot: {reproResult.snapshotTime}
              | Hash: {reproResult.hash}
            </div>

            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                padding: 12,
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {reproResult.content}
            </div>

            <button
              onClick={() => setReproResult(null)}
              style={{
                marginTop: 12,
                padding: '6px 12px',
                background: 'var(--accent-muted)',
                border: '1px solid var(--accent-border)',
                borderRadius: 6,
                color: 'var(--accent)',
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditEntryCard({
  entry,
  isExpanded,
  onToggleExpand,
  onLegalHold,
  onReproduce,
  isReproducing,
}) {
  const sourceArtifacts = JSON.parse(entry.source_artifacts || '[]');
  const policyChecks = JSON.parse(entry.policy_checks || '[]');
  const accentColor = ACTION_TYPE_COLORS[entry.action_type] || 'rgba(160,175,210,0.4)';

  const timeAgo = (() => {
    const diff = Date.now() - new Date(entry.timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })();

  return (
    <div
      style={{
        background: entry.legal_hold_flag
          ? 'rgba(255,180,0,0.05)'
          : 'rgba(255,255,255,0.02)',
        border: entry.legal_hold_flag
          ? '1px solid rgba(255,180,0,0.40)'
          : '1px solid rgba(255,255,255,0.05)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Collapsed View */}
      <div
        onClick={onToggleExpand}
        style={{
          padding: '10px 12px',
          cursor: 'pointer',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 6,
          }}
        >
          {/* Badge */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 7,
              background: `${accentColor}22`,
              border: `1px solid ${accentColor}40`,
              color: accentColor,
              padding: '2px 6px',
              borderRadius: 3,
              fontWeight: 700,
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {entry.action_type.replace(/_/g, ' ')}
          </span>

          {/* Summary */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 10,
                color: 'var(--text-primary)',
                fontWeight: 500,
              }}
            >
              {entry.output_summary}
            </div>
          </div>

          {/* Time */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {timeAgo}
          </div>
        </div>

        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-muted)',
            flexWrap: 'wrap',
          }}
        >
          <span>Hash: {entry.reproducibility_hash}</span>
          <span>{sourceArtifacts.length} sources</span>
          <span>{entry.user_id}</span>
          {entry.legal_hold_flag && (
            <span style={{ color: '#FFB400', fontWeight: 700 }}>⚖ LEGAL HOLD</span>
          )}
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.04)',
            padding: '12px',
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Triggered By */}
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 7,
                color: 'rgba(160,175,210,0.4)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              Triggered By
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'rgba(220,225,240,0.80)',
                lineHeight: 1.4,
              }}
            >
              {entry.triggered_by}
            </div>
          </div>

          {/* Source Artifacts Table */}
          {sourceArtifacts.length > 0 && (
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 7,
                  color: 'rgba(160,175,210,0.4)',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                }}
              >
                Source Artifacts
              </div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8,
                }}
              >
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 8px',
                        color: 'rgba(160,175,210,0.4)',
                        fontWeight: 500,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      Type
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 8px',
                        color: 'rgba(160,175,210,0.4)',
                        fontWeight: 500,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      ID
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 8px',
                        color: 'rgba(160,175,210,0.4)',
                        fontWeight: 500,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      Fields
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sourceArtifacts.map((artifact, idx) => (
                    <tr
                      key={idx}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      <td
                        style={{
                          padding: '4px 8px',
                          color: accentColor,
                          fontWeight: 600,
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        {artifact.entityType}
                      </td>
                      <td
                        style={{
                          padding: '4px 8px',
                          color: 'var(--text-secondary)',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {artifact.entityNumber || artifact.entityId}
                      </td>
                      <td
                        style={{
                          padding: '4px 8px',
                          color: 'var(--text-muted)',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          fontSize: 7,
                        }}
                      >
                        {artifact.fieldAccessed.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Policy Checks */}
          {policyChecks.length > 0 && (
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 7,
                  color: 'rgba(160,175,210,0.4)',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                }}
              >
                Policy Checks
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {policyChecks.map((check, idx) => {
                  const resultColor =
                    check.result === 'PASS'
                      ? 'var(--status-success)'
                      : check.result === 'WARN'
                        ? 'var(--status-warning)'
                        : 'var(--status-error)';
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        gap: 8,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8,
                        color: resultColor,
                      }}
                    >
                      <span style={{ fontWeight: 700, minWidth: 40 }}>
                        [{check.result}]
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {check.check} — {check.reason}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reproducibility */}
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 7,
                color: 'rgba(160,175,210,0.4)',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              Reproducibility
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: 'var(--text-muted)',
                marginBottom: 8,
              }}
            >
              Hash: {entry.reproducibility_hash}
            </div>
            {entry.data_snapshot && (
              <button
                onClick={() => onReproduce(entry)}
                disabled={isReproducing}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(139,92,246,0.10)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 6,
                  color: '#A78BFA',
                  fontFamily: 'var(--font-body)',
                  fontSize: 10,
                  cursor: isReproducing ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  opacity: isReproducing ? 0.5 : 1,
                }}
              >
                {isReproducing ? '↺ Reproducing...' : '↺ Reproduce Output'}
              </button>
            )}
          </div>

          {/* Legal Hold */}
          {entry.legal_hold_flag && (
            <div
              style={{
                background: 'rgba(255,180,0,0.08)',
                border: '1px solid rgba(255,180,0,0.20)',
                borderRadius: 6,
                padding: 8,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8,
                  color: '#FFB400',
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                ⚖ LEGAL HOLD
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 10,
                  color: 'rgba(220,225,240,0.80)',
                }}
              >
                Flagged by {entry.legal_hold_flagged_by} at{' '}
                {new Date(entry.legal_hold_flagged_at).toLocaleString()}
              </div>
              {entry.legal_hold_reason && (
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    marginTop: 6,
                  }}
                >
                  Reason: {entry.legal_hold_reason}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
            {!entry.legal_hold_flag && (
              <button
                onClick={() => {
                  const reason = prompt('Legal hold reason:');
                  if (reason) onLegalHold(entry.id, reason);
                }}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(255,180,0,0.10)',
                  border: '1px solid rgba(255,180,0,0.25)',
                  borderRadius: 6,
                  color: '#FFB400',
                  fontFamily: 'var(--font-body)',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ⚖ Flag Legal Hold
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}