/** Pure keyboard shortcut catalog for ShortcutsTab. */

export const KEYBOARD_SHORTCUTS = [
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
] as const;
