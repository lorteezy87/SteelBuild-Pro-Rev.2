import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePMA } from './usePMAContext';
import { useProjectContext } from '@/components/shared/useProjectContext';
import PMASummary from './tabs/PMASummary';
import PMAChat from './tabs/PMAChat';
import PMATasks from './tabs/PMATasks';
import PMAMemory from './tabs/PMAMemory';
import PMAudit from './tabs/PMAudit';
import RiskRegister from './tabs/RiskRegister';
import PMADraft from './tabs/PMADraft';
import WeeklyDelta from './tabs/WeeklyDelta';
import DriftRadar from './tabs/DriftRadar';

class PMAErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('PMA panel error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, color: 'var(--status-error)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          PMA encountered an error. Close and reopen. {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function PMAPanel() {
  const {
    isOpen, setIsOpen,
    activeTab, setActiveTab,
    unreadInsights,
    projectSnapshot,
    tasks,
  } = usePMA();
  const { activeProject } = useProjectContext();
  const panelRef = useRef(null);
  const [riskCount, setRiskCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, setIsOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsOpen(true);
        setActiveTab('chat');
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen, setActiveTab]);

  if (!isOpen) return null;

  const overdueTasks = tasks?.filter(t => t.status !== 'Complete' && t.due_date && new Date(t.due_date) < new Date())?.length || 0;

  const healthDot = (health) => {
    const color = health === 'At Risk'
      ? 'var(--status-error)'
      : health === 'Watch'
        ? 'var(--status-warning)'
        : 'var(--status-success)';
    return <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`
    }} />;
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 999,
        }}
        onClick={() => setIsOpen(false)}
      />

      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 52,
          right: 0,
          bottom: 0,
          width: 520,
          background: 'var(--bg-surface-low)',
          borderLeft: '1px solid rgba(139,92,246,0.25)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
          animation: 'slideInRight 0.25s ease-out',
        }}
      >
        <PMAErrorBoundary>
          <div
            style={{
              background: 'var(--bg-surface-mid)',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(139,92,246,0.15)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#A78BFA' }}>✦</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#A78BFA',
                    letterSpacing: '0.08em',
                  }}
                >
                  PMA
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(139,92,246,0.6)',
                  cursor: 'pointer',
                  fontSize: 18,
                }}
              >
                ×
              </button>
            </div>

            {projectSnapshot && (
              <div
                style={{
                  background: 'rgba(139,92,246,0.06)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {projectSnapshot.project?.name?.slice(0, 18) || 'Project'}
                </span>
                {projectSnapshot.project?.phase && (
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(123,208,255,0.15)',
                    color: 'var(--accent)',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                  }}>
                    {projectSnapshot.project.phase}
                  </span>
                )}
                {healthDot(projectSnapshot.project?.health_status || 'On Track')}
                <span>{projectSnapshot.rfis?.open || 0} RFIs · {projectSnapshot.rfis?.overdue || 0} overdue</span>
                <span>{projectSnapshot.workPackages?.total || 0} WPs · {projectSnapshot.workPackages?.avgProgress || 0}% avg</span>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 6,
                borderBottom: '1px solid rgba(139,92,246,0.15)',
                paddingBottom: 8,
                marginTop: 12,
              }}
            >
              {[
                { id: 'insights', label: 'Insights', badge: unreadInsights },
                { id: 'chat', label: 'Chat' },
                { id: 'tasks', label: 'Tasks', badge: overdueTasks },
                { id: 'memory', label: 'Memory' },
                { id: 'risks', label: 'Risks', badge: riskCount || 0 },
                { id: 'draft', label: 'Draft' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '6px 8px',
                    background: activeTab === tab.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                    border: activeTab === tab.id ? '1px solid rgba(139,92,246,0.4)' : '1px solid transparent',
                    borderRadius: 6,
                    color: activeTab === tab.id ? '#A78BFA' : 'rgba(139,92,246,0.6)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {tab.label}
                  {tab.badge > 0 && (
                    <span
                      style={{
                        background: tab.id === 'tasks' ? 'var(--status-error)' : 'var(--accent)',
                        borderRadius: 10,
                        padding: '0 5px',
                        fontSize: 7,
                        color: '#002E6A',
                        fontWeight: 800,
                      }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {activeTab === 'insights' && <PMASummary />}
            {activeTab === 'chat' && <PMAChat />}
            {activeTab === 'tasks' && <PMATasks />}
            {activeTab === 'memory' && <PMAMemory />}
            {activeTab === 'risks' && <RiskRegister onCountChange={setRiskCount} />}
            {activeTab === 'draft' && <PMADraft />}
            {activeTab === 'audit' && <PMAudit />}
            {activeTab === 'weekly' && <WeeklyDelta />}
            {activeTab === 'drift' && <DriftRadar />}
          </div>

          <div
            style={{
              padding: '8px 12px',
              borderTop: '1px solid rgba(139,92,246,0.15)',
              background: 'var(--bg-surface-mid)',
              fontFamily: 'var(--font-mono)',
              fontSize: 7,
              color: 'var(--text-muted)',
              letterSpacing: '0.10em',
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            <span>⌘⇧P — Open</span>
            <span>Esc — Close</span>
            <span>↑↓ — Scroll</span>
            <span>Tab — Switch tabs</span>
          </div>
        </PMAErrorBoundary>
      </div>
    </>
  );
}
