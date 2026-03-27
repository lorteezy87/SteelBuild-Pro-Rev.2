/**
 * Secure Drawing set approval endpoint.
 * Only admins can approve, reject, or supersede drawing sets.
 * Prevents any user from self-approving submitted drawing sets.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'superseded'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json(
        { error: 'Forbidden: Only admins can approve or reject drawing sets' },
        { status: 403 }
      );
    }

    const { drawing_id, set_approval_status, set_approval_notes, set_approval_revision } = await req.json();

    if (!drawing_id || !set_approval_status) {
      return Response.json({ error: 'drawing_id and set_approval_status are required' }, { status: 400 });
    }

    if (!ALLOWED_STATUSES.includes(set_approval_status)) {
      return Response.json({ error: 'Invalid approval status' }, { status: 400 });
    }

    const updateData = {
      set_approval_status,
      set_approved_by: user.email,
      set_approved_date: new Date().toISOString().split('T')[0],
    };

    if (set_approval_notes !== undefined) updateData.set_approval_notes = set_approval_notes;
    if (set_approval_revision !== undefined) updateData.set_approval_revision = set_approval_revision;

    const updated = await base44.entities.Drawing.update(drawing_id, updateData);
    return Response.json({ success: true, updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});