import React, { useEffect, useState } from 'react';
import { usePMA } from '../usePMAContext';
import { useProjectContext } from '@/components/shared/useProjectContext';
import DriftRadar from './DriftRadar';
import WeeklyDelta from './WeeklyDelta';
import RiskRegister from './RiskRegister';
import DecisionTrail from './DecisionTrail';
import { scoreRisks } from '../utils/riskScoring';

export default function PMASummary() {
  const { insights, isLoadingInsights, generateInsights, projectSnapshot, pmMemory, buildProjectSnapshot } = usePMA();
  const { activeProject: currentProject } = useProjectContext();
  const [risks, setRisks] = useState([]);
  const [isScoring, setIsScoring] = useState(false);

  if (!currentProject?.id) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '48px 24px',
      }}>
        <div style={{
          fontSize: 32,
          marginBottom: 12,
        }}>📌</div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10, fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          No Project Selected
        </div>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          Select a project using the
          dropdown in the top right,
          then open PMA to generate
          your briefing.
        </div>
      </div>
    );
  }

  useEffect(() => {
    // Build snapshot on mount if needed
    if (!projectSnapshot) {
      buildProjectSnapshot();
    }
  }, []);

  const handleRescoreRisks = async () => {
    setIsScoring(true);
    const scored = await scoreRisks(projectSnapshot || {});
    setRisks(scored);
    setIsScoring(false);
  };

  useEffect(() => {
    if (projectSnapshot && risks.length === 0) {
      scoreRisks(projectSnapshot).then(setRisks);
    }
  }, [projectSnapshot]);

  if (isLoadingInsights) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(160,175,210,0.5)' }}>
        <div style={{
          fontSize: 20,
          marginBottom: 12,
          display: 'inline-block',
          animation: 'spin 1s linear infinite',
        }}>⟳</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.10em', color: '#A78BFA' }}>
          PMA IS GENERATING BRIEFING...
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(160,175,210,0.5)' }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>✦</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, marginBottom: 16, color: 'rgba(160,175,210,0.6)' }}>
          No briefing generated yet
        </div>
        <button
          onClick={generateInsights}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'linear-gradient(135deg,#8B5CF6,#6D40D4)',
            border: '1px solid rgba(139,92,246,0.4)',
            borderRadius: 8,
            padding: '8px 16px',
            color: 'white',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          ✦ GENERATE BRIEFING
        </button>
      </div>
    );
  }

  // insights is a raw string from the API
  const insightsText = typeof insights === 'string' ? insights : JSON.stringify(insights, null, 2);
  const isError = insightsText?.startsWith('⚠');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Decision Trail */}
      {currentProject?.id && <DecisionTrail projectId={currentProject.id} />}

      {/* Weekly Delta */}
      {projectSnapshot && <WeeklyDelta snapshot={projectSnapshot} pmMemory={pmMemory} />}

      {/* Drift Radar */}
      {projectSnapshot && <DriftRadar snapshot={projectSnapshot} />}

      {/* Risk Register */}
      {projectSnapshot && (
        <RiskRegister
          risks={risks}
          onRescore={handleRescoreRisks}
          isScoring={isScoring}
        />
      )}

      {/* Briefing content */}
      {isError ? (
        <div style={{
          background: 'var(--danger-muted)',
          border: '1px solid var(--danger-border)',
          borderRadius: 8,
          padding: '14px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--status-error)',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 9, letterSpacing: '0.10em' }}>
            PMA ERROR — OPEN F12 CONSOLE FOR DETAILS
          </div>
          {insightsText}
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              color: '#A78BFA',
              letterSpacing: '0.08em',
              marginBottom: 10,
              textTransform: 'uppercase',
            }}
          >
            ✦ Daily Briefing
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: '#F2F4F8',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {insightsText}
          </div>
        </div>
      )}

      {/* Regenerate button */}
      <button
        onClick={generateInsights}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: 'transparent',
          border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 8,
          padding: '7px 14px',
          color: '#A78BFA',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: '0.08em',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(139,92,246,0.1)';
          e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'rgba(139,92,246,0.25)';
        }}
      >
        ⟳ REGENERATE
      </button>
    </div>
  );
}