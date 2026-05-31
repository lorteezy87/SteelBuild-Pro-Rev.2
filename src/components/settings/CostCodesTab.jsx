import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities } from "@/api/supabaseClient";
import { toast } from 'sonner';
import { CATEGORY_COLORS } from '@/components/shared/costCodes';

const labelStyle = {
  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
  color: 'var(--text-muted)', letterSpacing: '0.12em',
  textTransform: 'uppercase', marginBottom: 12, display: 'block',
};

const sectionStyle = {
  background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)',
  borderRadius: 8, padding: '18px 16px', marginBottom: 20,
};

export default function CostCodesTab() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editBudget, setEditBudget] = useState('');

  const { data: defaults = [], isLoading } = useQuery({
    queryKey: ['default-cost-codes'],
    queryFn: () => entities.DefaultCostCode.list('sort_order'),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }) => {
      await entities.DefaultCostCode.update(id, { is_active });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['default-cost-codes'] });
    },
    onError: () => toast.error('Failed to update'),
  });

  const budgetMut = useMutation({
    mutationFn: async ({ id, default_budget_amount }) => {
      await entities.DefaultCostCode.update(id, { default_budget_amount });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['default-cost-codes'] });
      setEditingId(null);
      toast.success('Default budget updated');
    },
    onError: () => toast.error('Failed to save budget'),
  });

  const handleBudgetSave = (id) => {
    const val = parseFloat(editBudget) || 0;
    budgetMut.mutate({ id, default_budget_amount: val });
  };

  const sorted = [...defaults].sort((a, b) =>
    (a.cost_code_number || '').localeCompare(b.cost_code_number || '', undefined, { numeric: true })
  );

  const activeCount = defaults.filter(d => d.is_active).length;

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading default cost codes...
      </div>
    );
  }

  return (
    <div>
      <h2 style={{
        fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700,
        color: 'var(--text-primary)', margin: '0 0 8px 0',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Default Cost Codes
      </h2>
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 13,
        color: 'var(--text-muted)', margin: '0 0 24px 0', lineHeight: 1.5,
      }}>
        Active codes are automatically inserted into Budget Control when a new project is created.
        Set default budget amounts to pre-fill project budgets.
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 20, padding: '10px 14px',
        background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
        borderRadius: 8,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700,
          color: 'var(--accent)',
        }}>
          {activeCount}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          of {defaults.length} codes active
        </span>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(code => {
            const isEditing = editingId === code.id;
            const catColor = CATEGORY_COLORS[code.category] || 'var(--text-muted)';
            return (
              <div
                key={code.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 140px 80px',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: code.is_active ? 'rgba(255,255,255,0.02)' : 'transparent',
                  opacity: code.is_active ? 1 : 0.5,
                  transition: 'all 0.15s',
                }}
              >
                {/* Toggle */}
                <button
                  onClick={() => toggleMut.mutate({ id: code.id, is_active: !code.is_active })}
                  style={{
                    width: 32, height: 18, borderRadius: 9,
                    background: code.is_active ? 'var(--accent)' : 'var(--bg-surface)',
                    border: `1px solid ${code.is_active ? 'var(--accent)' : 'var(--border-default)'}`,
                    cursor: 'pointer', position: 'relative',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2,
                    left: code.is_active ? 15 : 2,
                    width: 12, height: 12, borderRadius: '50%',
                    background: 'white',
                    transition: 'left 0.15s',
                  }} />
                </button>

                {/* Code + description */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    fontWeight: 700, color: 'var(--accent)',
                    minWidth: 20,
                  }}>
                    {code.cost_code_number}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 13,
                    color: 'var(--text-primary)',
                  }}>
                    {code.description}
                  </span>
                </div>

                {/* Budget amount */}
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      value={editBudget}
                      onChange={(e) => setEditBudget(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleBudgetSave(code.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      style={{
                        width: 90, padding: '4px 8px',
                        background: 'var(--bg-input, var(--bg-base))',
                        border: '1px solid var(--accent)',
                        borderRadius: 4, color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                      }}
                    />
                    <button
                      onClick={() => handleBudgetSave(code.id)}
                      style={{
                        padding: '3px 6px', background: 'var(--accent)',
                        border: 'none', borderRadius: 4,
                        color: 'white', fontSize: 9, fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(code.id);
                      setEditBudget(String(code.default_budget_amount || 0));
                    }}
                    style={{
                      background: 'transparent', border: 'none',
                      cursor: 'pointer', textAlign: 'right',
                      padding: '4px 8px', borderRadius: 4,
                    }}
                    title="Click to edit default budget"
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      color: code.default_budget_amount > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}>
                      {code.default_budget_amount > 0
                        ? `$${Number(code.default_budget_amount).toLocaleString()}`
                        : '$0'
                      }
                    </span>
                  </button>
                )}

                {/* Category badge */}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 8,
                  color: catColor, textTransform: 'uppercase',
                  letterSpacing: '0.08em', textAlign: 'right',
                }}>
                  {code.category}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        marginTop: 24, padding: '12px 14px',
        background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)',
        borderRadius: 8,
      }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-muted)', margin: 0, lineHeight: 1.6,
        }}>
          NOTE: Changes only affect new projects. Existing project budgets are not modified.
          To add cost codes to an existing project, use Budget Control within that project.
        </p>
      </div>
    </div>
  );
}
