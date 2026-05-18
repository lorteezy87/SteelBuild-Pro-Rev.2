import React from 'react';

export default function DateOrTbdInput({ value, onChange, inputStyle = {}, compact = false, onKeyDown, "data-row": dataRow, "data-col": dataCol }) {
  const hasValue = !!value;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 6, width: '100%' }}>
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        data-row={dataRow}
        data-col={dataCol}
        style={{
          flex: 1,
          minWidth: 0,
          colorScheme: 'dark',
          boxSizing: 'border-box',
          ...inputStyle,
          ...(hasValue ? {} : { opacity: 0.78 }),
        }}
      />
      <button
        type="button"
        onClick={() => onChange('')}
        title={hasValue ? 'Clear date (mark as TBD)' : 'Date is TBD'}
        style={{
          background: hasValue ? (inputStyle.background || 'var(--bg-input)') : 'rgba(200,155,32,0.16)',
          border: hasValue ? '1px solid var(--border-default)' : '1px solid rgba(200,155,32,0.4)',
          borderRadius: compact ? 3 : 4,
          padding: compact ? '1px 5px' : '3px 7px',
          fontFamily: 'var(--font-mono)',
          fontSize: compact ? 8 : 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: hasValue ? 'var(--text-muted)' : 'var(--accent)',
          cursor: hasValue ? 'pointer' : 'default',
          flexShrink: 0,
          lineHeight: 1.2,
        }}
      >
        TBD
      </button>
    </div>
  );
}
