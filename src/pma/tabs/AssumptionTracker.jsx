import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { detectAssumptions } from '../utils/assumptionDetection';

export default function AssumptionTracker({ message, projectId, projectName, sessionId }) {
  const [showTracker, setShowTracker] = useState(false);
  const assumptions = detectAssumptions(message);

  if (assumptions.length === 0) return null;

  return (
    <div style={{ marginTop: 6 }}>
      {assumptions.map((assumption, idx) => (
        <AssumptionItem
          key={idx}
          assumption={assumption}
          projectId={projectId}
          projectName={projectName}
          sessionId={sessionId}
        />
      ))}
    </div>
  );
}

function AssumptionItem({ assumption, projectId, projectName, sessionId }) {
  const [tracked, setTracked] = useState(false);

  const handleTrack = async () => {
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      await base44.entities.PMAAssumption.create({
        project_id: projectId,
        project_name: projectName,
        session_id: sessionId,
        assumption_text: assumption.text,
        category: assumption.category,
        status: 'Active',
        assumed_at: new Date().toISOString().split('T')[0],
        due_to_verify: dueDate.toISOString().split('T')[0],
        impact: 'High',
      });
      setTracked(true);
    } catch (err) {
      console.error('Failed to track assumption:', err);
    }
  };

  return (
    <div
      style={{
        background: 'rgba(255,180,0,0.07)',
        border: '1px solid rgba(255,180,0,0.18)',
        borderLeft: '3px solid #FFB400',
        borderRadius: '0 6px 6px 0',
        padding: '8px 10px',
        marginBottom: 6,
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: '#FFB400', letterSpacing: '0.10em', marginBottom: 3 }}>
        ⚠ ASSUMPTION DETECTED
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'rgba(220,228,245,0.70)', margin: '4px 0 6px' }}>
        {assumption.text}
      </p>
      <button
        onClick={handleTrack}
        disabled={tracked}
        style={{
          background: tracked ? 'rgba(0,214,143,0.12)' : 'rgba(255,180,0,0.12)',
          border: `1px solid ${tracked ? 'rgba(0,214,143,0.25)' : 'rgba(255,180,0,0.25)'}`,
          color: tracked ? '#00D68F' : '#FFB400',
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          padding: '3px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          fontWeight: 700,
        }}
      >
        {tracked ? '✓ TRACKED' : '+ TRACK'}
      </button>
    </div>
  );
}
