import React, { useState } from 'react';
import { getRiskSeverity } from '../utils/riskScoring';

export default function RiskRegister({ risks = [], onRescore, isScoring = false }) {
  const [expandedRisk, setExpandedRisk] = useState(null);

  if (!risks || risks.length === 0) {
    return (
      <div style={{
        padding: '20px 14px',
        textAlign: 'center',
        color: 'rgba(160,175,210,0.35)',
        fontFamily: 'var(--font-body)',
        fontSize: 11,
      }}>
        ✓ No critical risks detected.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 4px',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            letterSpacing: '0.12em',
            color: 'var(--text-muted)',
            marginBottom: 2,
            textTransform: 'uppercase',
          }}>
            RISK REGISTER
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 9,
            color: 'rgba(160,175,210,0.25)',
          }}>
            AI-scored from live project data
          </div>
        </div>
        <button
          onClick={onRescore}
          disabled={isScoring}
          style={{
            background: 'rgba(139,92,246,0.10)',
            border: '1px solid rgba(139,92,246,0.25)',
            borderRadius: 6,
            padding: '4px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            fontWeight: 700,
            color: isScoring ? 'var(--text-muted)' : '#A78BFA',
            cursor: isScoring ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            opacity: isScoring ? 0.5 : 1,
          }}
        >
          {isScoring ? '⟳ SCORING...' : '↺ RE-SCORE'}
        </button>
      </div>

      {/* Severity legend */}
      <div style={{
        display: 'flex',
        gap: 8,
        fontSize: 8,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.08em',
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        {[
          { range: '17–25', severity: 'CRITICAL', color: '#FF3D3D' },
          { range: '10–16', severity: 'HIGH', color: 'var(--accent)' },
          { range: '5–9', severity: 'MEDIUM', color: '#FFB400' },
          { range: '1–4', severity: 'LOW', color: '#00D68F' },
        ].map((item) => (
          <div key={item.severity} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: item.color,
            }} />
            <span style={{ color: item.color }}>{item.severity} {item.range}</span>
          </div>
        ))}
      </div>

      {/* Risk cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {risks.map((risk, idx) => {
          const severity = getRiskSeverity(risk.score);
          const isExpanded = expandedRisk === idx;

          return (
            <div
              key={idx}
              onClick={() => setExpandedRisk(isExpanded ? null : idx)}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid rgba(255,255,255,0.08)`,
                borderLeft: `3px solid ${severity.color}`,
                borderRadius: 8,
                padding: '10px 12px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {/* Score badge */}
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 22,
                  fontWeight: 700,
                  color: severity.color,
                  minWidth: 32,
                  textAlign: 'center',
                  lineHeight: 1,
                }}>
                  {risk.score}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    marginBottom: 6,
                    fontWeight: 500,
                  }}>
                    {risk.risk}
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    marginBottom: 6,
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 7,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 3,
                      padding: '2px 6px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}>
                      {risk.category}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 7,
                      background: 'rgba(139,92,246,0.10)',
                      border: '1px solid rgba(139,92,246,0.25)',
                      borderRadius: 3,
                      padding: '2px 6px',
                      color: '#A78BFA',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}>
                      {risk.owner}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 7,
                      color: risk.urgency === 'Act Now' ? 'var(--status-error)' : risk.urgency === 'This Week' ? 'var(--status-warning)' : 'var(--text-muted)',
                      fontWeight: risk.urgency === 'Act Now' ? 700 : 400,
                    }}>
                      {risk.urgency === 'Act Now' && '⚡'} {risk.urgency}
                    </span>
                  </div>

                  {/* Linked records */}
                  {risk.linkedRecords && risk.linkedRecords.length > 0 && (
                    <div style={{
                      display: 'flex',
                      gap: 4,
                      flexWrap: 'wrap',
                      marginBottom: 6,
                    }}>
                      {risk.linkedRecords.map((record) => (
                        <span
                          key={record}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 8,
                            background: 'var(--accent-muted)',
                            border: '1px solid var(--accent-border)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            color: 'var(--accent)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--accent-muted)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--accent-muted)';
                          }}
                        >
                          [{record}]
                        </span>
                      ))}
                    </div>
                  )}

                  {isExpanded && (
                    <div style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 10,
                        color: 'var(--text-muted)',
                      }}>
                        <strong>Driver:</strong> {risk.driver}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 10,
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                      }}>
                        → {risk.recommendation}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}