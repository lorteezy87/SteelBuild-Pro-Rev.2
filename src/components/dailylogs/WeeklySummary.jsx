import React from "react";

export default function WeeklySummary({ weekStats }) {
  if (!weekStats) return null;

  const kpis = [
    { 
      label: "Crew-Days", 
      value: weekStats.crewDays, 
      color: "var(--status-info)" 
    },
    { 
      label: "Field Hours", 
      value: weekStats.totalHours, 
      color: "#0D9488" 
    },
    { 
      label: "Delay Hours", 
      value: weekStats.delayHours, 
      color: weekStats.delayHours > 0 ? "var(--status-error)" : "var(--status-success)"
    },
    { 
      label: "Safety", 
      value: weekStats.safetyIncidents > 0 ? `⚠ ${weekStats.safetyIncidents}` : "✓ Safe",
      color: weekStats.safetyIncidents > 0 ? "var(--status-error)" : "var(--status-success)"
    },
    { 
      label: "Log Coverage", 
      value: `${weekStats.logCoverage}%`, 
      color: "var(--accent)"
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 12,
      marginBottom: 20,
    }}>
      {kpis.map((kpi, idx) => (
        <div
          key={idx}
          style={{
            background: 'var(--bg-surface-low)',
            border: '1px solid var(--border-default)',
            borderRadius: 10,
            padding: 12,
            textAlign: 'center',
          }}
        >
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            {kpi.label}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 700,
            color: kpi.color,
          }}>
            {kpi.value}
          </div>
        </div>
      ))}
    </div>
  );
}