import React from 'react';
import { getWorkflowStatus } from '../shared/workflowValidation';

export default function WorkflowBadge({ wp, drawings = [], deliveries = [] }) {
  const status = getWorkflowStatus(wp, drawings, deliveries);

  if (status.blocked) {
    return (
      <span style={{
        fontFamily: 'IBM Plex Mono',
        fontSize: 9,
        color: '#FF3D3D',
        background: 'rgba(255,61,61,0.10)',
        border: '1px solid rgba(255,61,61,0.22)',
        borderRadius: 3,
        padding: '2px 7px',
        letterSpacing: '0.08em',
        whiteSpace: 'nowrap',
      }}>
        ⊘ BLOCKED · {status.message}
      </span>
    );
  }

  return (
    <span style={{
      fontFamily: 'IBM Plex Mono',
      fontSize: 9,
      color: '#00D68F',
      background: 'rgba(0,214,143,0.10)',
      border: '1px solid rgba(0,214,143,0.22)',
      borderRadius: 3,
      padding: '2px 7px',
      letterSpacing: '0.08em',
      whiteSpace: 'nowrap',
    }}>
      ✓ {status.step}
    </span>
  );
}