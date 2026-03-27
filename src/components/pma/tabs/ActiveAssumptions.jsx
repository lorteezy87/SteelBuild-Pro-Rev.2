import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function ActiveAssumptions({ projectId }) {
  const [assumptions, setAssumptions] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const filters = ['All', 'Critical', 'High', 'Overdue'];

  useEffect(() => {
    const load = async () => {
      try {
        const data = await base44.entities.PMAAssumption.filter({
          project_id: projectId,
          status: 'Active',
        });
        setAssumptions(data);
      } catch (err) {
        console.error('Failed to load assumptions:', err);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) load();
  }, [projectId]);

  if (loading) return <div style={{ fontSize: 10, color: 'rgba(160,175,210,0.4)' }}>Loading...</div>;

  const filtered = assumptions.filter((a) => {
    if (filter === 'All') return true;
    if (filter === 'Critical') return a.impact === 'Critical';
    if (filter === 'High') return a.impact === 'High';
    if (filter === 'Overdue') {
      const today = new Date();
      return new Date(a.due_to_verify) < today;
    }
    return true;
  });

  const impactColor = (impact) => {
    const colors = {
      'Critical': 'var(--status-error)',
      'High': 'var(--status-warning)',
      'Medium': 'var(--status-warning)',
      'Low': 'var(--text-muted)',
    };
    return colors[impact] || colors.Low;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(160,175,210,0.40)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          ACTIVE ASSUMPTIONS
          <span style={{ background: 'var(--status-warning)', color: 'var(--bg-page)', borderRadius: 10, padding: '1px 6px', fontSize: 7, marginLeft: 4, fontWeight: 700 }}>
            {filtered.length}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'var(--accent-muted)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filter === f ? 'var(--accent-border)' : 'rgba(255,255,255,0.08)'}`,
              color: filter === f ? 'var(--accent)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((assumption) => (
          <AssumptionRow key={assumption.id} assumption={assumption} impactColor={impactColor} />
        ))}
      </div>
    </div>
  );
}

function AssumptionRow({ assumption, impactColor }) {
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await base44.entities.PMAAssumption.update(assumption.id, {
        status: 'Verified',
        verified_at: new Date().toISOString().split('T')[0],
      });
      setVerifying(false);
    } catch (err) {
      console.error('Failed to verify:', err);
    }
  };

  const today = new Date();
  const isOverdue = new Date(assumption.due_to_verify) < today;

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${impactColor(assumption.impact)}22`,
        borderLeft: `3px solid ${impactColor(assumption.impact)}`,
        borderRadius: 6,
        padding: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
          <div style={{
            background: impactColor(assumption.impact) + '33',
            color: impactColor(assumption.impact),
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            fontWeight: 700,
            padding: '2px 5px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}>
            {assumption.category}
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 9,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {assumption.assumption_text}
          </div>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          color: isOverdue ? 'var(--status-error)' : 'var(--text-muted)',
          fontWeight: isOverdue ? 700 : 400,
        }}>
          Due: {assumption.due_to_verify}
          {isOverdue && ' (OVERDUE)'}
        </div>
      </div>

      <button
        onClick={handleVerify}
        disabled={verifying}
        style={{
          background: 'transparent',
          border: '1px solid var(--status-success)',
          color: 'var(--status-success)',
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          padding: '3px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          fontWeight: 700,
          marginLeft: 8,
        }}
      >
        {verifying ? '...' : '✓ VERIFY'}
      </button>
    </div>
  );
}