import React, { useState, useEffect } from 'react';
import { ROLES, getSelectedRole, setSelectedRole } from '../utils/roleDefinitions';

export default function RoleSelector() {
  const [selectedRole, setRole] = useState('pm');

  useEffect(() => {
    setRole(getSelectedRole());
  }, []);

  const handleRoleChange = (roleId) => {
    setRole(roleId);
    setSelectedRole(roleId);
  };

  return (
    <div style={{
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      padding: '6px 0',
      marginBottom: 8,
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      {ROLES.map((role) => (
        <button
          key={role.id}
          onClick={() => handleRoleChange(role.id)}
          title={role.full}
          style={{
            background: selectedRole === role.id
              ? 'var(--accent)'
              : 'transparent',
            color: selectedRole === role.id
              ? '#fff'
              : 'var(--text-muted)',
            border: selectedRole === role.id
              ? 'none'
              : '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14,
            padding: '4px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: '0.10em',
            cursor: 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}
          onMouseEnter={(e) => {
            if (selectedRole !== role.id) {
              e.currentTarget.style.borderColor = 'var(--accent-border)';
              e.currentTarget.style.color = 'var(--accent)';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedRole !== role.id) {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }
          }}
        >
          {role.label}
        </button>
      ))}
    </div>
  );
}