export type DesktopRecordEntityType =
  | "project"
  | "rfi"
  | "change_order"
  | "drawing_revision"
  | "schedule_task"
  | "submittal";

export interface BuildRecordLinkInput {
  baseUrl: string;
  entityType: DesktopRecordEntityType;
  projectId: string;
  recordId: string;
  revisionId?: string;
}

const ROUTES: Readonly<Record<DesktopRecordEntityType, string>> = Object.freeze({
  project: "/Projects",
  rfi: "/RFIs",
  change_order: "/ChangeOrders",
  drawing_revision: "/DrawingViewer",
  schedule_task: "/Schedule",
  submittal: "/Submittals",
});

const LOCAL_HTTP_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function buildRecordLink(input: BuildRecordLinkInput): string {
  const route = ROUTES[input.entityType];
  if (route === undefined) {
    throw new Error(`Unsupported desktop record entity type: ${String(input.entityType)}`);
  }

  const base = parseAllowedBaseUrl(input.baseUrl);
  const projectId = requireIdentifier(input.projectId, "projectId");
  const recordId = requireIdentifier(input.recordId, "recordId");

  if (input.entityType === "drawing_revision" && input.revisionId === undefined) {
    throw new Error("revisionId is required for drawing revision links");
  }
  if (input.entityType !== "drawing_revision" && input.revisionId !== undefined) {
    throw new Error("revisionId is supported only for drawing revision links");
  }

  const url = new URL(route, base.origin);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("recordId", recordId);
  if (input.revisionId !== undefined) {
    url.searchParams.set("revisionId", requireIdentifier(input.revisionId, "revisionId"));
  }
  return url.href;
}

function parseAllowedBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SteelBuild base URL must be an absolute URL");
  }

  if (url.username !== "" || url.password !== "") {
    throw new Error("SteelBuild base URL cannot contain credentials");
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error("SteelBuild base URL must contain only an origin");
  }

  const isHttps = url.protocol === "https:";
  const isLocalHttp = url.protocol === "http:" && LOCAL_HTTP_HOSTNAMES.has(url.hostname);
  if (!isHttps && !isLocalHttp) {
    throw new Error("SteelBuild links require HTTPS except for local development origins");
  }

  return url;
}

function requireIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 200) {
    throw new Error(`${field} must be a non-empty identifier no longer than 200 characters`);
  }
  return normalized;
}
