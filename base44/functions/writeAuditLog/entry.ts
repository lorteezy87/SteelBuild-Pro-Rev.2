/**
 * Secure append-only audit log writer.
 * - Any authenticated user can create (append) an audit entry.
 * - No user can update or delete audit log entries (ever).
 * - Only admins can read the full audit log.
 * - legal_hold_flag can only be set/unset by admins.
 *
 * This is the ONLY safe way to write PMAuditLog entries.
 * Direct entity CRUD on PMAuditLog should not be used from the frontend.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // GET — read audit logs (admin only)
    if (req.method === 'GET') {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Only admins can read audit logs' }, { status: 403 });
      }
      const logs = await base44.asServiceRole.entities.PMAuditLog.list('-timestamp', 200);
      return Response.json({ logs });
    }

    // POST — append a new audit entry (any authenticated user, but fields are enforced)
    if (req.method === 'POST') {
      const body = await req.json();

      if (!body.project_id || !body.session_id || !body.action_type) {
        return Response.json({ error: 'project_id, session_id, and action_type are required' }, { status: 400 });
      }

      // Enforce server-side: user_id, user_role, timestamp — cannot be spoofed
      const safeEntry = {
        project_id: body.project_id,
        project_name: body.project_name || null,
        session_id: body.session_id,
        timestamp: new Date().toISOString(),
        action_type: body.action_type,
        triggered_by: body.triggered_by || null,
        input_summary: body.input_summary || null,
        output_summary: body.output_summary || null,
        source_artifacts: body.source_artifacts || null,
        data_snapshot: body.data_snapshot || null,
        policy_checks: body.policy_checks || null,
        reproducibility_hash: body.reproducibility_hash || null,
        // Legal hold can ONLY be set by admins
        legal_hold_flag: (user.role === 'admin' && body.legal_hold_flag === true) ? true : false,
        legal_hold_reason: (user.role === 'admin' && body.legal_hold_flag === true) ? (body.legal_hold_reason || null) : null,
        legal_hold_flagged_by: (user.role === 'admin' && body.legal_hold_flag === true) ? user.email : null,
        legal_hold_flagged_at: (user.role === 'admin' && body.legal_hold_flag === true) ? new Date().toISOString() : null,
        // Force authenticated user identity
        user_id: user.email,
        user_role: user.role || 'user',
        app_version: body.app_version || null,
      };

      // Use service role so the write succeeds regardless of entity-level RLS
      const created = await base44.asServiceRole.entities.PMAuditLog.create(safeEntry);
      return Response.json({ success: true, id: created.id });
    }

    // PATCH — admin-only legal hold update (only legal_hold fields)
    if (req.method === 'PATCH') {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Only admins can update audit log legal hold status' }, { status: 403 });
      }

      const body = await req.json();
      const { log_id, legal_hold_flag, legal_hold_reason } = body;

      if (!log_id) {
        return Response.json({ error: 'log_id is required' }, { status: 400 });
      }

      // Strictly only allow legal_hold fields to be updated — no other fields
      const updateData = {
        legal_hold_flag: !!legal_hold_flag,
        legal_hold_reason: legal_hold_reason || null,
        legal_hold_flagged_by: user.email,
        legal_hold_flagged_at: new Date().toISOString(),
      };

      const updated = await base44.asServiceRole.entities.PMAuditLog.update(log_id, updateData);
      return Response.json({ success: true, updated });
    }

    // DELETE — forbidden for everyone
    if (req.method === 'DELETE') {
      return Response.json(
        { error: 'Forbidden: Audit log entries cannot be deleted' },
        { status: 403 }
      );
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});