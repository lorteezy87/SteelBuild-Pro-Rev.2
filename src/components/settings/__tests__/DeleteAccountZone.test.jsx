// @vitest-environment jsdom
/**
 * DeleteAccountZone — self-service account deletion (App Store Guideline
 * 5.1.1(v)). Verifies the type-to-confirm gating, the edge-function payload
 * (mode: 'account'), sign-out on success, and the error path.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  logout: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  user: { current: { id: 'u1', email: 'nick@example.com' } },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: h.invoke } },
}));
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: h.user.current, logout: h.logout }),
}));
vi.mock('sonner', () => ({
  toast: { success: h.toastSuccess, error: h.toastError },
}));

import DeleteAccountZone from '@/components/settings/DeleteAccountZone.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  h.user.current = { id: 'u1', email: 'nick@example.com' };
});

const openDialog = () =>
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

describe('DeleteAccountZone', () => {
  it('renders nothing when there is no signed-in user', () => {
    h.user.current = null;
    const { container } = render(<DeleteAccountZone />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps confirm disabled until the email is typed exactly', () => {
    render(<DeleteAccountZone />);
    openDialog();
    const confirm = screen.getByRole('button', { name: /permanently delete/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'wrong@example.com' } });
    expect(confirm).toBeDisabled();

    // Case-insensitive match on the account email.
    fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'NICK@example.com' } });
    expect(confirm).not.toBeDisabled();
  });

  it('invokes account-delete in account mode and signs the user out on success', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    render(<DeleteAccountZone />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'nick@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }));

    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith('account-delete', { body: { mode: 'account' } }),
    );
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());
    await waitFor(() => expect(h.logout).toHaveBeenCalled(), { timeout: 2500 });
  });

  // A non-2xx response reaches the client as a generic FunctionsHttpError; the
  // function's JSON body is only on error.context (the raw Response).
  const httpError = (body) => ({
    message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => body },
  });
  const confirmDeletion = () => {
    fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'nick@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }));
  };

  it('explains a blocked deletion when the user is the only owner of a shared workspace', async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: httpError({ error: 'SOLE_OWNER_WITH_MEMBERS', workspaces: ['Acme Steel', 'Field Crew'] }),
    });
    render(<DeleteAccountZone />);
    openDialog();
    confirmDeletion();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("You're the only owner of Acme Steel, Field Crew, which have other members.");
    expect(alert).toHaveTextContent(/team page/i);
    expect(h.toastError).toHaveBeenCalledWith(expect.stringContaining('Acme Steel'));
    expect(h.logout).not.toHaveBeenCalled();
    // The dialog stays open so the user can act on it.
    expect(screen.getByRole('button', { name: /permanently delete/i })).not.toBeDisabled();
  });

  it("shows the function's own detail instead of the generic non-2xx message", async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: httpError({ error: 'RECORDS_REFERENCE_ACCOUNT', detail: 'Records you created in a shared workspace still reference your account.' }),
    });
    render(<DeleteAccountZone />);
    openDialog();
    confirmDeletion();

    expect(await screen.findByRole('alert')).toHaveTextContent('Records you created in a shared workspace still reference your account.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/non-2xx/);
    expect(h.logout).not.toHaveBeenCalled();
  });

  it('shows an error and does not sign out when deletion fails', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    render(<DeleteAccountZone />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'nick@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }));

    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.logout).not.toHaveBeenCalled();
  });
});
