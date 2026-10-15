# ChatGPT Sites Production Release

SteelBuild Pro production is the public ChatGPT Site pinned by
`.openai/hosting.json`. `steelbuild-pro.com` and `www.steelbuild-pro.com` route
to that Site. The legacy Cloudflare Worker is not the production publisher.

GitHub deliberately does not hold a reusable Sites publishing credential.
Sites source credentials are short lived, and public publication requires an
authorized Sites operation. The release is therefore a gated two-stage flow:

1. GitHub proves the source and produces an immutable release handoff.
2. An authorized operator promotes exactly that handoff through Sites and
   verifies that both public domains serve its exact entry asset bytes.

## 1. Prepare the release in GitHub

A push to `main` runs `prepare-sites-release` only after these jobs pass:

- `ci`
- `secret-scan`
- `supabase-drift`
- `edge-typecheck`
- `commercial-postgres`

The job builds with the production browser-safe Supabase URL and anon key,
packages `.openai/hosting.json` plus `dist/`, and uploads
`sites-production-<full-sha>`. The artifact contains:

- `steelbuild-sites-<full-sha>.tar.gz`
- `sites-release-manifest.json`

The manifest binds the repository, branch, source SHA, Sites project ID,
archive checksum and size, complete `dist/` tree digest, and exact Vite entry
asset path and checksum. The job does not deploy anything.

Record the successful workflow run ID and full SHA. Never promote an artifact
from a run whose required job was skipped, cancelled, or failed.

## 2. Verify the downloaded handoff

Download the named artifact from the successful run without renaming either
file. From an exact checkout of the recorded SHA:

```powershell
New-Item -ItemType Directory -Force release\extracted | Out-Null
tar -xzf release\steelbuild-sites-<full-sha>.tar.gz -C release\extracted
npm ci
npm run sites:release:verify -- --archive release\steelbuild-sites-<full-sha>.tar.gz --manifest release\sites-release-manifest.json --repository-root release\extracted --commit <full-sha>
```

Any checksum, project, commit, asset, or tree mismatch stops the release. Do
not rebuild locally to make the check pass; return to the GitHub artifact.

## 3. Promote through Sites

Use the Sites connector from an authorized account:

1. Read `.openai/hosting.json` and copy its opaque `project_id` exactly. Do not
   create another Site.
2. Confirm the current Site and audience. Preserve that audience.
3. Confirm the Site source branch points at the recorded full SHA. If it does
   not, mint a short-lived repository write credential, push that exact commit,
   and discard the credential. Never store its token in GitHub, a file, shell
   history, or documentation.
4. Save a Site version with the recorded `commit_sha` and the absolute path to
   the unchanged downloaded tar archive.
5. Confirm the saved version reports the same commit and record its version ID,
   version number, archive content hash, and file count.
6. Deploy that saved version. Record the deployment ID and wait for `succeeded`.

Every Sites deployment URL is production. Do not use a preview or private
deployment operation for this public Site, and do not change custom domains or
access policy as part of a normal release.

## 4. Verify production

Dispatch `.github/workflows/sites-production-verify.yml` from `main` with:

- `release_run_id`: the GitHub run that created the artifact
- `release_sha`: the exact full SHA deployed by Sites

The workflow downloads the named artifact from that run, re-verifies its
checksum and contents, then requires both public domains to serve the archive's
exact hashed Vite entry asset bytes. HTTP 200 by itself is not success. If
`E2E_ENABLED=true`, authenticated Playwright smoke runs only after the exact
asset check succeeds.

Release evidence is complete only when all of these are recorded together:

- source SHA and successful five-gate run
- artifact name and manifest archive checksum
- Sites version ID/number and deployment ID
- successful exact-domain verification run
- authenticated smoke result when enabled

## Rollback

Select the previously recorded known-good saved Sites version and deploy that
version through Sites. Do not rebuild an old branch and call it a rollback.
Then verify against that version's retained GitHub artifact and record the new
rollback deployment ID. Database and Edge Function rollback are separate
decisions; a frontend rollback does not authorize either one.

