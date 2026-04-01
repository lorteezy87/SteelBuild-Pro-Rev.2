/**
 * Secure number sequence manager.
 * ProjectNumberSequence should NEVER be directly writable by end users.
 * This function is the only safe way to get/increment sequence numbers.
 *
 * Any authenticated user can get the next number for their project records.
 * Only admins can reset or force-set sequence values.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VALID_TYPES = ['RFI', 'CO', 'DRAWING', 'SUBMITTAL', 'WORK_PACKAGE', 'DAILY_LOG',
  'DELIVERY', 'MEETING', 'ACTION_ITEM', 'PRODUCTION_NOTE', 'LOOK_AHEAD', 'CONTACT', 'EXPENSE', 'SOV'];

const PREFIXES = {
  RFI: { prefix: 'RFI', pad: 3 },
  CO: { prefix: 'CO', pad: 3 },
  DRAWING: { prefix: 'DWG', pad: 3 },
  SUBMITTAL: { prefix: 'SUB', pad: 3 },
  WORK_PACKAGE: { prefix: 'WP', pad: 3 },
  DAILY_LOG: { prefix: 'LOG', pad: 4 },
  DELIVERY: { prefix: 'DEL', pad: 3 },
  MEETING: { prefix: 'MTG', pad: 3 },
  ACTION_ITEM: { prefix: 'AI', pad: 3 },
  PRODUCTION_NOTE: { prefix: 'PN', pad: 3 },
  LOOK_AHEAD: { prefix: 'LA', pad: 3 },
  CONTACT: { prefix: 'CON', pad: 3 },
  EXPENSE: { prefix: 'EXP', pad: 3 },
  SOV: { prefix: 'SOV', pad: 3 },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, project_id, record_type, force_value } = body;

    if (!project_id || !record_type) {
      return Response.json({ error: 'project_id and record_type are required' }, { status: 400 });
    }

    if (!VALID_TYPES.includes(record_type)) {
      return Response.json({ error: `Invalid record_type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const config = PREFIXES[record_type];

    // GET NEXT — increment and return next number
    if (action === 'next') {
      const existing = await base44.asServiceRole.entities.ProjectNumberSequence.filter({
        project_id,
        record_type,
      });

      if (existing.length === 0) {
        await base44.asServiceRole.entities.ProjectNumberSequence.create({
          project_id,
          record_type,
          last_sequence: 1,
          prefix: config.prefix,
          pad_length: config.pad,
        });
        return Response.json({ number: `${config.prefix}-${String(1).padStart(config.pad, '0')}`, sequence: 1 });
      }

      const seq = existing[0];
      const nextNum = (seq.last_sequence || 0) + 1;
      await base44.asServiceRole.entities.ProjectNumberSequence.update(seq.id, { last_sequence: nextNum });

      return Response.json({
        number: `${seq.prefix}-${String(nextNum).padStart(seq.pad_length, '0')}`,
        sequence: nextNum,
      });
    }

    // PREVIEW — return what the next number would be without incrementing
    if (action === 'preview') {
      const existing = await base44.asServiceRole.entities.ProjectNumberSequence.filter({
        project_id,
        record_type,
      });

      if (existing.length === 0) {
        return Response.json({ number: `${config.prefix}-${String(1).padStart(config.pad, '0')}`, sequence: 1 });
      }

      const next = (existing[0].last_sequence || 0) + 1;
      return Response.json({
        number: `${existing[0].prefix}-${String(next).padStart(existing[0].pad_length, '0')}`,
        sequence: next,
      });
    }

    // FORCE SET — admin only, used for data migrations
    if (action === 'force_set') {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Only admins can force-set sequence values' }, { status: 403 });
      }

      if (typeof force_value !== 'number' || force_value < 0) {
        return Response.json({ error: 'force_value must be a non-negative number' }, { status: 400 });
      }

      const existing = await base44.asServiceRole.entities.ProjectNumberSequence.filter({
        project_id,
        record_type,
      });

      if (existing.length === 0) {
        await base44.asServiceRole.entities.ProjectNumberSequence.create({
          project_id,
          record_type,
          last_sequence: force_value,
          prefix: config.prefix,
          pad_length: config.pad,
        });
      } else {
        await base44.asServiceRole.entities.ProjectNumberSequence.update(existing[0].id, {
          last_sequence: force_value,
        });
      }

      return Response.json({ success: true, sequence: force_value });
    }

    return Response.json({ error: 'Invalid action. Use: next, preview, force_set' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
