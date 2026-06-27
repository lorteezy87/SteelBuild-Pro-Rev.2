/**
 * ShortcutsTab — keyboard reference card.
 *
 * Read-only documentation pane that lists every meaningful keyboard
 * shortcut in the app, grouped by surface. Customisation of bindings
 * is intentionally not in scope here — that would require a global
 * dispatcher rewrite. The point of this page is to make the existing
 * keyboard support discoverable so users actually use it.
 */

import React from 'react';

const headerStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: '0 0 6px 0',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const groupHeaderStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  margin: '24px 0 10px 0',
};

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '180px 1fr',
  gap: 12,
  alignItems: 'center',
  padding: '8px 12px',
  borderBottom: '1px solid var(--divider)',
};

const kbdStyle = {
  display: 'inline-block',
  padding: '2px 7px',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  background: 'var(--bg-surface-low)',
  border: '1px solid var(--border-default)',
  borderBottom: '2px solid var(--border-default)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  letterSpacing: '0.04em',
  marginRight: 4,
};

const SHORTCUTS = [
  {
    group: 'Global',
    items: [
      { keys: ['Ctrl/⌘', 'K'], desc: 'Open command palette / quick search' },
      { keys: ['?'],            desc: 'Show keyboard hints overlay' },
      { keys: ['Esc'],          desc: 'Close drawer / dialog / dismiss popup' },
      { keys: ['/'],            desc: 'Focus the page search input' },
    ],
  },
  {
    group: 'Calculator',
    items: [
      { keys: ['0–9', '.'],            desc: 'Type a digit or decimal point' },
      { keys: ['+', '-', '*', '/'],    desc: 'Operators (also × x for multiply)' },
      { keys: ['Enter'],               desc: 'Evaluate (also =)' },
      { keys: ['⌫'],                   desc: 'Backspace' },
      { keys: ['Esc / c'],             desc: 'AC (clear all)' },
      { keys: ['Del'],                 desc: 'CE (clear current entry)' },
      { keys: ['_', 'n'],              desc: 'Toggle ± sign' },
      { keys: ['%'],                   desc: 'Percent of accumulator' },
      { keys: ['s'],                   desc: 'Square root (√x)' },
      { keys: ['q'],                   desc: 'Square (x²)' },
      { keys: ['r'],                   desc: 'Reciprocal (1/x)' },
      { keys: ['⌥+P / M / R / C'],     desc: 'M+ · M− · MR · MC' },
    ],
  },
  {
    group: 'Ft/In Calculator',
    items: [
      { keys: ['+'],                   desc: 'Commit & queue ADD' },
      { keys: ['Shift', '-'],          desc: 'Force SUB (plain – is a length separator)' },
      { keys: ['Shift', '/'],          desc: 'Force DIV (plain / is part of a fraction)' },
      { keys: ['Enter / ='],           desc: 'Equals' },
      { keys: ['Esc'],                 desc: 'Clear current entry' },
      { keys: ['⌥+P / M / R / C'],     desc: 'Memory ops' },
    ],
  },
  {
    group: 'Schedule / Gantt',
    items: [
      { keys: ['+'],                   desc: 'Add task' },
      { keys: ['Tab'],                 desc: 'Indent task (sub-task of previous)' },
      { keys: ['Shift', 'Tab'],        desc: 'Outdent task' },
      { keys: ['↑ ↓'],                 desc: 'Move row selection' },
      { keys: ['Enter'],               desc: 'Open task drawer' },
      { keys: ['Del'],                 desc: 'Delete selected task' },
    ],
  },
  {
    group: 'Lists / Tables',
    items: [
      { keys: ['↑ ↓'],                 desc: 'Move selection' },
      { keys: ['Enter'],               desc: 'Open the selected row' },
      { keys: ['Space'],               desc: 'Toggle row selection (when multi-select)' },
      { keys: ['Ctrl/⌘', 'A'],         desc: 'Select all rows' },
      { keys: ['Ctrl/⌘', 'F'],         desc: 'Focus search' },
    ],
  },
  {
    group: 'Drawings Viewer',
    items: [
      { keys: ['← →'],                 desc: 'Previous / next sheet' },
      { keys: ['+ / -'],               desc: 'Zoom in / out' },
      { keys: ['0'],                   desc: 'Fit to page' },
      { keys: ['m'],                   desc: 'Toggle markup mode' },
      { keys: ['z'],                   desc: 'Toggle zone editor' },
    ],
  },
];

export default function ShortcutsTab() {
  return (
    <div>
      <h2 style={headerStyle}>Keyboard</h2>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
        Reference for every active keyboard shortcut, grouped by surface. Press <Kbd>?</Kbd> on any page to bring up the
        same map as a popover overlay.
      </p>

      {SHORTCUTS.map((group) => (
        <div key={group.group}>
          <div style={groupHeaderStyle}>{group.group}</div>
          <div style={{
            background: 'var(--bg-surface-low)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {group.items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  ...rowStyle,
                  borderBottom: idx < group.items.length - 1 ? '1px solid var(--divider)' : 'none',
                }}
              >
                <div>
                  {item.keys.map((k, ki) => (
                    <React.Fragment key={ki}>
                      <Kbd>{k}</Kbd>
                      {ki < item.keys.length - 1 && (
                        <span style={{ ...kbdStyle, background: 'transparent', border: 'none', borderBottom: 'none', padding: 0, color: 'var(--text-muted)' }}>
                          +
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Kbd({ children }) {
  return <kbd style={kbdStyle}>{children}</kbd>;
}
