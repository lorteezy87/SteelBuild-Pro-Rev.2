// One-time STAGING-ONLY fixture bootstrap. It creates or resumes one confirmed
// synthetic E2E user plus one synthetic org/project, then permanently completes
// its private maintenance marker. No production/customer records are read.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  MaintenanceError,
  authorizeMaintenanceRequest,
  jsonResponse,
  maintenanceClient,
  projectRefFromUrl,
} from "../_shared/maintenance-auth.ts";

const JOB_KEY = "staging_e2e_bootstrap";
const STAGING_PROJECT_REF = "abbeavtbifuddtrifvae";
const PURPOSE = "steelbuild-pro-staging-e2e";

interface BootstrapRequest {
  email?: string;
  password?: string;
}

async function listAllUsers(client: ReturnType<typeof maintenanceClient>["client"]) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new MaintenanceError(500, "Staging auth inventory failed.");
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const { client, url } = maintenanceClient();
    if (projectRefFromUrl(url) !== STAGING_PROJECT_REF) {
      throw new MaintenanceError(403, "Bootstrap is restricted to the staging project.");
    }
    await authorizeMaintenanceRequest(request, client, url, JOB_KEY);

    let payload: BootstrapRequest;
    try {
      payload = await request.json();
    } catch {
      throw new MaintenanceError(400, "A JSON request body is required.");
    }
    const email = payload.email?.trim().toLowerCase() || "";
    const password = payload.password || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 16) {
      throw new MaintenanceError(400, "A valid email and a password of at least 16 characters are required.");
    }

    const beforeCleanup = await listAllUsers(client);
    let deletedUnconfirmedUsers = 0;
    for (const user of beforeCleanup) {
      if (user.user_metadata?.purpose !== PURPOSE || user.email_confirmed_at) continue;
      const { error } = await client.auth.admin.deleteUser(user.id);
      if (error) throw new MaintenanceError(500, "Stale staging-user cleanup failed.");
      deletedUnconfirmedUsers += 1;
    }

    const remainingUsers = beforeCleanup.filter(
      (user) => !(user.user_metadata?.purpose === PURPOSE && !user.email_confirmed_at),
    );
    const conflictingUser = remainingUsers.find(
      (user) => user.email?.toLowerCase() === email && user.user_metadata?.purpose !== PURPOSE,
    );
    if (conflictingUser) {
      throw new MaintenanceError(409, "Requested email belongs to a non-fixture confirmed user.");
    }

    let user = remainingUsers.find(
      (candidate) =>
        candidate.email?.toLowerCase() === email &&
        candidate.user_metadata?.purpose === PURPOSE &&
        candidate.email_confirmed_at,
    );
    let usersCreated = 0;
    if (!user) {
      const created = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { purpose: PURPOSE, full_name: "Staging E2E" },
      });
      if (created.error || !created.data.user) {
        throw new MaintenanceError(500, "Confirmed staging fixture user creation failed.");
      }
      user = created.data.user;
      usersCreated = 1;
    }

    const orgQuery = await client
      .from("organizations")
      .select("id")
      .eq("created_by", user.id)
      .contains("metadata", { purpose: PURPOSE })
      .limit(2);
    if (orgQuery.error || (orgQuery.data?.length || 0) > 1) {
      throw new MaintenanceError(500, "Synthetic staging organization lookup failed.");
    }
    let orgId = orgQuery.data?.[0]?.id as string | undefined;
    let organizationsCreated = 0;
    if (!orgId) {
      const created = await client
        .from("organizations")
        .insert({
          name: "Staging E2E Fixture",
          slug: `staging-e2e-${user.id.slice(0, 8)}`,
          created_by: user.id,
          metadata: { purpose: PURPOSE, synthetic: true },
        })
        .select("id")
        .single();
      if (created.error || !created.data) {
        throw new MaintenanceError(500, "Synthetic staging organization creation failed.");
      }
      orgId = created.data.id;
      organizationsCreated = 1;
    }

    const orgMembership = await client.from("organization_members").upsert(
      { org_id: orgId, user_id: user.id, role: "owner" },
      { onConflict: "org_id,user_id" },
    );
    if (orgMembership.error) {
      throw new MaintenanceError(500, "Synthetic staging organization membership failed.");
    }

    const projectQuery = await client
      .from("projects")
      .select("id")
      .eq("org_id", orgId)
      .contains("metadata", { purpose: PURPOSE })
      .limit(2);
    if (projectQuery.error || (projectQuery.data?.length || 0) > 1) {
      throw new MaintenanceError(500, "Synthetic staging project lookup failed.");
    }
    let projectId = projectQuery.data?.[0]?.id as string | undefined;
    let projectsCreated = 0;
    if (!projectId) {
      const created = await client
        .from("projects")
        .insert({
          org_id: orgId,
          name: "Staging E2E Project",
          project_number: `E2E-${user.id.slice(0, 8).toUpperCase()}`,
          phase: "Pre-Construction",
          health_status: "On Track",
          metadata: { purpose: PURPOSE, synthetic: true },
        })
        .select("id")
        .single();
      if (created.error || !created.data) {
        throw new MaintenanceError(500, "Synthetic staging project creation failed.");
      }
      projectId = created.data.id;
      projectsCreated = 1;
    }

    const projectMembership = await client.from("user_projects").upsert(
      { project_id: projectId, user_id: user.id, role: "owner" },
      { onConflict: "user_id,project_id" },
    );
    if (projectMembership.error) {
      throw new MaintenanceError(500, "Synthetic staging project membership failed.");
    }

    const completion = await client.rpc("complete_staging_e2e_bootstrap", {
      p_user_id: user.id,
      p_org_id: orgId,
      p_project_id: projectId,
    });
    if (completion.error || completion.data !== true) {
      throw new MaintenanceError(500, "Staging bootstrap completion marker failed.");
    }

    return jsonResponse(200, {
      deleted_unconfirmed_users: deletedUnconfirmedUsers,
      users_created: usersCreated,
      organizations_created: organizationsCreated,
      projects_created: projectsCreated,
      organization_memberships: 1,
      project_memberships: 1,
      user_id: user.id,
      org_id: orgId,
      project_id: projectId,
      completed: true,
    });
  } catch (error) {
    const status = error instanceof MaintenanceError ? error.status : 500;
    const message = error instanceof MaintenanceError ? error.message : "Staging bootstrap failed.";
    return jsonResponse(status, { error: message });
  }
});
