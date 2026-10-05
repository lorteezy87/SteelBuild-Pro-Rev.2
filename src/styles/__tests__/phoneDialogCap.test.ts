import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/responsive.css'), 'utf8');

describe('phone dialog size cap', () => {
  it('caps dialog panels but not full-screen backdrops', () => {
    // Many dialogs carry role="dialog" on a `position: fixed; inset: 0`
    // backdrop. Capping that left an uncovered 24px strip at the right and
    // bottom edges on phones (seen on the account-deletion dialog).
    const rule = css.match(/([^{}]*)\{\s*max-width: calc\(100vw - 24px\) !important;/);
    expect(rule, 'the phone dialog cap rule is missing').not.toBeNull();
    const selectors = (rule?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim());
    expect(selectors).toContain('[role="dialog"]:not([style*="inset: 0"])');
    expect(selectors).not.toContain('[role="dialog"]');
  });
});
