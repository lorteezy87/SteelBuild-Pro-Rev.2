// Synthetic fixture only. Credentials are supplied by the operator's secret store.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const url = process.env.STAGING_SUPABASE_URL;
if (url !== 'https://ndyfjffsulfbwpmwdmic.supabase.co') {
  throw new Error('This seed only runs against the approved staging branch');
}
const password = process.env.STAGING_E2E_PASS;
const email = 'staging.pm@steelbuild-pro.invalid';
if (!password || password.length < 24) throw new Error('Supply a random staging password of at least 24 characters');
if (!process.env.STAGING_SERVICE_ROLE_KEY || !process.env.STAGING_ANON_KEY) throw new Error('Staging API keys are required');

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.STAGING_SERVICE_ROLE_KEY, options);
const client = createClient(url, process.env.STAGING_ANON_KEY, options);
const requireResult = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const bucketConfig = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const mimeBlock = bucketConfig.match(/\[storage\.buckets\.app-files\][\s\S]*?allowed_mime_types\s*=\s*\[([\s\S]*?)\]/);
if (!mimeBlock) throw new Error('App-files MIME configuration is missing');
const mimeTypes = [...mimeBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const buckets = requireResult(await admin.storage.listBuckets());
for (const [name, fileSizeLimit, allowedMimeTypes] of [
  ['app-files', 50 * 1024 * 1024, mimeTypes],
  ['email-attachments', 25 * 1024 * 1024, undefined],
]) {
  const settings = { public: false, fileSizeLimit, allowedMimeTypes };
  requireResult(await (buckets.some((bucket) => bucket.name === name)
    ? admin.storage.updateBucket(name, settings)
    : admin.storage.createBucket(name, settings)));
}
const users = requireResult(await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).users;
const existingUser = users.find((user) => user.email === email);
if (!existingUser) {
  requireResult(await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: 'Staging PM', purpose: 'steelbuild-pro-staging-e2e' },
  }));
}
requireResult(await client.auth.signInWithPassword({ email, password }));
const organizations = requireResult(await client.from('organizations').select('id,slug').eq('slug', 'staging-fixture'));
const org = organizations[0] ?? requireResult(await client.rpc('create_organization', {
  p_name: 'Example Fabrication (staging)', p_slug: 'staging-fixture',
}));
const projects = requireResult(await client.from('projects').select('id').eq('org_id', org.id).eq('project_number', 'STG-0001'));
const project = projects[0] ?? requireResult(await client.rpc('create_project', { project_data: {
  name: 'STAGING — Warehouse Expansion', project_number: 'STG-0001', org_id: org.id,
  client: 'Fixture Client LLC', general_contractor: 'Fixture GC Inc.',
  phase: 'Detailing', contract_type: 'Lump Sum', original_contract_value: 1850000,
} }));
const sets = requireResult(await client.from('drawing_sets').select('id').eq('project_id', project.id).eq('set_name', 'STG Erection Drawings'));
const set = sets[0] ?? requireResult(await client.from('drawing_sets').insert({
  project_id: project.id, set_name: 'STG Erection Drawings', discipline: 'Structural', is_locked: false,
}).select('id').single());
for (const [sheet_number, title] of [['E-101', 'Anchor Bolt Plan'], ['E-102', 'Column Schedule'], ['E-201', 'Framing Plan']]) {
  const sheets = requireResult(await client.from('drawings').select('id').eq('drawing_set_id', set.id).eq('sheet_number', sheet_number));
  if (!sheets.length) requireResult(await client.from('drawings').insert({
    project_id: project.id, drawing_set_id: set.id, sheet_number, title,
  }));
}
const submittals = requireResult(await client.from('submittals').select('id').eq('project_id', project.id).contains('drawing_set_ids', [set.id]));
if (!submittals.length) {
  const sequence = requireResult(await client.rpc('get_next_sequence_number', { p_project_id: project.id, p_record_type: 'submittal' }));
  const submittal = requireResult(await client.from('submittals').insert({
    project_id: project.id, submittal_number: String(sequence), title: 'Staging erection drawings', drawing_set_ids: [set.id],
  }).select('id').single());
  requireResult(await client.from('drawing_sets').update({ current_submittal_id: submittal.id }).eq('id', set.id));
}
await client.auth.signOut();
console.log(JSON.stringify({ orgId: org.id, projectId: project.id, drawingSetId: set.id, email }));
