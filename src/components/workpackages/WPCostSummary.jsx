import React from 'react';
import { formatCurrency, roundCurrency } from '../shared/formatters';
import { Button } from '@/components/ui/button';

export default function WPCostSummary({ wp, expenses = [], onViewExpenses }) {
  if (!wp?.id) return null;

  const wpExpenses = expenses.filter(e => e.work_package_id === wp.id && e.payment_status !== 'Voided');
  const committed = roundCurrency(wpExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
  const paid = roundCurrency(wpExpenses.filter(e => e.payment_status === 'Paid').reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
  
  const budget = wp.shop_hours_budget ? Number(wp.shop_hours_budget) * 60 : 0; // Rough estimate

  return (
    <div
      style={{
        background: 'var(--bg-surface-low)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '16px 20px',
        marginTop: 12,
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 12 }}>
        💰 Cost Summary
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Committed
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--status-warning)' }}>
            {formatCurrency(committed)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
            {wpExpenses.length} expenses
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Paid
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--status-success)' }}>
            {formatCurrency(paid)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
            {wpExpenses.filter(e => e.payment_status === 'Paid').length} invoices
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Remaining
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: budget > committed ? 'var(--status-success)' : 'var(--status-error)' }}>
            {formatCurrency(Math.max(0, budget - committed))}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
            of {formatCurrency(budget)}
          </div>
        </div>
      </div>
      {committed > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={onViewExpenses}
          style={{
            width: '100%',
            background: 'var(--accent-muted)',
            border: '1px solid var(--accent-border)',
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          VIEW ALL EXPENSES →
        </Button>
      )}
    </div>
  );
}