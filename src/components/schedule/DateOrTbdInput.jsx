import React from 'react';

export default function DateOrTbdInput({ value, onChange, inputStyle = {}, compact = false, onKeyDown, disabled = false, "data-row": dataRow, "data-col": dataCol }) {
  const hasValue = !!value;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 5 : 6, width: '100%' }}>
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        data-row={dataRow}
        data-col={dataCol}
        style={{
          flex: 1,
          minWidth: 0,
          colorScheme: 'dark',
          boxSizing: 'border-box',
          ...inputStyle,
          ...(hasValue ? {} : { opacity: 0.78 }),
          ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : {}),
        }}
      />
      <button
        type="button"
        onClick={() => onChange('')}
        disabled={disabled}
        title={disabled ? 'Derived from children — not editable' : hasValue ? 'Clear date (mark as TBD)' : 'Date is TBD'}
        style={{
          background: hasValue ? (inputStyle.background || 'var(--bg-input)') : 'var(--accent-muted)',
          border: hasValue ? '1px solid var(--border-default)' : '1px solid var(--accent-border)',
          borderRadius: 2,
          padding: compact ? '2px 6px' : '3px 7px',
          fontFamily: 'var(--font-mono)',
          fontSize: compact ? 9 : 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: hasValue ? 'var(--text-muted)' : 'var(--accent)',
          cursor: disabled ? 'not-allowed' : hasValue ? 'pointer' : 'default',
          flexShrink: 0,
          lineHeight: 1.2,
          ...(disabled ? { opacity: 0.55 } : {}),
        }}
      >
        TBD
      </button>
    </div>
  );
}
