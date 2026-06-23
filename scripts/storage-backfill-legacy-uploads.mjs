// ─────────────────────────────────────────────────────────────────────────
// Storage backfill: copy legacy FLAT `uploads/<file>` objects in the
// `app-files` bucket to org-scoped `<founding_org_id>/uploads/<file>` paths.
//
// ⚠️  REVIEW BEFORE RUNNING. Default is DRY_RUN — it lists what WOULD copy and
//     changes nothing. This script ONLY copies storage objects (it never
//     deletes originals and never touches the database), so it is reversible:
//     the legacy objects remain until you cut the RLS policy in a later step.
//
// This is step (2) of the multi-tenant storage backfill. See the runbook in
// docs/HANDOFF-2026-06-22-gtm-batch.md for the full sequence:
//   (1) copy objects   ← THIS SCRIPT (DRY_RUN first, then for real)
//   (2) backfill the 14 DB file_url columns (reviewed SQL, run via MCP/SQL)
//   (3) verify a sample of signed URLs resolve on the new paths
//   (4) cut the legacy 'uploads/' RLS branch (migration)
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/storage-backfill-legacy-uploads.mjs
//   (add APPLY=1 to actually copy; otherwise it's a dry run)
//   (optional FOUNDING_ORG_ID=<uuid> to skip the RPC lookup)
//
// REQUIREMENTS: the service-role key (NOT the anon key). Never commit it; pass
// it via env at run time only.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'app-files'
const LEGACY_PREFIX = 'uploads/' // flat namespace that predates org-prefixing
const APPLY = process.env.APPLY === '1'
const PAGE = 200

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(2)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

async function resolveFoundingOrgId() {
  if (process.env.FOUNDING_ORG_ID) return process.env.FOUNDING_ORG_ID
  // Mirrors the founding_org_id() RPC the RLS grandfather branch uses.
  const { data, error } = await supabase.rpc('founding_org_id')
  if (error || !data) {
    throw new Error('Could not resolve founding_org_id via RPC: ' + (error?.message || 'no data'))
  }
  return data
}

async function listLegacyObjects() {
  // storage.list() pages within a "folder" — list the LEGACY_PREFIX folder.
  const out = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(LEGACY_PREFIX.replace(/\/$/, ''), { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error('list failed: ' + error.message)
    if (!data || data.length === 0) break
    for (const obj of data) {
      // Skip "folders" (entries with no id are prefixes, not objects).
      if (obj.id == null) continue
      out.push(`${LEGACY_PREFIX}${obj.name}`)
    }
    if (data.length < PAGE) break
    offset += PAGE
  }
  return out
}

async function main() {
  const foundingOrgId = await resolveFoundingOrgId()
  console.log(`Founding org id: ${foundingOrgId}`)
  console.log(`Mode: ${APPLY ? 'APPLY (copying)' : 'DRY RUN (no changes)'}`)

  const legacy = await listLegacyObjects()
  console.log(`Found ${legacy.length} legacy flat object(s) under "${LEGACY_PREFIX}".`)

  let copied = 0
  let skipped = 0
  let failed = 0
  for (const src of legacy) {
    const filename = src.slice(LEGACY_PREFIX.length)
    const dest = `${foundingOrgId}/uploads/${filename}`
    if (!APPLY) {
      console.log(`would copy: ${src}  ->  ${dest}`)
      continue
    }
    const { error } = await supabase.storage.from(BUCKET).copy(src, dest)
    if (error) {
      // Idempotent: a pre-existing destination from a prior partial run is fine.
      if (/exists/i.test(error.message)) {
        skipped++
      } else {
        failed++
        console.error(`FAILED ${src} -> ${dest}: ${error.message}`)
      }
      continue
    }
    copied++
    if (copied % 50 === 0) console.log(`  …copied ${copied}`)
  }

  console.log(
    APPLY
      ? `\nDone. copied=${copied} skipped(existing)=${skipped} failed=${failed}. ` +
          `Originals were NOT deleted (reversible). Next: backfill the 14 DB file_url columns, verify, then cut the legacy RLS branch (see the runbook).`
      : `\nDry run complete — ${legacy.length} object(s) would be copied. Re-run with APPLY=1 to perform the copy.`,
  )
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
