import React, { useState } from 'react';
import { auth } from "@/api/supabaseClient";
import { toast } from 'sonner';
import { formatLocalDate } from "@/utils/dates";
import { useAuth } from "@/lib/AuthContext";

const S = {
  input: { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 12, outline: 'none', boxSizing: 'border-box' },
  label: { fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 5 },
  section: { marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid var(--divider)' },
  sectionTitle: { fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 },
};

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
];

export default function UserSettingsTab({ user, onSave }) {
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    job_title: user?.job_title || '',
    company: user?.company || '',
    phone: user?.phone || '',
    timezone: user?.timezone || 'America/Phoenix',
    bio: user?.bio || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Change-password (credential rotation) — H22.
  const { updatePassword } = useAuth();
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const handleChangePassword = async () => {
    if (pw.next.length < 8) { toast.error('Use at least 8 characters.'); return; }
    if (pw.next !== pw.confirm) { toast.error('The passwords do not match.'); return; }
    setPwBusy(true);
    const res = await updatePassword(pw.next);
    setPwBusy(false);
    if (res.success) {
      toast.success('Password updated');
      setPw({ next: '', confirm: '' });
    } else {
      toast.error(res.error || 'Could not update your password');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await auth.updateMe(form);
      onSave(form);
      toast.success('Profile updated');
    } catch (err) {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 24px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Profile
      </h2>

      {/* Identity */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Identity</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={S.label}>Full Name</label>
            <input style={S.input} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label style={S.label}>Email (read-only)</label>
            <input style={{ ...S.input, background: 'var(--bg-surface-low)', color: 'var(--text-muted)', cursor: 'not-allowed' }} value={user?.email || ''} disabled />
          </div>
          <div>
            <label style={S.label}>Job Title</label>
            <input style={S.input} value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="e.g. Project Manager" />
          </div>
          <div>
            <label style={S.label}>Company</label>
            <input style={S.input} value={form.company} onChange={e => set('company', e.target.value)} placeholder="e.g. S&H Steel" />
          </div>
          <div>
            <label style={S.label}>Phone</label>
            <input type="tel" style={S.input} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 555-5555" />
          </div>
          <div>
            <label style={S.label}>Timezone</label>
            <select style={S.input} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Account */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Account</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={S.label}>Role</label>
            <div style={{ padding: '8px 12px', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 8, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {user?.role || 'user'}
            </div>
          </div>
          <div>
            <label style={S.label}>Member Since</label>
            <div style={{ padding: '8px 12px', background: 'var(--bg-surface-low)', borderRadius: 8, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {user?.created_date ? formatLocalDate(user.created_date, 'en-US', { month: 'long', year: 'numeric' }) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Security</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 520 }}>
          <div>
            <label htmlFor="pw-next" style={S.label}>New Password</label>
            <input id="pw-next" type="password" autoComplete="new-password" style={S.input} value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} placeholder="At least 8 characters" />
          </div>
          <div>
            <label htmlFor="pw-confirm" style={S.label}>Confirm New Password</label>
            <input id="pw-confirm" type="password" autoComplete="new-password" style={S.input} value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} placeholder="Re-enter new password" />
          </div>
        </div>
        <button onClick={handleChangePassword} disabled={pwBusy || !pw.next} style={{ marginTop: 14, background: 'var(--bg-surface-low)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: (pwBusy || !pw.next) ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: (pwBusy || !pw.next) ? 0.6 : 1 }}>
          {pwBusy ? 'Updating…' : 'Change Password'}
        </button>
      </div>

      {/* Bio */}
      <div style={{ marginBottom: 24 }}>
        <div style={S.sectionTitle}>Notes / Bio</div>
        <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={form.bio} onChange={e => set('bio', e.target.value)} placeholder="Optional — project areas, specialties, notes for teammates..." />
      </div>

      <button onClick={handleSave} disabled={isSaving} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: isSaving ? 0.6 : 1 }}>
        {isSaving ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  );
}