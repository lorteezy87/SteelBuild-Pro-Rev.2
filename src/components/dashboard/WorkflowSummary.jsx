import React from 'react';
import { getWorkflowStatus } from '../shared/workflowValidation';

export default function WorkflowSummary({ wps = [], deliveries = [], drawings = [] }) {
  // Categorize WPs by workflow step
  const workflowGroups = {
    blocked:          { items: [] },
    readyForFab:      { items: [] },
    inFabrication:    { items: [] },
    awaitingDelivery: { items: [] },
    readyForInstall:  { items: [] },
    complete:         { items: [] },
  };

  wps.forEach(wp => {
    const status = getWorkflowStatus(wp, drawings, deliveries);
    
    if (status.blocked) {
      workflowGroups.blocked.items.push(wp);
    } else if (wp.status === 'Complete') {
      workflowGroups.complete.items.push(wp);
    } else if (wp.phase === 'Erection' || wp.phase === 'Install') {
      const delivered = deliveries.filter(d =>
        d.work_package_id === wp.id && (d.status === 'Delivered' || d.status === 'Received')
      );
      if (delivered.length > 0) {
        workflowGroups.readyForInstall.items.push(wp);
      } else {
        workflowGroups.awaitingDelivery.items.push(wp);
      }
    } else if (wp.phase === 'Fabrication') {
      workflowGroups.inFabrication.items.push(wp);
    } else {
      workflowGroups.readyForFab.items.push(wp);
    }
  });

  const totalWPs = wps.length;
  const completeWPs = workflowGroups.complete.items.length;
  const pctDone = totalWPs > 0 ? Math.round(completeWPs / totalWPs * 100) : 0;

  const deliveryStatus = {
    scheduled: deliveries.filter(d => d.status === 'Scheduled').length,
    inTransit: deliveries.filter(d => d.status === 'In Transit').length,
    delivered: deliveries.filter(d => d.status === 'Delivered').length,
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 12,
      boxShadow: 'none',
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--accent)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}>
          ▦ Workflow Status
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 16,
          fontWeight: 700,
          color: pctDone === 100 ? 'var(--status-success)' : 'var(--accent)',
        }}>
          {pctDone}%
          <span style={{ fontSize: 8, color: 'var(--text-muted)', marginLeft: 4 }}>DONE</span>
        </div>
      </div>

      {/* Blocked Alert - pulsing when > 0 */}
      {workflowGroups.blocked.items.length > 0 && (
        <div style={{
          background: 'var(--danger-muted)',
          border: '2px solid var(--danger-border)',
          borderRadius: 6,
          padding: '8px 10px',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          animation: 'pulse 2s infinite',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            color: 'var(--status-error)',
            fontWeight: 700,
            letterSpacing: '0.08em',
          }}>
            ⊘ {workflowGroups.blocked.items.length} BLOCKED
          </span>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            color: 'var(--text-secondary)',
          }}>
            Missing drawings
          </span>
        </div>
      )}

      {/* Workflow funnel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {[
          { label: 'READY FOR FAB',     count: workflowGroups.readyForFab.items.length,       color: 'var(--status-warning)', items: workflowGroups.readyForFab.items },
          { label: 'IN FABRICATION',    count: workflowGroups.inFabrication.items.length,      color: 'var(--accent)',          items: workflowGroups.inFabrication.items },
          { label: 'AWAITING DELIVERY', count: workflowGroups.awaitingDelivery.items.length,   color: 'var(--status-info)',     items: workflowGroups.awaitingDelivery.items },
          { label: 'READY FOR INSTALL', count: workflowGroups.readyForInstall.items.length,    color: 'var(--phase-erection)',  items: workflowGroups.readyForInstall.items },
          { label: 'COMPLETE',          count: workflowGroups.complete.items.length,            color: 'var(--status-success)',  items: workflowGroups.complete.items },
        ].map(group => (
          <div key={group.label} style={{
            background: 'var(--bg-surface-low)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-card)',
            padding: '12px 16px',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              color: group.color,
              marginBottom: 4,
            }}>
              {group.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1,
              color: group.color,
            }}>
              {group.count}
            </div>
            {group.items?.slice(0, 3).map(wp => (
              <div key={wp.id} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: 'var(--text-muted)',
                marginTop: 3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {wp.wp_number ? `${wp.wp_number} ` : ''}{wp.name}
              </div>
            ))}
            {group.items?.length > 3 && (
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: 'var(--text-muted)',
                marginTop: 2,
                opacity: 0.6,
              }}>
                +{group.items.length - 3} more
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delivery summary */}
      <div style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid var(--divider)',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          color: 'var(--text-secondary)',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          marginBottom: 6,
          }}>
          DELIVERY PROGRESS
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <div style={{ flex: 1, height: 4, background: 'var(--border-default)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${deliveryStatus.scheduled + deliveryStatus.inTransit + deliveryStatus.delivered > 0 ? (deliveryStatus.delivered / (deliveryStatus.scheduled + deliveryStatus.inTransit + deliveryStatus.delivered)) * 100 : 0}%`,
              background: 'var(--status-success)',
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--status-success)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            {deliveryStatus.delivered}/{deliveryStatus.scheduled + deliveryStatus.inTransit + deliveryStatus.delivered}
          </span>
        </div>
      </div>
    </div>
  );
}