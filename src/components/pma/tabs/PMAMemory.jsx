import React, { useState } from 'react';
import { usePMA } from '../usePMAContext';
import DecisionTrail from './DecisionTrail';
import ActiveAssumptions from './ActiveAssumptions';
import { useProjectContext } from '@/components/shared/useProjectContext';

export default function PMAMemory() {
  const { pmMemory } = usePMA();
  const { activeProject } = useProjectContext();

  // Lazy initializer — runs once on mount, never overwritten by re-renders
  const [instructions, setInstructions] = useState(() => {
    try {
      return localStorage.getItem('pma_custom_instructions') || '';
    } catch {
      return '';
    }
  });

  const [savedConfirm, setSavedConfirm] = useState(false);

  const handleSaveInstructions = () => {
    try {
      localStorage.setItem('pma_custom_instructions', instructions);
      setSavedConfirm(true);
      setTimeout(() => setSavedConfirm(false), 3000);
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Decision Trail */}
      {activeProject && <DecisionTrail projectId={activeProject.id} />}

      {/* Active Assumptions */}
      {activeProject && <ActiveAssumptions projectId={activeProject.id} />}

      <div
        style={{
          background: 'rgba(139,92,246,0.06)',
          border: '1px solid rgba(139,92,246,0.15)',
          borderRadius: 8,
          padding: 12,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            fontWeight: 700,
            color: '#A78BFA',
            letterSpacing: '0.08em',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          ✦ What PMA Knows About You
        </div>

        {pmMemory ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pmMemory.pmName && (
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    color: '#A78BFA',
                    marginBottom: 4,
                    fontWeight: 700,
                  }}
                >
                  NAME
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    }}
                    >
                    {pmMemory.pmName}
                </div>
              </div>
            )}

            {pmMemory.writingStyle && (
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    color: '#A78BFA',
                    marginBottom: 4,
                    fontWeight: 700,
                  }}
                >
                  COMMUNICATION STYLE
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    }}
                    >
                    {pmMemory.writingStyle}
                </div>
              </div>
            )}

            {pmMemory.riskTolerance && (
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    color: '#A78BFA',
                    marginBottom: 4,
                    fontWeight: 700,
                  }}
                >
                  RISK TOLERANCE
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    }}
                    >
                    {pmMemory.riskTolerance}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'rgba(160,175,210,0.4)', fontSize: 10 }}>
            PMA is learning about your work patterns...
          </div>
        )}
      </div>

      {/* Custom Instructions */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            fontWeight: 700,
            color: '#A78BFA',
            letterSpacing: '0.08em',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          📝 Custom Instructions
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            background: 'rgba(139,92,246,0.06)',
            border: '1px solid rgba(139,92,246,0.15)',
            borderRadius: 8,
            padding: 8,
          }}
        >
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Tell PMA how you work. E.g.:&#10;Always CC Sarah on change orders&#10;Flag anything over $10k immediately"
            rows={8}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--bg-input)',
              border: '1px solid rgba(139,92,246,0.25)',
              borderRadius: 6,
              padding: '8px 10px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 10,
              lineHeight: 1.4,
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <button
            onClick={handleSaveInstructions}
            style={{
              marginTop: 6,
              width: '100%',
              background: savedConfirm
                ? 'rgba(0,214,143,0.15)'
                : 'linear-gradient(135deg,#8B5CF6,#6D40D4)',
              border: '1px solid',
              borderColor: savedConfirm
                ? 'var(--success-border)'
                : 'rgba(139,92,246,0.5)',
              borderRadius: 8,
              padding: '9px 20px',
              color: savedConfirm ? 'var(--status-success)' : 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.10em',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {savedConfirm ? '✓ SAVED' : '↑ SAVE INSTRUCTIONS'}
          </button>
        </div>
      </div>

      {/* Clear Instructions */}
      <button
        onClick={() => {
          if (
            window.confirm(
              'Clear all custom instructions?'
            )
          ) {
            localStorage.removeItem('pma_custom_instructions');
            setInstructions('');
          }
        }}
        style={{
          background: 'rgba(255,61,61,0.10)',
          border: '1px solid rgba(255,61,61,0.2)',
          borderRadius: 6,
          padding: '6px 12px',
          color: 'var(--status-error)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        CLEAR INSTRUCTIONS
      </button>
    </div>
  );
}