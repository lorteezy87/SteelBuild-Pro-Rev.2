// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import Support from '../Support';

afterEach(cleanup);

function renderSupport() {
  return render(
    <MemoryRouter initialEntries={['/support']}>
      <Support />
    </MemoryRouter>,
  );
}

describe('Support page (App Store Support URL)', () => {
  it('gives a way to reach support', () => {
    renderSupport();
    expect(screen.getByRole('heading', { level: 1, name: 'Support' })).toBeInTheDocument();
    const contact = screen.getByRole('heading', { name: 'Contact us' }).closest('section') as HTMLElement;
    expect(within(contact).getByRole('link', { name: 'support@steelbuild-pro.com' }))
      .toHaveAttribute('href', 'mailto:support@steelbuild-pro.com');
  });

  it('explains in-app account deletion with the labels the app uses', () => {
    renderSupport();
    const section = screen.getByRole('heading', { name: 'Deleting your account' }).closest('section') as HTMLElement;
    expect(section).toHaveTextContent('Settings → Profile');
    expect(section).toHaveTextContent('Delete my account…');
    expect(section).toHaveTextContent('Team page');
  });

  it('links only to the legal pages, home and email: nothing to buy or sign up for', () => {
    // The iOS listing points here, and the app is sign-in only (guideline 3.1.1).
    renderSupport();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    const allowed = new Set([
      '/', '/privacy', '/terms', '/security', '/subprocessors',
      'mailto:support@steelbuild-pro.com', 'mailto:security@steelbuild-pro.com',
    ]);
    expect(hrefs.filter((href) => !allowed.has(href ?? ''))).toEqual([]);
    expect(document.body.textContent).not.toMatch(/pricing|upgrade|subscribe|checkout|free trial/i);
  });

  it('restores the document background when it unmounts', () => {
    document.documentElement.style.background = 'white';
    const { unmount } = renderSupport();
    unmount();
    expect(document.documentElement.style.background).toBe('white');
  });

  it('takes every color from design tokens, not hex literals', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/pages/Support.tsx'), 'utf8');
    expect(source.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });
});
