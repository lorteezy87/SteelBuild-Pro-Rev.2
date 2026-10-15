# Sites Release Rewire Design

## Decision

Replace the retired production Wrangler publisher with a secure gated handoff
for the existing public ChatGPT Site. GitHub builds and attests the exact
release. An authorized Sites operation saves and deploys that unchanged
artifact. A separate workflow proves the public domains serve that artifact.

## Why this shape

Sites exposes short-lived repository write credentials and authenticated
save/deploy operations; it does not expose a repository-safe durable public
deployment credential for GitHub Actions. Storing or inventing one would weaken
the release boundary. Treating a Git push as a public deployment is also
incorrect because automatic publication is limited to explicit owner-private
windows.

## Flow

`main` -> five required checks -> production build -> Sites archive + manifest
-> authorized Sites save/deploy -> exact-domain verification -> optional
authenticated smoke.

The manifest binds commit, repository, ref, Sites project, archive bytes,
complete static tree, and Vite entry bytes. Production verification consumes
the artifact created by the gated run rather than rebuilding it.

## Failure behavior

- A failed required check creates no production artifact.
- Missing production Vite values fail before build.
- Missing headers or IFC WASM fail before packaging.
- Artifact mutation, wrong commit, wrong Site, or changed static tree fails
  verification.
- A Sites deployment is not accepted until both custom domains serve the exact
  entry asset from the gated artifact.
- Rollback redeploys a recorded saved Sites version; it does not rebuild.

## Non-goals

This change does not alter Supabase, migrations, Edge Functions, staging,
Cloudflare PR previews, or application behavior. It does not claim unattended
Sites publication or hosted acceptance before the explicit promotion occurs.

