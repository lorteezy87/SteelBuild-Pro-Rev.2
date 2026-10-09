import { roleAtLeast } from '@/hooks/useProjectRole';
import type { PayApplication, PayAppStatus } from '@/lib/payapp/types';

type StatusContext = { projectId: string | null | undefined; role: string | null; roleLoading: boolean };

/** Mirrors pay_application_transition_allowed; the RPC remains authoritative. */
export function canMovePayApplication(
  application: PayApplication | null,
  context: StatusContext,
  nextStatus: PayAppStatus,
): boolean {
  if (!application || application.is_deleted || !application.id
    || application.project_id !== context.projectId || context.roleLoading
    || !roleAtLeast(context.role, 'pm')) return false;
  const current = application.status;
  if (current === nextStatus) return false;
  if (nextStatus === 'void') return ['draft', 'submitted', 'approved'].includes(current);
  if (current === 'draft') return nextStatus === 'submitted';
  if (current === 'submitted') return nextStatus === 'approved' || nextStatus === 'draft';
  return current === 'approved' && nextStatus === 'paid';
}

export function buildVoidPayApplicationPatch(reason: string): Pick<PayApplication, 'status' | 'void_reason'> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error('Enter a reason for voiding this application.');
  return { status: 'void', void_reason: trimmed };
}
