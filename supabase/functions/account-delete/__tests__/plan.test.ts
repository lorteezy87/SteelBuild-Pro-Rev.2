import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_ERASURE_REASON,
  WORKSPACE_ERASURE_REASON,
  eraseOrgArgs,
  eraseSoleWorkspacesArgs,
  erasedWorkspaceIds,
  planAccountDeletion,
  type OrgRoster,
} from '../plan';

const ME = 'user-me';
const roster = (orgId: string, members: Array<[string, string]>): OrgRoster => ({
  orgId,
  orgName: `Org ${orgId}`,
  members: members.map(([userId, role]) => ({ userId, role })),
});
const ids = (orgs: OrgRoster[]) => orgs.map((o) => o.orgId);

describe('planAccountDeletion', () => {
  it('erases a workspace where the caller is the only member and owner', () => {
    const plan = planAccountDeletion(ME, [roster('solo', [[ME, 'owner']])]);
    expect(ids(plan.erase)).toEqual(['solo']);
    expect(plan.blocked).toEqual([]);
  });

  it('refuses while the caller is the only owner of a workspace with other members', () => {
    const plan = planAccountDeletion(ME, [roster('shared', [[ME, 'owner'], ['u2', 'member'], ['u3', 'admin']])]);
    expect(ids(plan.blocked)).toEqual(['shared']);
    expect(plan.erase).toEqual([]);
  });

  it('just leaves a workspace that has another owner', () => {
    const plan = planAccountDeletion(ME, [roster('co-owned', [[ME, 'owner'], ['u2', 'owner']])]);
    expect(ids(plan.leave)).toEqual(['co-owned']);
    expect(plan.blocked).toEqual([]);
    expect(plan.erase).toEqual([]);
  });

  it('just leaves workspaces where the caller is not an owner', () => {
    const plan = planAccountDeletion(ME, [
      roster('theirs', [['u2', 'owner'], [ME, 'member']]),
      roster('ownerless', [[ME, 'admin']]),
    ]);
    // A lone non-owner can't erase (the RPC checks owner); the workspace stays.
    expect(ids(plan.leave)).toEqual(['theirs', 'ownerless']);
    expect(plan.erase).toEqual([]);
  });

  it('plans every workspace up front, so one blocked workspace stops the whole deletion', () => {
    const plan = planAccountDeletion(ME, [
      roster('solo', [[ME, 'owner']]),
      roster('shared', [[ME, 'owner'], ['u2', 'member']]),
      roster('theirs', [['u2', 'owner'], [ME, 'member']]),
    ]);
    expect(ids(plan.erase)).toEqual(['solo']);
    expect(ids(plan.blocked)).toEqual(['shared']);
    expect(ids(plan.leave)).toEqual(['theirs']);
  });
});

describe('hard_delete_organization arguments', () => {
  it('always passes a p_reason the RPC accepts (12+ characters)', () => {
    for (const reason of [ACCOUNT_ERASURE_REASON, WORKSPACE_ERASURE_REASON]) {
      const args = eraseOrgArgs('org-1', reason);
      expect(Object.keys(args).sort()).toEqual(['p_org_id', 'p_reason']);
      expect(args.p_reason.length).toBeGreaterThanOrEqual(12);
    }
  });

  it('matches the signature in the types generated from production', () => {
    // Calling it without p_reason made PostgREST reject every erasure (PGRST202).
    const types = readFileSync(new URL('../../../../src/types/supabase.ts', import.meta.url), 'utf8');
    const block = types.match(/hard_delete_organization: \{\s*Args: \{([^}]*)\}/);
    expect(block, 'hard_delete_organization is missing from src/types/supabase.ts').not.toBeNull();
    const params = (block?.[1] ?? '').split(';').map((p) => p.trim()).filter(Boolean);
    const required = params.filter((p) => !p.includes('?:')).map((p) => p.split(':')[0].trim()).sort();
    expect(required).toEqual(Object.keys(eraseOrgArgs('org-1', ACCOUNT_ERASURE_REASON)).sort());
  });
});

describe('erase_my_sole_member_workspaces', () => {
  it('passes exactly the parameters the migration declares', () => {
    const sql = readFileSync(
      new URL('../../../migrations/20260927160000_account_deletion_releases_authorship.sql', import.meta.url),
      'utf8',
    );
    const signature = sql.match(/function public\.erase_my_sole_member_workspaces\(([^)]*)\)/);
    expect(signature, 'erase_my_sole_member_workspaces is missing from the migration').not.toBeNull();
    const params = (signature?.[1] ?? '').split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean).sort();
    expect(params).toEqual(Object.keys(eraseSoleWorkspacesArgs(ACCOUNT_ERASURE_REASON)).sort());
    expect(eraseSoleWorkspacesArgs(ACCOUNT_ERASURE_REASON).p_reason.length).toBeGreaterThanOrEqual(12);
  });

  it('reads the erased ids for the Storage purge', () => {
    expect(erasedWorkspaceIds({ org_ids: ['o1'], project_ids: ['p1', 'p2'] })).toEqual({
      orgIds: ['o1'],
      projectIds: ['p1', 'p2'],
    });
  });

  it('purges nothing it cannot read as an id', () => {
    for (const body of [null, undefined, 'x', {}, { org_ids: 'o1' }, { org_ids: [1, null, ''], project_ids: [{}] }]) {
      expect(erasedWorkspaceIds(body)).toEqual({ orgIds: [], projectIds: [] });
    }
  });
});
