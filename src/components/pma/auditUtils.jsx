import { base44 } from '@/api/base44Client';

export const PMA_AUDIT_ENABLED = false;

// ─── Session ID Generation ─────────────────────────────────────
export const generateSessionId = () => {
  return (
    'SES-' +
    Date.now().toString(36).toUpperCase() +
    '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
};

// ─── Reproducibility Hash ──────────────────────────────────────
export const generateHash = (data) => {
  const str = JSON.stringify({
    projectId: data._projectId,
    snapshotTime: data._snapshotTime,
    recordCount: data._lineage?.length || 0,
    rfiCount: data.rfis?.length || 0,
    coCount: data.changeOrders?.length || 0,
    deliveryCount: data.deliveries?.length || 0,
    budgetUsedPct: data.budget?.usedPercent || 0,
  });
  // Base64 encode as fingerprint
  return btoa(str).slice(0, 32);
};

// ─── Policy Checks ─────────────────────────────────────────────
export const runPolicyChecks = (actionType, userRole, projectId) => {
  const checks = [];

  // Check 1: Project access
  checks.push({
    check: 'PROJECT_ACCESS',
    result: projectId ? 'PASS' : 'DENY',
    reason: projectId ? 'Active project set' : 'No project selected',
  });

  // Check 2: Role permission
  const allowedRoles = ['admin', 'pm', 'manager', 'project manager', 'owner'];
  const roleAllowed =
    !userRole ||
    allowedRoles.some((r) =>
      (userRole || '').toLowerCase().includes(r.toLowerCase())
    );
  checks.push({
    check: 'ROLE_PERMISSION',
    result: roleAllowed ? 'PASS' : 'WARN',
    reason: roleAllowed ? 'Role authorized' : 'Role not in approved list',
  });

  // Check 3: Sensitive data access
  const sensitiveActions = ['EXPORT_REQUESTED', 'LEGAL_HOLD_FLAGGED'];
  if (sensitiveActions.includes(actionType)) {
    checks.push({
      check: 'SENSITIVE_DATA_ACCESS',
      result: 'LOGGED',
      reason: 'Sensitive action — elevated audit record created',
    });
  }

  // Log denied checks
  const denied = checks.filter((c) => c.result === 'DENY');
  if (denied.length > 0) {
    console.warn('PMA policy check failed:', denied);
  }

  return checks;
};

// ─── Audit Record Creation ─────────────────────────────────────
export const createAuditRecord = async ({
  actionType,
  triggeredBy,
  outputSummary,
  snapshot,
  projectId,
  projectName,
  sessionId,
  userId,
  userRole,
}) => {
  if (!PMA_AUDIT_ENABLED) return null;
  try {
    const hash = generateHash(snapshot);
    const recordCount = snapshot._lineage?.length || 0;

    // Strip large arrays/objects — keep only summary counts
    const safeSnapshot = snapshot
      ? {
          project: snapshot.project,
          rfis: {
            total: snapshot.rfis?.total,
            open: snapshot.rfis?.open,
            overdue: snapshot.rfis?.overdue,
            critical: snapshot.rfis?.critical,
          },
          workPackages: {
            total: snapshot.workPackages?.total,
            avgComplete: snapshot.workPackages?.avgComplete,
          },
          deliveries: {
            upcoming: snapshot.deliveries?.upcoming,
            late: snapshot.deliveries?.late,
          },
          changeOrders: {
            pending: snapshot.changeOrders?.pending,
            totalValue: snapshot.changeOrders?.totalValue,
          },
          budget: {
            pctUsed: snapshot.budget?.pctUsed,
            contractValue: snapshot.budget?.contractValue,
          },
          generatedAt: snapshot.generatedAt,
          _projectId: snapshot._projectId,
          _snapshotTime: snapshot._snapshotTime,
        }
      : {};

    const record = {
      project_id: projectId,
      project_name: projectName,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      action_type: actionType,
      triggered_by: triggeredBy,
      input_summary: `${recordCount} records from ${projectName}`,
      output_summary: outputSummary,
      source_artifacts: null,
      data_snapshot: JSON.stringify(safeSnapshot),
      reproducibility_hash: hash,
      policy_checks: JSON.stringify(
        runPolicyChecks(actionType, userRole, projectId)
      ),
      user_id: userId,
      user_role: userRole,
      app_version: '2.0',
    };

    await base44.functions.invoke('writeAuditLog', record);
    return record;
  } catch {
    return null;
  }
};

// ─── Legal Hold Flag ────────────────────────────────────────────
export const flagLegalHold = async (auditEntryId, reason, userEmail) => {
  if (!PMA_AUDIT_ENABLED) return false;
  try {
    await base44.functions.invoke('writeAuditLog', {
      action: 'legal_hold',
      log_id: auditEntryId,
      legal_hold_flag: true,
      legal_hold_reason: reason,
      legal_hold_flagged_by: userEmail,
      legal_hold_flagged_at: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error('Failed to flag legal hold:', error);
    return false;
  }
};

// ─── Export Audit Log as CSV ────────────────────────────────────
export const exportAuditLogCSV = (entries, projectName) => {
  const headers = [
    'Timestamp',
    'Session ID',
    'Action Type',
    'Triggered By',
    'Input Summary',
    'Output Summary',
    'Source Count',
    'Reproducibility Hash',
    'Policy Results',
    'Legal Hold',
    'Legal Hold Reason',
    'User ID',
    'App Version',
  ];

  const rows = entries.map((e) => {
    const policyChecks = JSON.parse(e.policy_checks || '[]');
    const policyResults = policyChecks.map((p) => `${p.check}:${p.result}`).join(';');
    return [
      e.timestamp,
      e.session_id,
      e.action_type,
      e.triggered_by,
      e.input_summary,
      e.output_summary,
      '',
      e.reproducibility_hash,
      policyResults,
      e.legal_hold_flag ? 'Yes' : 'No',
      e.legal_hold_reason || '',
      e.user_id,
      e.app_version,
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map((r) =>
      r
        .map((cell) => (typeof cell === 'string' ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${projectName}_PMA_AuditLog_${new Date().toISOString().split('T')[0]}.csv`);
  link.click();
  URL.revokeObjectURL(url);
};

// ─── Reproduce Output from Frozen Snapshot ──────────────────────
export const reproduceOutput = async (auditEntry) => {
  if (!auditEntry.data_snapshot) {
    return {
      error: 'Snapshot not available for this entry',
    };
  }

  const frozenSnapshot = JSON.parse(auditEntry.data_snapshot);

  const reproPrompt = `Using only the following frozen data snapshot from ${frozenSnapshot._snapshotTime}, regenerate the original output. Do not fetch new data. Do not update any values. This is a reproduction for audit purposes only.

Snapshot hash: ${auditEntry.reproducibility_hash}
Original trigger: ${auditEntry.triggered_by}

DATA:
${JSON.stringify(frozenSnapshot, null, 2)}

Regenerate the original ${auditEntry.action_type} output based ONLY on this frozen data.`;

  try {
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: reproPrompt,
    });

    return {
      content: response,
      originalTime: auditEntry.timestamp,
      snapshotTime: frozenSnapshot._snapshotTime,
      hash: auditEntry.reproducibility_hash,
    };
  } catch (error) {
    console.error('Failed to reproduce output:', error);
    return {
      error: 'Failed to regenerate output',
    };
  }
};
