import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { normalizeProjectMembers } from "./projectAccess.ts";

function decodeJwtPayload(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

async function resolveAdminUser(base44: ReturnType<typeof createClientFromRequest>, req: Request) {
  try {
    const user = await base44.auth.me();
    if (user) return user;
  } catch {
    // Fall back to resolving the CLI subject against the app User table.
  }

  const token = getBearerToken(req);
  const payload = token ? decodeJwtPayload(token) : null;
  const subject = String(payload?.sub || "").trim().toLowerCase();
  if (!subject) return null;

  const matches = await base44.asServiceRole.entities.User.filter({ email: subject }, undefined, 1);
  return Array.isArray(matches) ? matches[0] || null : null;
}

function deriveProjectMembers(project: Record<string, unknown>) {
  return normalizeProjectMembers([
    project.project_members,
    project.project_manager,
    project.superintendent,
    project.estimator,
    project.created_by,
    project.owner_email,
    project.team_members,
    project.project_team,
    project.member_emails,
    project.members,
    project.membersVisible,
  ]);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await resolveAdminUser(base44, req);

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (String(user.role || "").toLowerCase() !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false;

    const projects = await base44.asServiceRole.entities.Project.list();
    const results = [];
    const verificationFailures = [];

    for (const project of projects) {
      const existingMembers = normalizeProjectMembers(project.project_members);
      const derivedMembers = deriveProjectMembers(project);
      const shouldUpdate =
        derivedMembers.length > 0 &&
        JSON.stringify(existingMembers) !== JSON.stringify(derivedMembers);

      results.push({
        project_id: project.id,
        project_name: project.name,
        existing_count: existingMembers.length,
        derived_count: derivedMembers.length,
        changed: shouldUpdate,
      });

      if (shouldUpdate && !dryRun) {
        await base44.asServiceRole.entities.Project.update(project.id, {
          project_members: derivedMembers,
        });
        const refreshed = await base44.asServiceRole.entities.Project.get(project.id);
        const persistedMembers = normalizeProjectMembers(refreshed?.project_members);
        const persisted = JSON.stringify(persistedMembers) === JSON.stringify(derivedMembers);
        results[results.length - 1] = {
          ...results[results.length - 1],
          persisted_count: persistedMembers.length,
          persisted,
        };
        if (!persisted) {
          verificationFailures.push({
            project_id: project.id,
            project_name: project.name,
            expected_count: derivedMembers.length,
            persisted_count: persistedMembers.length,
          });
        }
      }
    }

    if (!dryRun && verificationFailures.length) {
      return Response.json({
        error: "project_members did not persist on one or more projects",
        evaluated: results.length,
        changed: results.filter((item) => item.changed).length,
        verification_failures: verificationFailures,
        results,
      }, { status: 500 });
    }

    return Response.json({
      dry_run: dryRun,
      evaluated: results.length,
      changed: results.filter((item) => item.changed).length,
      results,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
