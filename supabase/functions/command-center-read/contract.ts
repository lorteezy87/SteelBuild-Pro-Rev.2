export const STEELBUILD_ENTITY_TYPES = [
  "project",
  "rfi",
  "change_order",
  "drawing_revision",
  "schedule_task",
  "submittal",
] as const;

export type SteelBuildEntityType = (typeof STEELBUILD_ENTITY_TYPES)[number];

export interface SteelBuildCursor {
  version: 1;
  entityType: SteelBuildEntityType;
  updatedAt: string;
  id: string;
}

export interface SteelBuildReadRequest {
  schemaVersion: 1;
  entityTypes: [SteelBuildEntityType];
  projectIds?: string[];
  updatedAfter?: string;
  cursors?: Partial<Record<SteelBuildEntityType, string>>;
  limitPerEntity: number;
}

const entityTypes = new Set<string>(STEELBUILD_ENTITY_TYPES);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseReadRequest(value: unknown): SteelBuildReadRequest {
  const body = requireObject(value, "request");
  requireExactKeys(body, [
    "schemaVersion",
    "entityTypes",
    "projectIds",
    "updatedAfter",
    "cursors",
    "limitPerEntity",
  ], true);
  if (body.schemaVersion !== 1) throw new Error("Unsupported schemaVersion");
  if (!Array.isArray(body.entityTypes) || body.entityTypes.length !== 1 || !isEntityType(body.entityTypes[0])) {
    throw new Error("Exactly one supported entity type is required per request");
  }
  const entityType = body.entityTypes[0];

  let projectIds: string[] | undefined;
  if (body.projectIds !== undefined) {
    if (!Array.isArray(body.projectIds) || body.projectIds.length < 1 || body.projectIds.length > 250) {
      throw new Error("projectIds must contain 1 through 250 IDs");
    }
    projectIds = body.projectIds.map((id) => requireUuid(id, "projectId"));
    if (new Set(projectIds).size !== projectIds.length) throw new Error("projectIds must be unique");
  }

  const updatedAfter = body.updatedAfter === undefined
    ? undefined
    : requireIsoTimestamp(body.updatedAfter, "updatedAfter");
  const limitPerEntity = body.limitPerEntity === undefined ? 100 : body.limitPerEntity;
  if (!Number.isInteger(limitPerEntity) || (limitPerEntity as number) < 1 || (limitPerEntity as number) > 250) {
    throw new Error("limitPerEntity must be an integer from 1 through 250");
  }

  let cursors: Partial<Record<SteelBuildEntityType, string>> | undefined;
  if (body.cursors !== undefined) {
    const cursorObject = requireObject(body.cursors, "cursors");
    for (const key of Object.keys(cursorObject)) {
      if (!isEntityType(key) || key !== entityType) throw new Error("Cursor entity must match the requested entity type");
      if (typeof cursorObject[key] !== "string") throw new Error("Cursor must be a string");
      decodeCursor(cursorObject[key] as string, entityType);
    }
    cursors = cursorObject as Partial<Record<SteelBuildEntityType, string>>;
  }

  return {
    schemaVersion: 1,
    entityTypes: [entityType],
    ...(projectIds === undefined ? {} : { projectIds }),
    ...(updatedAfter === undefined ? {} : { updatedAfter }),
    ...(cursors === undefined ? {} : { cursors }),
    limitPerEntity: limitPerEntity as number,
  };
}

export function encodeCursor(cursor: SteelBuildCursor): string {
  validateCursor(cursor, cursor.entityType);
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    v: cursor.version,
    e: cursor.entityType,
    u: cursor.updatedAt,
    i: cursor.id,
  })));
}

export function decodeCursor(value: string, expectedEntityType: SteelBuildEntityType): SteelBuildCursor {
  if (typeof value !== "string" || value.length < 1 || value.length > 4_096 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Cursor must be bounded opaque base64url");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(value)));
  } catch {
    throw new Error("Cursor is malformed");
  }
  const object = requireObject(raw, "cursor");
  requireExactKeys(object, ["v", "e", "u", "i"]);
  const cursor: SteelBuildCursor = {
    version: object.v as 1,
    entityType: object.e as SteelBuildEntityType,
    updatedAt: object.u as string,
    id: object.i as string,
  };
  validateCursor(cursor, expectedEntityType);
  return cursor;
}

export function scopeRowsToVisibleProjects<T extends { project_id: string }>(
  rows: readonly T[],
  visibleProjectIds: ReadonlySet<string>,
  requestedProjectIds?: readonly string[],
): T[] {
  const requested = requestedProjectIds === undefined ? null : new Set(requestedProjectIds);
  return rows.filter((row) => visibleProjectIds.has(row.project_id) && (requested === null || requested.has(row.project_id)));
}

export function requireIsoTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be an ISO timestamp with an offset`);
  }
  return new Date(value).toISOString();
}

function validateCursor(cursor: SteelBuildCursor, expectedEntityType: SteelBuildEntityType): void {
  if (cursor.version !== 1) throw new Error("Unsupported cursor version");
  if (!isEntityType(cursor.entityType) || cursor.entityType !== expectedEntityType) {
    throw new Error("Cursor entity does not match the request");
  }
  requireIsoTimestamp(cursor.updatedAt, "cursor.updatedAt");
  requireUuid(cursor.id, "cursor.id");
}

function isEntityType(value: unknown): value is SteelBuildEntityType {
  return typeof value === "string" && entityTypes.has(value);
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(`${field} must be a UUID`);
  return value.toLowerCase();
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  optionalAllowed = false,
): void {
  const actual = Object.keys(value);
  if (actual.some((key) => !allowed.includes(key))) throw new Error("Object contains unsupported fields");
  if (!optionalAllowed && (actual.length !== allowed.length || allowed.some((key) => !actual.includes(key)))) {
    throw new Error("Object contains missing fields");
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
