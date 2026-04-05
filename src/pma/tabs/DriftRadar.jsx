import React from 'react';
import { detectDrift, severityColor, severityBg } from '../utils/driftDetection';

export default function DriftRadar({ snapshot }) {
  const driftItems = detectDrift(snapshot);
  const lastChecked = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (driftItems.length === 0) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(160,175,210,0.40)', letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>
          DRIFT RADAR
        </div>
        <div style={{
          background: 'rgba(0,214,143,0.06)',
          border: '1px solid rgba(0,214,143,0.2)',
          borderRadius: 8,
          padding: 12,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>✓</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'rgba(0,214,143,0.80)' }}>
            No significant drift detected
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(160,175,210,0.40)', letterSpacing: '0.12em', marginBottom: 3, textTransform: 'uppercase' }}>
            DRIFT RADAR
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'rgba(160,175,210,0.50)' }}>
            Early warning across 6 project dimensions
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'rgba(160,175,210,0.25)' }}>
          Last: {lastChecked}
        </div>
      </div>

      {driftItems.map((item, idx) => (
        <div
          key={idx}
          style={{
            background: severityBg(item.severity),
            border: `1px solid ${severityColor(item.severity)}33`,
            borderLeft: `3px solid ${severityColor(item.severity)}`,
            borderRadius: 8,
            padding: 10,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <div style={{
              background: severityColor(item.severity),
              color: 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 7,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
            }}>
              {item.dimension}
            </div>
            <div style={{
              background: severityColor(item.severity) + '22',
              color: severityColor(item.severity),
              fontFamily: 'var(--font-mono)',
              fontSize: 7,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
            }}>
              {item.severity}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'rgba(220,228,245,0.75)', flex: 1 }}>
              {item.detail}
            </div>
          </div>

          {item.items.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {item.items.map((item_name, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--accent-muted)',
                    border: '1px solid var(--accent-border)',
                    color: 'var(--accent)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {item_name}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
