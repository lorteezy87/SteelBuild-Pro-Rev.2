import React, { useEffect, useState } from 'react';
import { usePMA } from '../usePMAContext';
import { useProjectContext } from '@/components/shared/useProjectContext';
import DriftRadar from './DriftRadar';
import WeeklyDelta from './WeeklyDelta';
import RiskRegister from './RiskRegister';
import DecisionTrail from './DecisionTrail';
import { scoreRisks } from '../utils/riskScoring';
import { base44 } from '@/api/base44Client';

export default function PMASummary() {
  const {
    insights,
    isLoadingInsights,
    generateInsights,
    projectSnapshot,
    pmMemory,
    buildProjectSnapshot,
    buildPortfolioSnapshot,
    lastRefreshed,
    setLastRefreshed,
    topPriorityActions,
    setTopPriorityActions,
    setRiskCount,
  } = usePMA();
  const { activeProject: currentProject } = useProjectContext();
  const [risks, setRisks] = useState([]);
  const [isScoring, setIsScoring] = useState(false);
  const [briefingMode, setBriefingMode] = useState('brief'); // 'brief' | 'deep'
  const [portfolioBrief, setPortfolioBrief] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  // Score risks
  useEffect(() => {
    if (projectSnapshot) {
      scoreRisks(projectSnapshot).then((r) => {
        setRisks(r);
        setRiskCount?.(r.length);
      });
    }
  }, [projectSnapshot, setRiskCount]);

  const handleRescoreRisks = async () => {
    setIsScoring(true);
    const scored = await scoreRisks(projectSnapshot || {});
    setRisks(scored);
    setRiskCount?.(scored.length);
    setIsScoring(false);
  };

  // Portfolio brief when no project
  useEffect(() => {
    const runPortfolio = async () => {
      if (currentProject?.id) {
        setPortfolioBrief(null);
        return;
      }
      setPortfolioLoading(true);
      const data = await buildPortfolioSnapshot();
      if (!data) {
        setPortfolioBrief('Unable to load portfolio data.');
        setPortfolioLoading(false);
        return;
      }
      const prompt = `You are the PMA for SteelBuild Pro. Provide a portfolio-level morning brief for a PM managing multiple structural steel projects. Highlight the projects that need attention today.
PORTFOLIO DATA: ${JSON.stringify(data, null, 2)}
FORMAT:
**PORTFOLIO STATUS — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}**
[1 sentence summary]
**PROJECTS NEEDING ATTENTION**
[list at-risk / overdue projects]
**PORTFOLIO METRICS**
[key numbers]
**RECOMMENDED FOCUS**
[1 recommendation]`;
      try {
        const res = await base44.functions.invoke('invokeLLM', { prompt });
        const text = typeof res === 'string' ? res : res?.text || res?.content || res?.response || 'No response';
        setPortfolioBrief(text);
      } catch (e) {
        setPortfolioBrief('Unable to generate portfolio brief.');
      } finally {
        setPortfolioLoading(false);
      }
    };
    runPortfolio();
  }, [currentProject, buildPortfolioSnapshot]);

  if (!currentProject?.id) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.10em', color: 'var(--accent)', marginBottom: 8 }}>
            PORTFOLIO BRIEF
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {portfolioLoading ? 'Loading portfolio briefing…' : (portfolioBrief || 'No portfolio data.')}
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingInsights) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(160,175,210,0.5)' }}>
        <div style={{ fontSize: 20, marginBottom: 12, display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.10em', color: 'var(--accent)' }}>
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
            background: 'linear-gradient(135deg,var(--accent),var(--secondary))',
            border: '1px solid var(--accent-border)',
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

  const insightsText = typeof insights === 'string' ? insights : JSON.stringify(insights, null, 2);
  const isError = insightsText?.startsWith('⚠');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Decision Trail */}
      {currentProject?.id && <DecisionTrail projectId={currentProject.id} />}

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)', borderRadius: 6, padding: 4 }}>
          {['brief', 'deep'].map((m) => (
            <button
              key={m}
              onClick={async () => {
                setBriefingMode(m);
                if (m === 'deep') {
                  // trigger deep dive generation
                  await generateInsights();
                }
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid ' + (briefingMode === m ? 'var(--accent-border)' : 'transparent'),
                background: briefingMode === m ? 'var(--accent-muted)' : 'transparent',
                color: briefingMode === m ? 'var(--accent)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              {m === 'brief' ? 'BRIEF' : 'DEEP DIVE'}
            </button>
          ))}
        </div>
        <button
          onClick={async () => {
            await generateInsights();
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: '1px solid var(--accent-border)',
            borderRadius: 8,
            padding: '7px 14px',
            color: 'var(--accent)',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          ↻ REFRESH
        </button>
        {lastRefreshed && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)' }}>
            Last updated: {new Date(lastRefreshed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

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

      {/* Top 3 actions */}
      {topPriorityActions?.length > 0 && (
        <div style={{
          background: 'rgba(139,92,246,0.06)',
          border: '1px solid rgba(139,92,246,0.15)',
          borderRadius: 8,
          padding: 12,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.10em', color: 'var(--accent)', marginBottom: 8 }}>
            TOP 3 ACTIONS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topPriorityActions.slice(0, 3).map((a, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--accent)', width: 16 }}>{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{a.action}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {a.owner && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8,
                        background: 'var(--accent-muted)',
                        border: '1px solid var(--accent-border)',
                        color: 'var(--accent)',
                        padding: '2px 6px',
                        borderRadius: 999,
                      }}>{a.owner}</span>
                    )}
                    {a.urgency && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8,
                        background: 'var(--warning-muted)',
                        border: '1px solid var(--warning-border)',
                        color: 'var(--status-warning)',
                        padding: '2px 6px',
                        borderRadius: 999,
                      }}>{a.urgency}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
            background: 'var(--accent-muted)',
            border: '1px solid var(--accent-border)',
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              color: 'var(--accent)',
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
          border: '1px solid var(--accent-border)',
          borderRadius: 8,
          padding: '7px 14px',
          color: 'var(--accent)',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: '0.08em',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--accent-muted)';
          e.currentTarget.style.borderColor = 'var(--accent-border)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'var(--accent-border)';
        }}
      >
        ↻ REGENERATE
      </button>
    </div>
  );
}
