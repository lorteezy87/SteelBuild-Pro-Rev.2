import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function DecisionTrail({ projectId }) {
  const [decisions, setDecisions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDecisions = async () => {
      try {
        const data = await base44.entities.PMADecision.filter({
          project_id: projectId,
          status: 'Active',
        });
        setDecisions(data.slice(0, 20));
      } catch (err) {
        console.error('Failed to load decisions:', err);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) loadDecisions();
  }, [projectId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(160,175,210,0.4)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8 }}>Loading decisions...</div>
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(160,175,210,0.4)' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10 }}>No decisions logged yet</div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(160,175,210,0.40)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          DECISION TRAIL <span style={{ background: 'var(--accent)', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 7, marginLeft: 4 }}>{decisions.length}</span>
        </div>
      </div>

      {decisions.map((dec) => (
        <DecisionCard
          key={dec.id}
          decision={dec}
          expanded={expandedId === dec.id}
          onToggle={() => setExpandedId(expandedId === dec.id ? null : dec.id)}
        />
      ))}
    </div>
  );
}

function DecisionCard({ decision, expanded, onToggle }) {
  let parsedAssumptions = [];
  if (decision.assumptions) {
    try {
      parsedAssumptions = typeof decision.assumptions === 'string' ? JSON.parse(decision.assumptions) : decision.assumptions;
    } catch (e) {}
  }

  const phaseColors = {
    'Estimating': 'var(--accent)',
    'Preconstruction': '#00B8D9',
    'Procurement': '#00D68F',
    'Fabrication': 'var(--accent)',
    'Field Execution': '#FFB400',
    'Closeout': 'var(--accent)',
  };

  const statusColors = {
    'Active': '#00D68F',
    'Superseded': '#FFB400',
    'Reversed': '#FF3D3D',
    'Under Review': '#00B8D9',
  };

  return (
    <div
      onClick={onToggle}
      style={{
        background: 'var(--accent-muted)',
        border: '1px solid var(--accent-muted)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 8,
        padding: expanded ? 12 : 10,
        marginBottom: 6,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: expanded ? 8 : 4 }}>
            <div style={{
              background: phaseColors[decision.phase] || 'var(--accent)',
              color: 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 7,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
            }}>
              {decision.phase}
            </div>
            <div style={{
              background: statusColors[decision.status] || 'var(--accent)',
              color: decision.status === 'Active' ? 'var(--bg-page)' : 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 7,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
            }}>
              {decision.status}
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: expanded ? 'normal' : 'nowrap',
            lineHeight: 1.4,
          }}>
            {decision.decision_text}
          </div>
          {!expanded && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(160,175,210,0.40)', marginTop: 3 }}>
              Decided by {decision.decided_by || 'Unknown'} · {decision.decided_at}
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(160,175,210,0.4)' }}>
          {expanded ? '▼' : '▶'}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--accent-muted)' }}>
          {decision.rationale && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--accent)', fontWeight: 700, marginBottom: 3 }}>
                RATIONALE
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'rgba(220,228,245,0.70)', lineHeight: 1.4 }}>
                {decision.rationale}
              </div>
            </div>
          )}

          {parsedAssumptions.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#FFB400', fontWeight: 700, marginBottom: 3 }}>
                ASSUMPTIONS AT TIME ({parsedAssumptions.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {parsedAssumptions.map((a, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,180,0,0.12)',
                    border: '1px solid rgba(255,180,0,0.25)',
                    color: '#FFB400',
                    fontFamily: 'var(--font-body)',
                    fontSize: 8,
                    padding: '3px 6px',
                    borderRadius: 4,
                  }}>
                    {typeof a === 'string' ? a : a.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)' }}>
            Decided by {decision.decided_by || 'Unknown'} · {decision.decided_at}
          </div>
        </div>
      )}
    </div>
  );
}
