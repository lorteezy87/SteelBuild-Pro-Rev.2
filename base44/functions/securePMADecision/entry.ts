/**
 * Secure PMA Decision write endpoint.
 * Forces decided_by to the authenticated user's email — cannot be spoofed.
 * Only admins can supersede or reverse decisions.
 * Prevents forged decision attribution.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, decision_id, ...decisionData } = body;

    if (action === 'create') {
      // Force decided_by to authenticated user — cannot be spoofed
      const safeDecision = {
        ...decisionData,
        decided_by: user.email,
        decided_at: new Date().toISOString().split('T')[0],
        status: 'Active',
      };
      // Remove any attempt to set status to Superseded/Reversed on create
      delete safeDecision.superseded_by;

      const created = await base44.entities.PMADecision.create(safeDecision);
      return Response.json({ success: true, created });
    }

    if (action === 'supersede' || action === 'reverse') {
      if (user.role !== 'admin') {
        return Response.json(
          { error: 'Forbidden: Only admins can supersede or reverse decisions' },
          { status: 403 }
        );
      }

      if (!decision_id) {
        return Response.json({ error: 'decision_id is required' }, { status: 400 });
      }

      const newStatus = action === 'supersede' ? 'Superseded' : 'Reversed';
      const updated = await base44.entities.PMADecision.update(decision_id, {
        status: newStatus,
        superseded_by: decisionData.superseded_by || null,
      });

      return Response.json({ success: true, updated });
    }

    return Response.json({ error: 'Invalid action. Use: create, supersede, reverse' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});