/**
 * Secure Change Order status transition endpoint.
 * Only admins can set status to "Approved" or "Rejected".
 * Any authenticated user can set status to "Draft", "Submitted", or "Under Review".
 * Prevents self-approval and field spoofing.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { assertProjectAccess } from './projectAccess.ts';

const ADMIN_ONLY_STATUSES = ['Approved', 'Rejected', 'Void'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { co_id, status, notes } = await req.json();

    if (!co_id || !status) {
      return Response.json({ error: 'co_id and status are required' }, { status: 400 });
    }

    const changeOrder = await base44.asServiceRole.entities.ChangeOrder.get(co_id);
    if (!changeOrder) {
      return Response.json({ error: 'Change order not found' }, { status: 404 });
    }

    const projectAccess = await assertProjectAccess(base44, user, String(changeOrder.project_id || '').trim());
    if (projectAccess instanceof Response) {
      return projectAccess;
    }

    // Only admins can approve, reject, or void
    if (ADMIN_ONLY_STATUSES.includes(status) && user.role !== 'admin') {
      return Response.json(
        { error: 'Forbidden: Only admins can approve, reject, or void change orders' },
        { status: 403 }
      );
    }

    const updateData = { status };

    // If approving, stamp approved_by and approved_date
    if (status === 'Approved') {
      updateData.approved_by = user.email;
      updateData.approved_date = new Date().toISOString().split('T')[0];
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const updated = await base44.entities.ChangeOrder.update(co_id, updateData);
    return Response.json({ success: true, updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
