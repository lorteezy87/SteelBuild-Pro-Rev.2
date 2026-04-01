import React, { useRef, useEffect } from 'react';
import { usePMA } from './usePMAContext';
import PMASummary from './tabs/PMASummary';
import PMAChat from './tabs/PMAChat';
import PMATasks from './tabs/PMATasks';
import PMAMemory from './tabs/PMAMemory';
import PMAudit from './tabs/PMAudit';
import PMADraft from './tabs/PMADraft';

export default function PMAPanel() {
  const {
    isOpen, setIsOpen,
    activeTab, setActiveTab,
    unreadInsights,
    sessionId,
    projectSnapshot,
  } = usePMA();
  const panelRef = useRef(null);

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
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
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

  const tabs = [
    { id: 'insights', label: 'Insights' },
    { id: 'chat', label: 'Chat' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'memory', label: 'Memory' },
    { id: 'audit', label: 'Audit', color: '#FFB400' },
    { id: 'draft', label: 'Draft' },
  ];

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
          background: 'rgba(10,18,22,0.74)',
          backdropFilter: 'blur(24px)',
          borderLeft: '1px solid var(--secondary-border)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-12px 0 36px rgba(0,0,0,0.55), inset 0 1px 0 rgba(0,229,255,0.08)',
          animation: 'slideInRight 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'rgba(8,20,24,0.72)',
            padding: '12px 16px',
            borderBottom: '1px solid var(--secondary-border)',
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
              <span style={{ fontSize: 12, color: 'var(--secondary)' }}>✦</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--secondary)',
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
                color: 'var(--secondary)',
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              ×
            </button>
          </div>

          {/* Project health header */}
          {projectSnapshot && (
            <div
              style={{
                background: 'var(--secondary-muted)',
                borderRadius: 6,
                padding: '6px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: 'var(--text-muted)',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                marginBottom: 10,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{(projectSnapshot.project?.name || '').slice(0, 18)}</span>
              {projectSnapshot.project?.phase && (
                <span style={{
                  background: 'var(--accent-muted)',
                  border: '1px solid var(--secondary-border)',
                  color: 'var(--secondary)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontWeight: 700,
                }}>
                  {projectSnapshot.project.phase}
                </span>
              )}
              {projectSnapshot.project?.healthStatus && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: projectSnapshot.project.healthStatus === 'At Risk'
                      ? 'var(--status-error)'
                      : projectSnapshot.project.healthStatus === 'Watch'
                        ? 'var(--status-warning)'
                        : 'var(--status-success)',
                    boxShadow: '0 0 6px currentColor'
                  }} />
                  {projectSnapshot.project.healthStatus}
                </span>
              )}
              <span>{projectSnapshot.rfis?.open || 0} RFIs · {projectSnapshot.rfis?.overdue || 0} overdue</span>
              <span>{projectSnapshot.workPackages?.total || 0} WPs · {projectSnapshot.workPackages?.avgComplete || 0}% avg</span>
            </div>
          )}

          {/* Tab buttons */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              borderBottom: '1px solid var(--secondary-border)',
              paddingBottom: 8,
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: activeTab === tab.id ? (tab.color ? `${tab.color}22` : 'var(--secondary-muted)') : 'transparent',
                  border: activeTab === tab.id ? `1px solid ${tab.color || 'var(--secondary-border)'}` : '1px solid transparent',
                  borderRadius: 6,
                  color: activeTab === tab.id ? (tab.color || 'var(--secondary)') : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8,
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
                {tab.id === 'insights' && unreadInsights > 0 && (
                  <span
                    style={{
                      marginLeft: 4,
                      background: 'var(--status-error)',
                      borderRadius: 10,
                      padding: '0 4px',
                      fontSize: 7,
                      color: 'white',
                    }}
                  >
                    {unreadInsights}
                  </span>
                )}
                {tab.id === 'tasks' && projectSnapshot?.actionItems?.overdueCount > 0 && (
                  <span
                    style={{
                      marginLeft: 4,
                      background: 'var(--status-error)',
                      borderRadius: 10,
                      padding: '0 4px',
                      fontSize: 7,
                      color: 'white',
                    }}
                  >
                    {projectSnapshot.actionItems.overdueCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Session ID */}
        {activeTab === 'audit' && (
          <div
            style={{
              padding: '6px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 7,
                color: 'var(--text-muted)',
                letterSpacing: '0.10em',
              }}
            >
              SESSION {sessionId}
            </span>
          </div>
        )}

        {/* Content */}
        <PanelBoundary resetKey={`${activeTab}-${isOpen ? 'open' : 'closed'}`}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {activeTab === 'insights' && <PMASummary />}
            {activeTab === 'chat' && <PMAChat />}
            {activeTab === 'tasks' && <PMATasks />}
            {activeTab === 'memory' && <PMAMemory />}
            {activeTab === 'audit' && <PMAudit />}
            {activeTab === 'draft' && <PMADraft />}
          </div>
        </PanelBoundary>

        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--accent-border)',
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          background: 'rgba(8,20,24,0.72)',
        }}>
          ⌘⇧P — Open · Esc — Close · ↑↓ — Scroll · Tab — Switch tabs
        </div>

        <style>{`
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </>
  );
}

class PanelBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err) {
    console.error('PMA panel error', err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, color: 'var(--status-error)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          PMA hit an error. Please close and reopen the panel.
        </div>
      );
    }
    return this.props.children;
  }
}
