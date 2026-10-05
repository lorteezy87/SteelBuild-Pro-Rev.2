import { sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, IOS_BUILD_NUMBER, IOS_VERSION } = process.env;
if (![ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, IOS_BUILD_NUMBER, IOS_VERSION].every(Boolean)) {
  throw new Error('App Store verification credentials or version are missing.');
}
const now = Math.floor(Date.now() / 1000);
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const input = `${b64({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' })}.${b64({ iss: ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })}`;
const token = `${input}.${sign('sha256', Buffer.from(input), { key: readFileSync(ASC_KEY_PATH), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
async function request(path, method = 'GET', body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`App Store Connect verification returned HTTP ${res.status}.`);
  return res.status === 204 ? {} : res.json();
}
const apps = await request(`apps?${new URLSearchParams({ 'filter[bundleId]': 'com.steelbuildpro.app', limit: '2' })}`);
if (apps.data?.length !== 1) throw new Error('Expected exactly one SteelBuild Pro App Store record.');
let build;
for (let attempt = 0; attempt < 30; attempt++) {
  const results = await request(`builds?${new URLSearchParams({ 'filter[app]': apps.data[0].id, 'filter[version]': IOS_BUILD_NUMBER, include: 'preReleaseVersion', limit: '100' })}`);
  build = results.data?.find(candidate => candidate.attributes.version === IOS_BUILD_NUMBER && results.included?.some(version =>
    version.type === 'preReleaseVersions' && version.id === candidate.relationships?.preReleaseVersion?.data?.id && version.attributes.version === IOS_VERSION));
  if (build) break;
  console.log('Waiting for the uploaded build to appear in App Store Connect.');
  await new Promise(resolve => setTimeout(resolve, 20000));
}
if (!build) throw new Error('Upload receipt is not yet visible. Verify App Store Connect before retrying with a new build number.');
const state = build.attributes.processingState;
if (!['PROCESSING', 'VALID'].includes(state)) throw new Error(`Apple processing state: ${state}.`);
const whatsNew = 'Verify sign-in and project access; offline field progress and replay; drawings and revision reviews; camera upload; CSV/PDF and grouped file sharing; account deletion using disposable staging accounts. Check iPhone and iPad layouts, keyboard editing, light and dark themes. Do not delete a production workspace during testing.';
const localizations = await request(`builds/${build.id}/betaBuildLocalizations`);
const existing = localizations.data?.find(row => row.attributes.locale === 'en-US');
await request(existing ? `betaBuildLocalizations/${existing.id}` : 'betaBuildLocalizations', existing ? 'PATCH' : 'POST', {
  data: {
    type: 'betaBuildLocalizations', ...(existing ? { id: existing.id } : {}),
    attributes: existing ? { whatsNew } : { locale: 'en-US', whatsNew },
    ...(!existing ? { relationships: { build: { data: { type: 'builds', id: build.id } } } } : {}),
  },
});
writeFileSync('ios/App/output/app-store-receipt.json', JSON.stringify({ version: IOS_VERSION, buildNumber: IOS_BUILD_NUMBER, processingState: state, whatToTestUpdated: true }, null, 2) + '\n');
console.log(`App Store Connect confirms build ${IOS_BUILD_NUMBER}: ${state}. What to Test updated. App Review has not been submitted.`);
