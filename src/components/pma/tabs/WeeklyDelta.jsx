import React, { useState } from 'react';
import { usePMA } from '../usePMAContext';

const buildDelta = (current, baseline) => {
  if (!baseline) return null;

  const delta = {
    newRFIs: [],
    closedRFIs: [],
    newCOs: [],
    lateDeliveries: [],
    approvedSubmittals: [],
    revisedDrawings: [],
  };

  const baselineRFIIds = baseline.rfis?.records?.map(r => r.id) || [];
  const baselineCoIds = baseline.changeOrders?.records?.map(c => c.id) || [];
  const baselineSubIds = baseline.submittals?.records?.map(s => s.id) || [];

  delta.newRFIs = current.rfis?.records?.filter(r => !baselineRFIIds.includes(r.id)).slice(0, 3) || [];
  delta.closedRFIs = baselineRFIIds.filter(id =>
    current.rfis?.records?.find(r => r.id === id && r.status === 'Closed')
  ) || [];
  delta.newCOs = current.changeOrders?.records?.filter(c => !baselineCoIds.includes(c.id) && c.status === 'Approved').slice(0, 3) || [];
  delta.lateDeliveries = current.deliveries?.lateItems?.length || 0;
  delta.approvedSubmittals = current.submittals?.records?.filter(s => !baselineSubIds.includes(s.id) && s.status === 'Approved').slice(0, 3) || [];

  return delta;
};

export default function WeeklyDelta({ snapshot, pmMemory }) {
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const { saveWeeklyBaseline, savePMMemory } = usePMA();

  let baseline = null;
  if (pmMemory?.weekly_baseline) {
    try {
      baseline = typeof pmMemory.weekly_baseline === 'string'
        ? JSON.parse(pmMemory.weekly_baseline)
        : pmMemory.weekly_baseline;
    } catch (e) {
      console.warn('Could not parse baseline:', e);
    }
  }

  const delta = baseline ? buildDelta(snapshot, baseline) : null;

  const handleUpdateBaseline = () => {
    if (!snapshot) return;
    saveWeeklyBaseline?.(snapshot);
    savePMMemory?.({
      ...(pmMemory || {}),
      weekly_baseline: snapshot,
    });
    setShowUpdateConfirm(true);
    window.setTimeout(() => setShowUpdateConfirm(false), 1800);
  };

  if (!delta) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(160,175,210,0.40)', letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>
          SINCE LAST WEEK
        </div>
        <div style={{
          background: 'var(--accent-muted)',
          border: '1px solid var(--accent-muted)',
          borderRadius: 8,
          padding: 12,
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'rgba(160,175,210,0.50)', marginBottom: 8 }}>
            No baseline set yet
          </div>
          <button
            onClick={handleUpdateBaseline}
            style={{
              background: 'linear-gradient(135deg,var(--accent),var(--secondary))',
              border: '1px solid var(--accent-border)',
              borderRadius: 6,
              padding: '6px 12px',
              color: 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ↑ SET BASELINE
          </button>
        </div>
      </div>
    );
  }

  const newCount = delta.newRFIs.length + delta.newCOs.length;
  const closedCount = delta.closedRFIs.length + delta.approvedSubmittals.length;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(160,175,210,0.40)', letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>
        SINCE LAST WEEK
      </div>

      <div style={{
        background: 'var(--accent-muted)',
        border: '1px solid var(--accent-muted)',
        borderRadius: 8,
        padding: 12,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          {newCount > 0 && (
            <div style={{
              background: 'var(--warning-muted)',
              border: '1px solid var(--warning-border)',
              borderRadius: 6,
              padding: '8px 10px',
              textAlign: 'center',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: '#FF9A60', fontWeight: 700, marginBottom: 2 }}>
                NEW
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#FF9A60', fontWeight: 600 }}>
                +{newCount}
              </div>
            </div>
          )}

          {closedCount > 0 && (
            <div style={{
              background: 'rgba(0,214,143,0.12)',
              border: '1px solid rgba(0,214,143,0.25)',
              borderRadius: 6,
              padding: '8px 10px',
              textAlign: 'center',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: '#00D68F', fontWeight: 700, marginBottom: 2 }}>
                RESOLVED
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#00D68F', fontWeight: 600 }}>
                ✓ {closedCount}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleUpdateBaseline}
          style={{
            width: '100%',
            background: showUpdateConfirm ? 'rgba(0,214,143,0.15)' : 'transparent',
            border: '1px solid var(--accent-border)',
            borderRadius: 6,
            padding: '6px 12px',
            color: showUpdateConfirm ? 'var(--status-success)' : 'var(--accent)',
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {showUpdateConfirm ? '✓ BASELINE UPDATED' : '↺ UPDATE BASELINE'}
        </button>
      </div>
    </div>
  );
}
