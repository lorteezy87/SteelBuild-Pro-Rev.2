// Copy-first, rollback-safe cutover for legacy flat `app-files/uploads/*` data.
// This is an operator tool, never application code. It requires a service-role
// key at runtime, does not print that key, and never deletes source objects.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  BUCKET,
  LEGACY_PREFIX,
  SCALAR_REFERENCE_COLUMNS,
  assertUuid,
  comparableObjectMetadata,
  destinationPath,
  rewriteAttachmentReferences,
} from "./lib/appFilesLegacyCutover.mjs";

const VALID_PHASES = new Set(["inventory", "copy", "rewrite", "verify", "rollback-references"]);
const PAGE_SIZE = 500;

function usage() {
  console.log(`
Usage:
  PHASE=inventory FOUNDING_ORG_ID=<uuid> SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/storage-backfill-legacy-uploads.mjs

Phases:
  inventory             Read-only counts and reference discovery (default)
  copy                  Copy legacy objects; never deletes originals
  rewrite               Verify copies, then rewrite DB references
  verify                Prove copies exist and legacy DB references are zero
  rollback-references   Restore DB values from a rewrite manifest

Mutation safety:
  APPLY=1                         Required by copy/rewrite/rollback-references
  EXPECTED_LEGACY_OBJECTS=<n>     Required by copy/rewrite
  EXPECTED_REFERENCE_ROWS=<n>     Required by rewrite
  MANIFEST_PATH=<secure path>     Required for every mutation
  ROLLBACK_MANIFEST_PATH=<path>   Required by rollback-references

Objects are content-verified. Comparable ETags avoid downloads; otherwise the
script downloads source and destination sequentially and compares SHA-256.
`);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredExpectedCount(name) {
  const raw = requiredEnv(name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function requireApply(phase) {
  if (process.env.APPLY !== "1") {
    throw new Error(`${phase} is mutating. Re-run with APPLY=1 after reviewing inventory.`);
  }
}

function assertExpected(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} changed: expected ${expected}, found ${actual}. Re-run inventory.`);
  }
}

async function writeManifest(path, manifest) {
  if (!path) return;
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  const tempPath = `${absolutePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, absolutePath);
}

async function listFolder(storage, folder) {
  const objects = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await storage.list(folder, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Storage list failed for ${folder}: ${error.message}`);
    for (const object of data || []) {
      if (object.id == null) continue;
      objects.push({
        ...object,
        path: `${folder}/${object.name}`,
      });
    }
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return objects;
}

async function objectInfo(storage, path) {
  const { data, error } = await storage.info(path);
  if (error) throw new Error(`Storage info failed for ${path}: ${error.message}`);
  return data;
}

async function objectSha256(storage, path) {
  const { data, error } = await storage.download(path);
  if (error) throw new Error(`Storage download failed for ${path}: ${error.message}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifyObjectCopy(storage, sourcePath, destination) {
  const [sourceInfo, destinationInfo] = await Promise.all([
    objectInfo(storage, sourcePath),
    objectInfo(storage, destination),
  ]);
  const sourceMeta = comparableObjectMetadata(sourceInfo);
  const destinationMeta = comparableObjectMetadata(destinationInfo);

  if (sourceMeta.size == null || destinationMeta.size == null) {
    throw new Error(`Cannot verify object sizes for ${sourcePath}.`);
  }
  if (sourceMeta.size !== destinationMeta.size) {
    throw new Error(`Size mismatch for ${sourcePath} and ${destination}.`);
  }

  if (sourceMeta.etag && destinationMeta.etag && sourceMeta.etag === destinationMeta.etag) {
    return { size: sourceMeta.size, verification: "size+etag", sha256: null };
  }

  const [sourceHash, destinationHash] = await Promise.all([
    objectSha256(storage, sourcePath),
    objectSha256(storage, destination),
  ]);
  if (sourceHash !== destinationHash) {
    throw new Error(`SHA-256 mismatch for ${sourcePath} and ${destination}.`);
  }
  return { size: sourceMeta.size, verification: "size+sha256", sha256: sourceHash };
}

async function fetchScalarReferences(supabase) {
  const references = [];
  for (const [table, column] of SCALAR_REFERENCE_COLUMNS) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select(`id,${column}`)
        .like(column, `${LEGACY_PREFIX}%`)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`Reference inventory failed for ${table}.${column}: ${error.message}`);
      for (const row of data || []) {
        references.push({
          table,
          column,
          id: row.id,
          before: row[column],
          legacyPaths: [row[column]],
        });
      }
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  return references;
}

async function fetchAttachmentReferences(supabase, orgId) {
  const references = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("change_orders")
      .select("id,attachments")
      .ilike("attachments", `%${LEGACY_PREFIX}%`)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Reference inventory failed for change_orders.attachments: ${error.message}`);
    for (const row of data || []) {
      const rewritten = rewriteAttachmentReferences(row.attachments, orgId);
      if (!rewritten.changed) continue;
      references.push({
        table: "change_orders",
        column: "attachments",
        id: row.id,
        before: row.attachments,
        after: rewritten.value,
        legacyPaths: rewritten.legacyPaths,
      });
    }
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return references;
}

async function fetchReferences(supabase, orgId) {
  const scalar = await fetchScalarReferences(supabase);
  const attachments = await fetchAttachmentReferences(supabase, orgId);
  return [...scalar, ...attachments].map((reference) => ({
    ...reference,
    after: reference.after ?? destinationPath(orgId, reference.before),
  }));
}

async function updateReference(supabase, reference, fromValue, toValue) {
  const { data, error } = await supabase
    .from(reference.table)
    .update({ [reference.column]: toValue })
    .eq("id", reference.id)
    .eq(reference.column, fromValue)
    .select("id");
  if (error) {
    throw new Error(`Update failed for ${reference.table}.${reference.column}: ${error.message}`);
  }
  if (data?.length !== 1) {
    throw new Error(
      `Concurrent change detected for ${reference.table}.${reference.column} row ${reference.id}.`,
    );
  }
}

async function verifyAllCopies(storage, legacyObjects, orgId, manifest) {
  for (const [index, object] of legacyObjects.entries()) {
    const destination = destinationPath(orgId, object.path);
    const verified = await verifyObjectCopy(storage, object.path, destination);
    manifest.objects.push({ source: object.path, destination, status: "verified", ...verified });
    if ((index + 1) % 25 === 0) {
      console.log(`Verified ${index + 1}/${legacyObjects.length} object copies.`);
      await writeManifest(process.env.MANIFEST_PATH, manifest);
    }
  }
}

async function run() {
  if (process.argv.includes("--help")) {
    usage();
    return;
  }

  const phase = process.env.PHASE || "inventory";
  if (!VALID_PHASES.has(phase)) throw new Error(`Unknown PHASE: ${phase}`);

  const url = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const orgId = assertUuid(requiredEnv("FOUNDING_ORG_ID"), "FOUNDING_ORG_ID");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const storage = supabase.storage.from(BUCKET);
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    phase,
    bucket: BUCKET,
    foundingOrgId: orgId,
    sourceObjectsRetained: true,
    objects: [],
    references: [],
  };

  if (phase === "rollback-references") {
    requireApply(phase);
    const manifestPath = requiredEnv("MANIFEST_PATH");
    const rollbackPath = requiredEnv("ROLLBACK_MANIFEST_PATH");
    const prior = JSON.parse(await readFile(resolve(rollbackPath), "utf8"));
    if (prior.bucket !== BUCKET || prior.foundingOrgId !== orgId || !Array.isArray(prior.references)) {
      throw new Error("Rollback manifest does not match this bucket and organization.");
    }
    for (const reference of prior.references.filter((entry) => entry.status === "updated")) {
      await updateReference(supabase, reference, reference.after, reference.before);
      manifest.references.push({ ...reference, status: "rolled-back" });
      await writeManifest(manifestPath, manifest);
    }
    console.log(`Rolled back ${manifest.references.length} reference row(s). Originals were retained.`);
    return;
  }

  const legacyObjects = await listFolder(storage, LEGACY_PREFIX.slice(0, -1));
  const references = await fetchReferences(supabase, orgId);
  console.log(`Legacy objects: ${legacyObjects.length}; legacy reference rows: ${references.length}.`);

  if (phase === "inventory") {
    const counts = new Map();
    for (const reference of references) {
      const key = `${reference.table}.${reference.column}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const [key, count] of [...counts].sort(([left], [right]) => left.localeCompare(right))) {
      console.log(`${key}: ${count}`);
    }
    return;
  }

  if (phase === "copy") {
    requireApply(phase);
    const manifestPath = requiredEnv("MANIFEST_PATH");
    assertExpected(
      "Legacy object count",
      legacyObjects.length,
      requiredExpectedCount("EXPECTED_LEGACY_OBJECTS"),
    );
    for (const [index, object] of legacyObjects.entries()) {
      const destination = destinationPath(orgId, object.path);
      const { error } = await storage.copy(object.path, destination);
      if (error && !/already exists|duplicate|exists/i.test(error.message)) {
        manifest.objects.push({ source: object.path, destination, status: "failed", error: error.message });
        await writeManifest(manifestPath, manifest);
        throw new Error(`Copy failed for ${object.path}: ${error.message}`);
      }
      manifest.objects.push({
        source: object.path,
        destination,
        status: error ? "pre-existing" : "copied",
      });
      if ((index + 1) % 25 === 0) {
        console.log(`Copied or found ${index + 1}/${legacyObjects.length} destination objects.`);
        await writeManifest(manifestPath, manifest);
      }
    }
    manifest.objects = [];
    await verifyAllCopies(storage, legacyObjects, orgId, manifest);
    await writeManifest(manifestPath, manifest);
    console.log(`Copied and content-verified ${legacyObjects.length} object(s); originals retained.`);
    return;
  }

  if (phase === "rewrite") {
    requireApply(phase);
    const manifestPath = requiredEnv("MANIFEST_PATH");
    assertExpected(
      "Legacy object count",
      legacyObjects.length,
      requiredExpectedCount("EXPECTED_LEGACY_OBJECTS"),
    );
    assertExpected(
      "Legacy reference-row count",
      references.length,
      requiredExpectedCount("EXPECTED_REFERENCE_ROWS"),
    );
    const objectPaths = new Set(legacyObjects.map((object) => object.path));
    const missingSources = references.flatMap((reference) => reference.legacyPaths)
      .filter((path) => !objectPaths.has(path));
    if (missingSources.length > 0) {
      throw new Error(`${missingSources.length} referenced legacy path(s) have no source object.`);
    }
    await verifyAllCopies(storage, legacyObjects, orgId, manifest);
    for (const reference of references) {
      await updateReference(supabase, reference, reference.before, reference.after);
      manifest.references.push({ ...reference, status: "updated" });
      await writeManifest(manifestPath, manifest);
    }
    const remaining = await fetchReferences(supabase, orgId);
    if (remaining.length > 0) {
      throw new Error(`${remaining.length} legacy reference row(s) remain after rewrite.`);
    }
    await writeManifest(manifestPath, manifest);
    console.log(`Rewrote ${references.length} reference row(s); originals retained for rollback.`);
    return;
  }

  await verifyAllCopies(storage, legacyObjects, orgId, manifest);
  if (references.length > 0) {
    throw new Error(`${references.length} legacy reference row(s) remain; RLS closure is not ready.`);
  }
  await writeManifest(process.env.MANIFEST_PATH, manifest);
  console.log("Cutover verification passed. The fail-closed RLS migration is ready to apply.");
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
