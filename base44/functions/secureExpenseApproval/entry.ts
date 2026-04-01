/**
 * Secure Expense approval endpoint.
 * Only admins can change payment_status to "Paid" or "Pending Approval".
 * Users can only submit their own expenses (Unpaid status).
 * Prevents self-approval.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { assertProjectAccess } from './projectAccess.ts';

const ADMIN_ONLY_STATUSES = ['Paid', 'Disputed', 'Voided'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { expense_id, payment_status } = await req.json();

    if (!expense_id || !payment_status) {
      return Response.json({ error: 'expense_id and payment_status are required' }, { status: 400 });
    }

    const expense = await base44.asServiceRole.entities.Expense.get(expense_id);
    if (!expense) {
      return Response.json({ error: 'Expense not found' }, { status: 404 });
    }

    const projectAccess = await assertProjectAccess(base44, user, String(expense.project_id || '').trim());
    if (projectAccess instanceof Response) {
      return projectAccess;
    }

    // Only admins can approve/pay/void expenses
    if (ADMIN_ONLY_STATUSES.includes(payment_status) && user.role !== 'admin') {
      return Response.json(
        { error: 'Forbidden: Only admins can approve, pay, dispute, or void expenses' },
        { status: 403 }
      );
    }

    const updateData = { payment_status };

    if (payment_status === 'Paid') {
      updateData.approved_by = user.email;
      updateData.approved_date = new Date().toISOString().split('T')[0];
      updateData.payment_date = new Date().toISOString().split('T')[0];
    }

    if (payment_status === 'Pending Approval') {
      updateData.approved_by = null;
      updateData.approved_date = null;
    }

    const updated = await base44.entities.Expense.update(expense_id, updateData);
    return Response.json({ success: true, updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
