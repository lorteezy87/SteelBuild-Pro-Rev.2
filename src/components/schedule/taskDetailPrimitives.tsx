import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  DETAILING_STAGE_GATES,
  DETAILING_STAGE_META,
  getActiveStage,
  getEffectiveDueDate,
} from '../../lib/stageDates';
import { filterSearchableTasks } from './searchableTaskPickerHelpers';
export {
  drawerSurface,
  drawerPanel,
  drawerPanelStrong,
  drawerBorder,
  drawerMutedBorder,
  drawerText,
  drawerMutedText,
  drawerControlStyle,
} from './taskDetailTokens';
import {
  drawerPanelStrong,
  drawerBorder,
  drawerText,
  drawerMutedText,
  drawerControlStyle,
} from './taskDetailTokens';

/**
 * Searchable task picker — replaces the plain <select> for adding
 * predecessors / successors. Filters tasks by name or WBS code as
 * the user types. Keyboard-navigable (↑ ↓ Enter Escape).
 */
export function SearchableTaskPicker(props: any) {
  const { tasks, onSelect, placeholder = '+ Search tasks...' } = props;
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapperRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const listRef = useRef<any>(null);

  const filtered = useMemo(
    () => filterSearchableTasks(tasks, query, 50),
    [tasks, query],
  );

  // Reset highlight when results change
  useEffect(() => { setHighlightIdx(0); }, [filtered.length, query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[highlightIdx];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: any) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSelect = useCallback((t: any) => {
    onSelect(t.id);
    setQuery('');
    setIsOpen(false);
    setHighlightIdx(0);
  }, [onSelect]);

  const handleKeyDown = (e: any) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      e.preventDefault();
      return;
    }
    if (!isOpen) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx]);
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  if (tasks.length === 0) return null;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginTop: 8 }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            ...drawerControlStyle,
            paddingLeft: 30,
            fontSize: 11,
          }}
        />
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={drawerMutedText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {isOpen && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', left: 0, right: 0, top: '100%',
            marginTop: 4,
            // Opaque elevated surface — NOT --bg-surface-low, which the
            // SteelBuild-Dark theme defines as a ~2%-white tint (great for a
            // nested background, but a popover over it let the content behind
            // bleed through). --bg-elevated is the floating-surface token;
            // backdrop-blur kills any residual show-through from its 0.85 alpha.
            background: 'var(--bg-elevated)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${drawerBorder}`,
            borderRadius: 8,
            maxHeight: 220,
            overflowY: 'auto',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{
              padding: '12px 14px', textAlign: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: drawerMutedText, letterSpacing: '0.06em',
            }}>
              No matching tasks
            </div>
          ) : (
            filtered.map((t: any, idx: any) => (
              <div
                key={t.id}
                onClick={() => handleSelect(t)}
                onMouseEnter={() => setHighlightIdx(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                  background: idx === highlightIdx ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${drawerMutedBorder}` : 'none',
                  transition: 'background 0.08s',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
                  color: 'var(--accent)', flexShrink: 0,
                  minWidth: 48, textAlign: 'right',
                }}>
                  {t.wbs_code || '—'}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11,
                  color: idx === highlightIdx ? drawerText : drawerMutedText,
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.task_name}
                </span>
                {t.phase && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 600,
                    color: drawerMutedText, letterSpacing: '0.06em',
                    textTransform: 'uppercase', flexShrink: 0,
                  }}>
                    {t.phase}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function FormField(props: any) {
  const { label, type = 'text', value, onChange, readOnly = false, options = [] } = props;
  return (
    <div>
      <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      {type === 'select' ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...drawerControlStyle,
          }}
        >
          <option value="">—</option>
          {options.map((opt: any) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : type === 'date' ? (
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...drawerControlStyle,
          }}
        />
      ) : type === 'slider' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min="0"
            max="100"
            value={value || 0}
            onChange={(e) => onChange(parseInt(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: drawerMutedText, minWidth: 32, textAlign: 'right' }}>{value || 0}%</span>
        </div>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          style={{
            ...drawerControlStyle,
            background: readOnly ? 'rgba(255,255,255,0.035)' : drawerControlStyle.background,
            color: readOnly ? drawerMutedText : drawerText,
          }}
        />
      )}
    </div>
  );
}

// ── Schedule flag toggle (Milestone / Critical Path) ─────────────────
export function ScheduleFlag(props: any) {
  const { label, checked, onChange, hint } = props;
  return (
    <label
      title={hint}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        userSelect: 'none',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: checked ? 'var(--accent)' : drawerMutedText,
      }}
    >
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--accent)' }}
      />
      {label}
    </label>
  );
}

// ── Detailing stage-gate date panel ───────────────────────────────────
//
// Two date pickers per gate (Start + End), one row each for OFA → BFA →
// IFC → Released, plus a read-only derived Bar-Start/Finish line so the
// user can see the Gantt bar anchors that will land on save. Each gate
// row shows its caption ("Back from Approval") so new PMs don't have to
// memorise the acronyms. The currently-active gate (the one the
// schedule "follows" for due-date tracking) gets a left rail in its
// gate colour. A "Clear" affordance per row wipes that single gate
// without disturbing the others.
export function StageGateDates(props: any) {
  const { stageDates, onChange, derivedStart, derivedEnd } = props;
  const setGateField = (gate: any, field: any, iso: any) => {
    const next = { ...stageDates };
    const prev = next[gate] || { start: null, end: null };
    next[gate] = { ...prev, [field]: iso || null };
    // If both halves of a gate are now empty, leave the empty object —
    // the apply helper drops it on save so we don't write `{}`.
    onChange(next);
  };
  const clearGate = (gate: any) => {
    const next = { ...stageDates };
    next[gate] = { start: null, end: null };
    onChange(next);
  };

  // Derived preview: earliest filled start → latest filled end.
  // Mirrors deriveStartEndFromStages on save so the user doesn't have
  // to save-and-look to understand the effect.
  const allDates: string[] = [];
  for (const g of DETAILING_STAGE_GATES) {
    const v = stageDates?.[g];
    if (v?.start) allDates.push(v.start);
    if (v?.end)   allDates.push(v.end);
  }
  const sortedAll = allDates.sort();
  const previewStart = sortedAll[0] || null;
  const previewEnd   = sortedAll[sortedAll.length - 1] || null;

  // Which gate is the schedule currently tracking? Highlight it in the
  // panel so the user can see at a glance which window drives the
  // "due when" date.
  const activeGate = getActiveStage(stageDates);
  const dueDate    = getEffectiveDueDate(stageDates);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: drawerMutedText,
        }}>
          Detailing Stage Dates
        </div>
        {activeGate && (
          <div
            title="The gate the schedule is currently tracking — its end date is the live due date."
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.10em',
              color: (DETAILING_STAGE_META as Record<string, any>)[activeGate]?.color || 'var(--accent)',
            }}
          >
            ACTIVE · {activeGate}
            {dueDate ? ` · DUE ${dueDate}` : ''}
          </div>
        )}
      </div>

      {DETAILING_STAGE_GATES.map((gate) => {
        const meta  = (DETAILING_STAGE_META as Record<string, any>)[gate];
        const v     = stageDates?.[gate] || { start: null, end: null };
        const start = v.start || '';
        const end   = v.end || '';
        const filled = !!(start || end);
        const isActive = gate === activeGate;
        return (
          <div
            key={gate}
            style={{
              display: 'grid',
              gridTemplateColumns: '112px minmax(0, 1fr) minmax(0, 1fr) 28px',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              background: filled
                ? `linear-gradient(90deg, color-mix(in srgb, ${meta.color} 16%, ${drawerPanelStrong}) 0%, ${drawerPanelStrong} 70%)`
                : drawerPanel,
              border: `1px solid ${filled ? `color-mix(in srgb, ${meta.color} 48%, ${drawerMutedBorder})` : drawerMutedBorder}`,
              borderLeft: `3px solid ${isActive ? meta.color : (filled ? meta.color : drawerBorder)}`,
              borderRadius: 8,
              boxShadow: isActive
                ? `0 0 0 1px color-mix(in srgb, ${meta.color} 34%, transparent), 0 14px 28px rgba(0,0,0,0.25)`
                : 'none',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 800,
                color: meta.color,
                letterSpacing: '0.08em',
              }}>
                {meta.label}
              </span>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 9,
                color: drawerMutedText,
                lineHeight: 1.2,
              }}>
                {meta.caption}
              </span>
            </div>
            <DateInput
              ariaLabel={`${gate} start date`}
              placeholder="start"
              value={start}
              onChange={(iso: any) => setGateField(gate, 'start', iso)}
            />
            <DateInput
              ariaLabel={`${gate} end date`}
              placeholder="end"
              value={end}
              onChange={(iso: any) => setGateField(gate, 'end', iso)}
            />
            <button
              type="button"
              onClick={() => clearGate(gate)}
              disabled={!filled}
              aria-label={`Clear ${gate}`}
              style={{
                background: 'transparent',
                border: 'none',
                color: filled ? drawerMutedText : 'rgba(135,154,180,0.3)',
                cursor: filled ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>
        );
      })}

      {/* Derived bar anchors — helps the user understand how the Gantt
          bar will be placed without saving first. Prefers the live
          preview (which reflects unsaved edits) over the persisted
          derivedStart / derivedEnd props, so the hint stays in sync
          with what they just typed. */}
      <div
        style={{
          marginTop: 2,
          padding: '6px 8px',
          background: 'rgba(255,255,255,0.025)',
          border: `1px dashed ${drawerMutedBorder}`,
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: drawerMutedText,
          letterSpacing: '0.04em',
        }}
      >
        <span>Bar start {previewStart || derivedStart || '—'}</span>
        <span>Bar end {previewEnd || derivedEnd || '—'}</span>
      </div>
    </div>
  );
}

// Inline date input used by the per-gate rows. The dates panel now
// sits full-width below the 2-col grid in the drawer, so each input
// has plenty of room — no need to compress font size or padding the
// way the cramped half-column layout once required.
export function DateInput(props: any) {
  const { value, onChange, ariaLabel, placeholder } = props;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
        letterSpacing: '0.10em', textTransform: 'uppercase',
        color: drawerMutedText,
      }}>
        {placeholder}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        style={{
          ...drawerControlStyle,
          minWidth: 0,
        }}
      />
    </label>
  );
}
