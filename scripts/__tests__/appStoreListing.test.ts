import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// docs/app-store/LISTING.md is pasted into App Store Connect as-is, so its
// fields must fit Connect's limits and stay clear of what App Review rejects.
const listing = fs.readFileSync(path.join(process.cwd(), 'docs/app-store/LISTING.md'), 'utf8');

function block(name: string): string {
  const match = listing.match(new RegExp(`<!-- listing:${name} -->\\n([\\s\\S]*?)\\n<!-- /listing:${name} -->`));
  expect(match, `listing:${name} block is missing`).not.toBeNull();
  return (match?.[1] ?? '').trim();
}

function tableValue(field: string): string {
  const match = listing.match(new RegExp(`^\\| ${field} \\(\\d+\\) \\| (.+?) \\|$`, 'm'));
  expect(match, `${field} row is missing`).not.toBeNull();
  return (match?.[1] ?? '').trim();
}

describe('App Store listing copy', () => {
  it('fits App Store Connect limits', () => {
    expect(tableValue('Name').length).toBeLessThanOrEqual(30);
    expect(tableValue('Subtitle').length).toBeLessThanOrEqual(30);
    expect(block('promotional').length).toBeLessThanOrEqual(170);
    expect(block('keywords').length).toBeLessThanOrEqual(100);
    expect(block('description').length).toBeLessThanOrEqual(4000);
  });

  it('uses comma-separated keywords without repeating the app name', () => {
    const keywords = block('keywords').split(',');
    expect(keywords.every((k) => k.trim() === k && k.length > 0)).toBe(true);
    expect(keywords.map((k) => k.toLowerCase())).not.toContain('steelbuild');
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  it('says nothing about buying, pricing or signing up elsewhere (guideline 3.1.1)', () => {
    const copy = [tableValue('Subtitle'), block('promotional'), block('description')].join('\n');
    expect(copy).not.toMatch(/\$|price|pricing|subscri|free trial|upgrade|sign up|signup|buy|purchase|billing/i);
  });

  it('points the listing at the public support and privacy pages', () => {
    expect(listing).toContain('| Support URL | https://steelbuild-pro.com/support |');
    expect(listing).toContain('| Privacy Policy URL | https://steelbuild-pro.com/privacy |');
  });
});
