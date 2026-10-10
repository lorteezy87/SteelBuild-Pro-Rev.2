// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ updatePassword: vi.fn() }) }));
vi.mock('@/api/supabaseClient', () => ({ auth: { updateMe: vi.fn() } }));
vi.mock('../MfaSection.jsx', () => ({ default: (): null => null }));
vi.mock('../DeleteAccountZone.jsx', () => ({ default: () => <section aria-label="Delete account" /> }));

import UserSettingsTab from '../UserSettingsTab.jsx';

afterEach(cleanup);

describe('Settings → Profile support and legal links', () => {
  it('shows a plain member the privacy policy, terms and support', () => {
    // System (which also has them) is admin-only; Profile is every user's tab,
    // including an App Review demo account that is not an admin.
    render(
      <MemoryRouter>
        <UserSettingsTab user={{ full_name: 'Demo Member' }} workspaceRole="member" />
      </MemoryRouter>,
    );
    const section = screen.getByRole('region', { name: 'Support & legal' });
    const href = (name: string) => within(section).getByRole('link', { name }).getAttribute('href');
    expect(href('Privacy Policy')).toBe('/privacy');
    expect(href('Terms of Service')).toBe('/terms');
    expect(href('Help & support')).toBe('/support');
    expect(href('support@steelbuild-pro.com')).toBe('mailto:support@steelbuild-pro.com');
    // None of them opens a new window, which the native shell would drop.
    expect(within(section).getAllByRole('link').filter((a) => a.getAttribute('target'))).toEqual([]);
  });
});
