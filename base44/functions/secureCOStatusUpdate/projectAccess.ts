type AnyRecord = Record<string, unknown>;

const PROJECT_ASSIGNMENT_FIELDS = [
  "project_members",
  "project_manager",
  "superintendent",
  "estimator",
  "created_by",
  "owner_email",
  "assigned_to",
  "project_team",
  "team_members",
  "assigned_users",
  "member_emails",
  "members",
  "membersVisible",
];

function normalizeToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function toFlatValues(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toFlatValues(entry));
  }
  if (typeof value === "object") {
    return Object.values(value as AnyRecord).flatMap((entry) => toFlatValues(entry));
  }
  return [String(value)];
}

export function normalizeProjectMembers(value: unknown) {
  return unique(
    toFlatValues(value)
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
  );
}

function getUserIdentityTokens(user: AnyRecord | null | undefined) {
  const email = String(user?.email || "").trim().toLowerCase();
  const emailLocal = email.includes("@") ? email.split("@")[0] : "";
  return unique([
    normalizeToken(email),
    normalizeToken(emailLocal),
    normalizeToken(user?.name),
    normalizeToken(user?.full_name),
    normalizeToken(user?.display_name),
  ]);
}

function getProjectAssignmentTokens(project: AnyRecord | null | undefined) {
  if (!project) return [];
  const explicitMembers = normalizeProjectMembers(project.project_members);
  const values = explicitMembers.length > 0
    ? explicitMembers
    : PROJECT_ASSIGNMENT_FIELDS.flatMap((field) => toFlatValues(project[field]));
  return unique(values.map((value) => normalizeToken(value)));
}

export function canAccessProject(project: AnyRecord | null | undefined, user: AnyRecord | null | undefined) {
  if (!project || !user) return false;
  if (String(user.role || "").toLowerCase() === "admin") return true;

  const assignmentTokens = getProjectAssignmentTokens(project);
  if (assignmentTokens.length === 0) {
    // Preserve access for legacy projects that have no assignment metadata yet.
    return true;
  }

  const userTokens = getUserIdentityTokens(user);
  return userTokens.some((token) => assignmentTokens.includes(token));
}

export async function assertProjectAccess(
  base44: AnyRecord,
  user: AnyRecord,
  projectId: string,
) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) {
    return Response.json({ error: "project_id is required" }, { status: 400 });
  }

  const project = await base44.asServiceRole.entities.Project.get(normalizedProjectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (!canAccessProject(project, user)) {
    return Response.json({ error: "Forbidden: Project access denied" }, { status: 403 });
  }

  return { project, projectId: normalizedProjectId };
}
