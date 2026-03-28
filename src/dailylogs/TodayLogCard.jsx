import React from "react";
import { Button } from "@/components/ui/button";

export default function TodayLogCard({ 
  todayLog, 
  lastLog, 
  onCreateToday 
}) {
  if (todayLog) return null; // Don't show if today's log exists

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  const lastLogDate = lastLog ? new Date(lastLog.date).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  }) : null;

  return (
    <div style={{
      background: 'var(--warning-muted)',
      border: '1px solid var(--warning-border)',
      borderLeft: '3px solid var(--status-warning)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 6,
        }}>
          📋 No log for today — {todayStr}
        </div>
        {lastLog && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-muted)',
          }}>
            Last log: {lastLogDate} — {lastLog.superintendent} — {lastLog.headcount} crew
          </div>
        )}
      </div>
      <Button
        onClick={onCreateToday}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 600,
          padding: '8px 16px',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        + Create Today's Log
      </Button>
    </div>
  );
}