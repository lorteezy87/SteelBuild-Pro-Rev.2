/**
 * Secure Drawing set approval endpoint.
 * Only admins can approve, reject, or supersede drawing sets.
 * Prevents any user from self-approving submitted drawing sets.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { assertProjectAccess } from './projectAccess.ts';

const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'superseded'];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /rate limit/i.test(message) || /\b429\b/.test(message);
};

const updateWithRetry = async (
  base44: ReturnType<typeof createClientFromRequest>,
  drawingId: string,
  updateData: Record<string, unknown>,
) => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await base44.entities.Drawing.update(drawingId, updateData);
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === 5) {
        throw error;
      }
      const backoffMs = [1200, 2200, 3500, 5000, 7000][attempt] ?? 8000;
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Drawing approval update failed');
};

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

    const {
      drawing_id,
      drawing_ids,
      set_approval_status,
      set_approval_notes,
      set_approval_revision,
      release_stage,
    } = await req.json();

    const drawingIds = Array.isArray(drawing_ids)
      ? drawing_ids.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : drawing_id
        ? [String(drawing_id).trim()]
        : [];

    if (!drawingIds.length || !set_approval_status) {
      return Response.json({ error: 'drawing_id or drawing_ids and set_approval_status are required' }, { status: 400 });
    }

    if (!ALLOWED_STATUSES.includes(set_approval_status)) {
      return Response.json({ error: 'Invalid approval status' }, { status: 400 });
    }

    const drawings = await Promise.all(drawingIds.map((id) => base44.asServiceRole.entities.Drawing.get(id)));
    const validDrawings = drawings.filter(Boolean);
    if (!validDrawings.length) {
      return Response.json({ error: 'Drawing not found' }, { status: 404 });
    }

    const projectIds = [...new Set(validDrawings.map((drawing: any) => String(drawing.project_id || '').trim()).filter(Boolean))];
    if (!projectIds.length) {
      return Response.json({ error: 'No project scope found for drawing approval' }, { status: 400 });
    }

    for (const projectId of projectIds) {
      const projectAccess = await assertProjectAccess(base44, user, projectId);
      if (projectAccess instanceof Response) {
        return projectAccess;
      }
    }

    const updated = [];
    for (const drawing of validDrawings) {
      const updateData: Record<string, unknown> = {
        set_approval_status,
        set_approved_by: user.email,
        set_approved_date: new Date().toISOString().split('T')[0],
      };

      if (set_approval_notes !== undefined) updateData.set_approval_notes = set_approval_notes;
      if (set_approval_revision !== undefined) updateData.set_approval_revision = set_approval_revision;
      if (release_stage && set_approval_status === 'approved') {
        updateData.stage = 'Released';
      }

      updated.push(await updateWithRetry(base44, String((drawing as any).id), updateData));
      await sleep(400);
    }

    return Response.json({ success: true, count: updated.length, updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
