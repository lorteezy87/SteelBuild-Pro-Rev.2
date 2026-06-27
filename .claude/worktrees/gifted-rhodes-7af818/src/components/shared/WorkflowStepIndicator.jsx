import React from 'react';

export default function WorkflowStepIndicator({ 
  currentStep = 'Work Package', 
  blockedStep = null, 
  completedSteps = [] 
}) {
  const steps = [
    { id: 'drawings', label: 'DRAWINGS' },
    { id: 'workpackage', label: 'WORK PKG' },
    { id: 'fabrication', label: 'FABRICATION' },
    { id: 'delivery', label: 'DELIVERY' },
    { id: 'install', label: 'INSTALL' },
  ];

  const normalizeLabel = (label) => label.toUpperCase().slice(0, 4);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      margin: '12px 0',
    }}>
      {steps.map((step, i) => {
        const isComplete = completedSteps.includes(step.id);
        const isCurrent = normalizeLabel(currentStep) === normalizeLabel(step.label);
        const isBlocked = blockedStep && normalizeLabel(blockedStep) === normalizeLabel(step.label);

        return (
          <React.Fragment key={step.id}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isBlocked
                  ? 'var(--status-error)'
                  : isComplete
                  ? 'var(--status-success)'
                  : isCurrent
                  ? 'var(--accent)'
                  : 'transparent',
                border: isBlocked || isComplete || isCurrent
                  ? 'none'
                  : '2px solid var(--border-strong)',
                fontSize: 14,
                fontWeight: 700,
                color: isBlocked || isComplete || isCurrent
                  ? '#ffffff'
                  : 'var(--text-muted)',
              }}>
                {isBlocked ? '⊘' : isComplete ? '✓' : i + 1}
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginTop: 6,
                textAlign: 'center',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
              }}>
                {step.label}
              </span>
            </div>

            {i < steps.length - 1 && (
               <div style={{
                 flex: 1,
                 height: 2,
                 marginBottom: 18,
                 background: isComplete ? 'var(--status-success)' : 'var(--border-default)',
               }} />
             )}
          </React.Fragment>
        );
      })}
    </div>
  );
}