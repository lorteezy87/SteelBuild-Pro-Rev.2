import { describe, expect, it, vi } from "vitest";

import { deleteOrphanedUsers, eraseOwnedOrg, handleAccountDeletion, handleOrgDeletion } from "../erasure";

// account-delete decides what to erase from a handful of reads. Each of these
// once failed OPEN: a failed count read as 0, so a co-owned workspace looked
// sole-owned and was erased for every co-owner, and a user who still belonged
// to another org looked orphaned and lost their login.

interface Query {
  table: string;
  columns: string;
  filters: Record<string, string>;
  head: boolean;
}
interface Reply {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

const DB_MESSAGE = 'permission denied for table organization_members (policy "om_select")';

function fakeAdmin(reply: (q: Query) => Reply) {
  const deleteUser = vi.fn(async (_uid: string) => ({ error: null as { message: string } | null }));
  const list = vi.fn(async (_dir: string) => ({ data: [] as unknown[], error: null as { message: string } | null }));
  const remove = vi.fn(async (_paths: string[]) => ({ error: null as { message: string } | null }));
  const admin = {
    from(table: string) {
      const q: Query = { table, columns: "", filters: {}, head: false };
      const settle = () => Promise.resolve({ data: null, error: null, count: null, ...reply(q) });
      const builder = {
        select(columns: string, opts?: { head?: boolean }) {
          q.columns = columns;
          q.head = Boolean(opts?.head);
          return builder;
        },
        eq(column: string, value: string) {
          q.filters[column] = value;
          return builder;
        },
        maybeSingle: settle,
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          return settle().then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
    auth: { admin: { deleteUser } },
    storage: { from: (_bucket: string) => ({ list, remove }) },
  };
  return { admin, deleteUser, list, remove };
}

function fakeUserClient(rpcError: { message: string } | null = null) {
  const rpc = vi.fn(async (_fn: string, _args: unknown) => ({ error: rpcError }));
  return { client: { rpc }, rpc };
}

const isMembershipsOf = (q: Query, uid: string) =>
  q.table === "organization_members" && q.columns === "org_id, role" && q.filters.user_id === uid;
const isOwnerCount = (q: Query, orgId: string) =>
  q.table === "organization_members" && q.head && q.filters.org_id === orgId && q.filters.role === "owner";
const isMemberCount = (q: Query, uid: string) =>
  q.table === "organization_members" && q.head && q.filters.user_id === uid && !q.filters.org_id;

describe("handleAccountDeletion", () => {
  it("erases nothing when a workspace's owner count cannot be read", async () => {
    const { admin, deleteUser } = fakeAdmin((q) => {
      if (isMembershipsOf(q, "caller")) return { data: [{ org_id: "org-shared", role: "owner" }] };
      if (isOwnerCount(q, "org-shared")) return { error: { message: DB_MESSAGE }, count: null };
      return { data: [] };
    });
    const { client, rpc } = fakeUserClient();
    const log = vi.fn();

    const result = await handleAccountDeletion(admin, client, "caller", log);

    expect(rpc).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(result.status).toBe(500);
    expect(result.body.error).toBe("lookup_failed");
    expect(JSON.stringify(result.body)).not.toContain("organization_members");
    expect(log.mock.calls.join(" ")).toContain(DB_MESSAGE);
  });

  it("erases nothing when the caller's memberships cannot be read", async () => {
    const { admin, deleteUser } = fakeAdmin((q) =>
      isMembershipsOf(q, "caller") ? { data: null, error: { message: DB_MESSAGE } } : { data: [] },
    );
    const { client, rpc } = fakeUserClient();

    const result = await handleAccountDeletion(admin, client, "caller", vi.fn());

    expect(rpc).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(result.status).toBe(500);
  });

  it("keeps a co-owned workspace and deletes only the caller", async () => {
    const { admin, deleteUser } = fakeAdmin((q) => {
      if (isMembershipsOf(q, "caller")) return { data: [{ org_id: "org-shared", role: "owner" }] };
      if (isOwnerCount(q, "org-shared")) return { count: 2 };
      return { data: [] };
    });
    const { client, rpc } = fakeUserClient();

    const result = await handleAccountDeletion(admin, client, "caller", vi.fn());

    expect(rpc).not.toHaveBeenCalled();
    expect(deleteUser.mock.calls.map(([uid]) => uid)).toEqual(["caller"]);
    expect(result.body).toMatchObject({ ok: true, orgs_deleted: 0, users_deleted: 1 });
  });

  it("erases a sole-owned workspace, then sweeps only members left with no org", async () => {
    const { admin, deleteUser } = fakeAdmin((q) => {
      if (isMembershipsOf(q, "caller")) return { data: [{ org_id: "org-solo", role: "owner" }] };
      if (isOwnerCount(q, "org-solo")) return { count: 1 };
      if (q.table === "projects") return { data: [{ id: "p1" }] };
      if (q.table === "organization_members" && q.filters.org_id === "org-solo") {
        return { data: [{ user_id: "caller" }, { user_id: "orphan" }, { user_id: "elsewhere" }] };
      }
      if (isMemberCount(q, "orphan")) return { count: 0 };
      if (isMemberCount(q, "elsewhere")) return { count: 1 };
      return { data: [] };
    });
    const { client, rpc } = fakeUserClient();

    const result = await handleAccountDeletion(admin, client, "caller", vi.fn());

    expect(rpc).toHaveBeenCalledWith("hard_delete_organization", { p_org_id: "org-solo" });
    expect(deleteUser.mock.calls.map(([uid]) => uid)).toEqual(["caller", "orphan"]);
    expect(result.body).toMatchObject({ ok: true, orgs_deleted: 1, users_deleted: 2, users_skipped: 0 });
  });
});

describe("deleteOrphanedUsers", () => {
  it("keeps a user whose membership count cannot be read", async () => {
    const { admin, deleteUser } = fakeAdmin((q) =>
      isMemberCount(q, "u1") ? { error: { message: DB_MESSAGE }, count: null } : { count: 0 },
    );

    const result = await deleteOrphanedUsers(admin, ["u1", "u2"], vi.fn());

    expect(deleteUser.mock.calls.map(([uid]) => uid)).toEqual(["u2"]);
    expect(result).toEqual({ deleted: 1, skipped: 1 });
  });
});

describe("eraseOwnedOrg", () => {
  it("does not call the erasure RPC when the project snapshot fails", async () => {
    const { admin } = fakeAdmin((q) =>
      q.table === "projects" ? { data: null, error: { message: DB_MESSAGE } } : { data: [] },
    );
    const { client, rpc } = fakeUserClient();

    await expect(eraseOwnedOrg(admin, client, "org-1")).rejects.toMatchObject({ code: "lookup_failed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports an incomplete storage purge instead of hiding it", async () => {
    const { admin, list } = fakeAdmin(() => ({ data: [] }));
    list.mockResolvedValueOnce({ data: [], error: { message: "storage unavailable" } });
    const { client } = fakeUserClient();

    const erased = await eraseOwnedOrg(admin, client, "org-1");

    expect(erased.storageComplete).toBe(false);
  });
});

describe("handleOrgDeletion", () => {
  const ownerOf = (orgId: string) => (q: Query) =>
    q.table === "organization_members" && q.columns === "role" && q.filters.org_id === orgId;

  it("returns a user-safe message when the erasure RPC fails", async () => {
    const { admin } = fakeAdmin((q) => (ownerOf("org-1")(q) ? { data: { role: "owner" } } : { data: [] }));
    const { client } = fakeUserClient({ message: DB_MESSAGE });
    const log = vi.fn();

    const result = await handleOrgDeletion(admin, client, "caller", "org-1", log);

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("db_erasure_failed");
    expect(JSON.stringify(result.body)).not.toContain("permission denied");
    expect(log.mock.calls.join(" ")).toContain(DB_MESSAGE);
  });

  it("refuses a caller who is not the owner", async () => {
    const { admin } = fakeAdmin((q) => (ownerOf("org-1")(q) ? { data: { role: "admin" } } : { data: [] }));
    const { client, rpc } = fakeUserClient();

    const result = await handleOrgDeletion(admin, client, "caller", "org-1", vi.fn());

    expect(result.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the owner check itself errors", async () => {
    const { admin } = fakeAdmin((q) => (ownerOf("org-1")(q) ? { data: null, error: { message: DB_MESSAGE } } : { data: [] }));
    const { client, rpc } = fakeUserClient();

    const result = await handleOrgDeletion(admin, client, "caller", "org-1", vi.fn());

    expect(result.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });
});
