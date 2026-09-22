// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NativeSignIn from '../NativeSignIn';

describe('native sign-in', () => {
  it('submits credentials without signup or purchase links', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    render(<NativeSignIn onLogin={login} onForgotPassword={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: ' person@company.com ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'person@company.com', password: 'secret123' }));
    expect(screen.queryByText(/create.*account|subscribe|upgrade|pricing/i)).toBeNull();
  });
  it('reports reset failure and permits a successful retry without exposing account existence', async () => {
    const reset = vi.fn().mockResolvedValueOnce({ success: false, error: 'Unable to connect' }).mockResolvedValueOnce({ success: true });
    render(<NativeSignIn onLogin={vi.fn()} onForgotPassword={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'person@company.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByLabelText('Password')).toBeVisible();
  });
  it('handles a rejected sign-in and enables retry', async () => {
    render(<NativeSignIn onLogin={vi.fn().mockRejectedValue(new Error('offline'))} onForgotPassword={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'person@company.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign in');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});
