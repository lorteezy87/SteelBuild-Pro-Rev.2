/**
 * RoleManager.jsx
 * Admin-only panel for assigning user roles.
 * Mount this inside a Settings or Admin page.
 *
 * Roles:
 *   viewer  — read-only access
 *   field   — create + edit own records
 *   pm      — full project access, no project-level deletes
 *   admin   — full access including project delete + role management
 *
 * All authenticated users default to 'pm' if no role is assigned.
 */

import React, { useState, useEffect } from 'react';
import { useAppSecurity }      from '../shared/useAppSecurity';
import { useDestructiveAudit } from '../shared/useDestructiveAudit';
import { toast }               from 'sonner';

const ROLES = ['viewer', 'field', 'pm', 'admin'];

const ROLE_COLORS = {
  admin:  'var(--accent)',
  pm:     'var(--status-success)',
  field:  'var(--status-warning)',
  viewer: 'var(--text-muted)',
};

const ROLE_DESCRIPTIONS = {
  admin:  'Full access + project deletes + role management',
  pm:     'Full project access (default for all users)',
  field:  'Create & edit own records only',
  viewer: 'Read-only — no create, edit, or delete',
};

export default function RoleManager() {
  const {
    isAdmin, listRoles, setUserRole,
    removeUserRole, getUserRole,
  } = useAppSecurity();
  const { getLog } = useDestructiveAudit();

  const [roles,         setRoles]        = useState({});
  const [newEmail,      setNewEmail]     = useState('');
  const [newRole,       setNewRole]      = useState('pm');
  const [showAuditLog,  setShowAuditLog] = useState(false);
  const [auditLog,      setAuditLog]     = useState([]);

  useEffect(() => {
    setRoles(listRoles());
  }, [listRoles]);

  if (!isAdmin) return null;

  const handleAssign = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    const ok = setUserRole(email, newRole);
    if (ok) {
      setRoles(listRoles());
      toast.success(`${email} → ${newRole}`);
      setNewEmail('');
      setNewRole('pm');
    }
  };

  const handleRevoke = (email) => {
    const ok = removeUserRole(email);
    if (ok) {
      setRoles(listRoles());
      toast.success(`${email} role removed (reverts to default PM)`);
    }
  };

  const handleShowAudit = () => {
    setAuditLog(getLog());
    setShowAuditLog(v => !v);
  };

  const roleCount = Object.keys(roles).length;

  // ── Styles ─────────────────────────────────────────────────────
  const S = {
    panel: {
      background: 'var(--bg-surface-low)',
      border: '1px solid var(--border-default)',
      borderRadius: 12, padding: '20px 24px',
    },
    sectionTitle: {
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.10em', color: 'var(--accent)',
      textTransform: 'uppercase', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 8,
    },
    inputRow: {
      display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
    },
    input: {
      flex: 1, minWidth: 180,
      background: 'var(--bg-input)',
      border: '1px solid var(--border-default)',
      borderRadius: 6, padding: '8px 12px',
      fontFamily: 'var(--font-body)', fontSize: 12,
      color: 'var(--text-primary)', outline: 'none',
    },
    select: {
      background: 'var(--bg-input)',
      border: '1px solid var(--border-default)',
      borderRadius: 6, padding: '8px 12px',
      fontFamily: 'var(--font-body)', fontSize: 12,
      color: 'var(--text-primary)', cursor: 'pointer', outline: 'none',
    },
    assignBtn: {
      background: 'var(--accent)', border: 'none',
      borderRadius: 6, padding: '8px 18px',
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.08em', color: '#fff',
      cursor: 'pointer',
    },
    roleRow: {
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--hover-bg)',
      border: '1px solid var(--divider)',
      borderRadius: 6, padding: '8px 12px',
      marginBottom: 6,
    },
    email: {
      fontFamily: 'var(--font-body)', fontSize: 12,
      color: 'var(--text-primary)',
    },
    roleBadge: (r) => ({
      fontFamily: 'var(--font-mono)', fontSize: 9,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: ROLE_COLORS[r] || 'var(--text-primary)',
      marginRight: 12,
    }),
    revokeBtn: {
      background: 'rgba(255,23,68,0.08)',
      border: '1px solid rgba(255,23,68,0.20)',
      borderRadius: 4, padding: '3px 10px',
      fontFamily: 'var(--font-mono)', fontSize: 8,
      color: 'var(--status-error)', cursor: 'pointer',
      letterSpacing: '0.06em',
    },
    empty: {
      fontFamily: 'var(--font-body)', fontSize: 12,
      color: 'var(--text-muted)',
      fontStyle: 'italic', padding: '8px 0',
    },
    divider: {
      borderTop: '1px solid var(--divider)',
      margin: '20px 0',
    },
    auditToggle: {
      background: 'transparent',
      border: '1px solid var(--border-default)',
      borderRadius: 6, padding: '6px 14px',
      fontFamily: 'var(--font-mono)', fontSize: 8,
      color: 'var(--text-muted)',
      cursor: 'pointer', letterSpacing: '0.08em',
    },
    auditEntry: {
      background: 'var(--hover-bg)',
      border: '1px solid var(--hover-bg)',
      borderRadius: 6, padding: '8px 12px',
      marginBottom: 6,
    },
    auditTs: {
      fontFamily: 'var(--font-mono)', fontSize: 8,
      color: 'var(--text-muted)', letterSpacing: '0.06em',
    },
    auditAction: {
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
      color: 'var(--status-error)', letterSpacing: '0.08em',
      textTransform: 'uppercase', marginLeft: 10,
    },
    auditUser: {
      fontFamily: 'var(--font-body)', fontSize: 11,
      color: 'var(--text-secondary)', marginTop: 2,
    },
  };

  return (
    <div style={S.panel}>

      {/* Header */}
      <div style={S.sectionTitle}>
        ⚙ Role Manager
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 400,
          color: 'var(--text-muted)', textTransform: 'none',
          letterSpacing: 0,
        }}>
          — {roleCount} assigned {roleCount === 1 ? 'role' : 'roles'}
        </span>
      </div>

      {/* Role descriptions */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 8, marginBottom: 20,
      }}>
        {ROLES.map(r => (
          <div key={r} style={{
            background: 'var(--hover-bg)',
            border: '1px solid var(--hover-bg)',
            borderRadius: 6, padding: '6px 10px',
          }}>
            <span style={S.roleBadge(r)}>{r}</span>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 10,
              color: 'var(--text-muted)', marginTop: 2,
            }}>
              {ROLE_DESCRIPTIONS[r]}
            </div>
          </div>
        ))}
      </div>

      {/* Assign new role */}
      <div style={S.inputRow}>
        <input
          style={S.input}
          type="email"
          placeholder="user@company.com"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAssign()}
        />
        <select
          style={S.select}
          value={newRole}
          onChange={e => setNewRole(e.target.value)}
        >
          {ROLES.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button style={S.assignBtn} onClick={handleAssign}>
          ASSIGN
        </button>
      </div>

      {/* Current roles list */}
      {roleCount > 0 ? (
        Object.entries(roles)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([email, r]) => (
            <div key={email} style={S.roleRow}>
              <span style={S.email}>{email}</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={S.roleBadge(r)}>{r}</span>
                <button
                  style={S.revokeBtn}
                  onClick={() => handleRevoke(email)}
                >
                  REVOKE
                </button>
              </div>
            </div>
          ))
      ) : (
        <p style={S.empty}>
          No roles assigned. All authenticated users default to PM access.
        </p>
      )}

      {/* Audit log */}
      <div style={S.divider} />
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: showAuditLog ? 12 : 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-muted)', letterSpacing: '0.08em',
        }}>
          DESTRUCTIVE ACTION LOG
        </span>
        <button style={S.auditToggle} onClick={handleShowAudit}>
          {showAuditLog ? 'HIDE' : 'SHOW'} LOG ({auditLog.length || '…'})
        </button>
      </div>

      {showAuditLog && (
        auditLog.length > 0 ? (
          auditLog.slice(0, 50).map((entry, i) => (
            <div key={i} style={S.auditEntry}>
              <div>
                <span style={S.auditTs}>
                  {new Date(entry.ts).toLocaleString()}
                </span>
                <span style={S.auditAction}>{entry.action}</span>
              </div>
              <div style={S.auditUser}>
                {entry.userEmail}
                {entry.recordId ? ` · ID: ${entry.recordId}` : ''}
                {entry.entityTitle ? ` · ${entry.entityTitle}` : ''}
              </div>
            </div>
          ))
        ) : (
          <p style={S.empty}>No destructive actions logged yet.</p>
        )
      )}

    </div>
  );
}