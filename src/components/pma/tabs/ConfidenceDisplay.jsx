import React, { useState } from 'react';
import { getConfidenceColor } from '../utils/confidenceScoring';

export default function ConfidenceDisplay({ confidence }) {
  const [showCaveats, setShowCaveats] = useState(false);

  if (!confidence || !confidence.overall) return null;

  const {
    overall = 0,
    source = 'incomplete_data',
    caveats = [],
    missingData = [],
  } = confidence;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          color: getConfidenceColor(overall),
        }}>
          {overall}%
        </span>

        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          letterSpacing: '0.10em',
          color: 'var(--text-muted)',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '1px 6px',
          borderRadius: 3,
          textTransform: 'uppercase',
        }}>
          {source.replace(/_/g, ' ')}
        </span>

        {caveats.length > 0 && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            color: 'var(--status-warning)',
            cursor: 'help',
          }}>
            ⚠ {caveats.length} caveat{caveats.length > 1 ? 's' : ''}
          </span>
        )}

        <button
          onClick={() => setShowCaveats(!showCaveats)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 9,
            cursor: 'pointer',
            marginLeft: 'auto',
            padding: '0 4px',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgba(160,175,210,0.55)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(160,175,210,0.35)';
          }}
        >
          {showCaveats ? '▲' : '▾'} details
        </button>
      </div>

      {showCaveats && (
        <div style={{
          marginTop: 4,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 6,
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}>
          {caveats.map((c, i) => (
            <div key={i} style={{ marginBottom: 4 }}>• {c}</div>
          ))}
          {missingData.length > 0 && (
            <div style={{
              marginTop: 6,
              color: 'var(--text-muted)',
              fontStyle: 'normal',
            }}>
              <strong>Missing:</strong> {missingData.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}