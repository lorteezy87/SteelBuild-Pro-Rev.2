import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { entities } from "@/api/supabaseClient";
import { formatLocalDate } from "@/utils/dates";

const labelStyle = {
  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
  color: 'var(--text-muted)', letterSpacing: '0.12em',
  textTransform: 'uppercase', marginBottom: 12, display: 'block',
};

const PermBadge = ({ type }) => {
  const config = {
    create: { color: 'var(--status-success)', text: '✓ Create' },
    read: { color: 'var(--accent)', text: '✓ Read' },
    update: { color: 'var(--status-warning)', text: '✓ Update' },
    delete: { color: 'var(--status-error)', text: '✗ Delete' },
  }[type];
  return (
    <span style={{ display: 'inline-block', background: config.color + '22', border: `1px solid ${config.color}44`, color: config.color, borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600, marginRight: 6, marginBottom: 4 }}>
      {config.text}
    </span>
  );
};

const roleDescriptions = {
  admin: { title: 'Administrator', description: 'Full access to all features and settings', permissions: ['create', 'read', 'update', 'delete'] },
  user: { title: 'User', description: 'Access to project features and documents', permissions: ['create', 'read', 'update'] },
};

export default function RolesTab({ user }) {
  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => entities.User.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin = user?.role === 'admin';
  const roleInfo = roleDescriptions[user?.role] || roleDescriptions.user;

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 24px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Roles & Permissions
      </h2>

      {/* Your Role */}
      <div style={{ marginBottom: 32 }}>
        <label style={labelStyle}>Your Role</label>
        <div style={{ background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '16px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{roleInfo.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>{roleInfo.description}</div>
          <div>{roleInfo.permissions.map(p => <PermBadge key={p} type={p} />)}</div>
        </div>
      </div>

      {/* Team Members (admin only) */}
      {isAdmin && (
        <div>
          <label style={labelStyle}>Team Members ({allUsers.length})</label>
          {allUsers.length === 0 ? (
            <div style={{ padding: 16, background: 'var(--warning-muted)', border: '1px solid var(--warning-border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
              No team members yet
            </div>
          ) : allUsers.map(member => (
            <div key={member.id} style={{ background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: 'var(--text-primary)' }}>{member.full_name || 'Unnamed'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{member.email}</div>
                  <span style={{ display: 'inline-block', background: 'var(--info-muted)', border: '1px solid var(--info-border)', color: 'var(--status-info)', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600, textTransform: 'capitalize' }}>
                    {member.role || 'user'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {member.created_date ? formatLocalDate(member.created_date) : '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isAdmin && (
        <div style={{ padding: 16, background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 8, color: '#0891B2', fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>👑 Admin access required</div>
          <div>Contact your administrator to manage team members and roles.</div>
        </div>
      )}
    </div>
  );
}