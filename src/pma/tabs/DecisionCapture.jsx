import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function DecisionCapture({ message, projectId, projectName, sessionId, onClose }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    decisionText: message.slice(0, 200),
    decidedBy: '',
    rationale: '',
    phase: 'Fabrication',
    linkedArtifacts: [],
    impactLevel: 'High',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!formData.decisionText || !formData.decidedBy) return;
    setSaving(true);
    try {
      await base44.entities.PMADecision.create({
        project_id: projectId,
        project_name: projectName,
        session_id: sessionId,
        decision_text: formData.decisionText,
        decided_by: formData.decidedBy,
        rationale: formData.rationale,
        phase: formData.phase,
        impact_level: formData.impactLevel,
        linked_artifacts: JSON.stringify(formData.linkedArtifacts),
        status: 'Active',
        decided_at: new Date().toISOString().split('T')[0],
      });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setShowForm(false);
        onClose?.();
      }, 2000);
    } catch (err) {
      console.error('Failed to save decision:', err);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div style={{ background: 'rgba(0,214,143,0.06)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, padding: 10, marginTop: 6, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: '#00D68F' }}>
          ✓ Decision logged
        </div>
      </div>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        style={{
          background: 'var(--accent-muted)',
          border: '1px solid var(--accent-border)',
          borderRadius: 6,
          padding: '4px 10px',
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          letterSpacing: '0.10em',
          cursor: 'pointer',
          marginTop: 6,
        }}
      >
        + LOG DECISION
      </button>
    );
  }

  return (
    <div style={{
      background: 'var(--accent-muted)',
      border: '1px solid var(--accent-muted)',
      borderRadius: 8,
      padding: 10,
      marginTop: 6,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          type="text"
          placeholder="Decided by (name)"
          value={formData.decidedBy}
          onChange={(e) => setFormData({ ...formData, decidedBy: e.target.value })}
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--accent-border)',
            borderRadius: 4,
            padding: '5px 8px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            outline: 'none',
          }}
        />

        <textarea
          placeholder="Rationale (why)"
          value={formData.rationale}
          onChange={(e) => setFormData({ ...formData, rationale: e.target.value })}
          rows={2}
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--accent-border)',
            borderRadius: 4,
            padding: '5px 8px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            outline: 'none',
            resize: 'none',
          }}
        />

        <select
          value={formData.phase}
          onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--accent-border)',
            borderRadius: 4,
            padding: '5px 8px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            outline: 'none',
          }}
        >
          <option value="Preconstruction">Preconstruction</option>
          <option value="Procurement">Procurement</option>
          <option value="Fabrication">Fabrication</option>
          <option value="Field Execution">Field Execution</option>
          <option value="Closeout">Closeout</option>
        </select>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleSave}
            disabled={!formData.decidedBy || saving}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg,var(--accent),var(--secondary))',
              border: 'none',
              borderRadius: 4,
              padding: '6px 10px',
              color: 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '...' : 'SAVE'}
          </button>

          <button
            onClick={() => setShowForm(false)}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid var(--accent-border)',
              borderRadius: 4,
              padding: '6px 10px',
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
