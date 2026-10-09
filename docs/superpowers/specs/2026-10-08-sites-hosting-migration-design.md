# SteelBuild Pro Sites Hosting Migration Design

Date: 2026-10-08

## Purpose

Migrate the existing SteelBuild Pro production frontend from Cloudflare Workers to Sites without rebuilding the product or changing its production data plane. The Sites-hosted application must preserve the current Vite/React experience and continue using the existing production Supabase project for authentication, organizations, projects, storage, row-level security, RPCs, Edge Functions, and billing workflows.

Success means the existing application builds and runs through Sites, its browser routes and public assets resolve correctly, authenticated Supabase workflows continue to target the current production backend, and the deployment can replace the existing public frontend while retaining a practical rollback path.

## Scope

### Included

- Register the existing SteelBuild Pro checkout as a Sites project.
- Preserve the current Vite/React application architecture and production build.
- Add the minimum Sites identity, packaging, SPA routing, and runtime configuration needed for hosting.
- Keep the existing production Supabase project and its data unchanged.
- Validate routes, authentication entry points, configuration, assets, and the production build.
- Publish through Sites and proceed with the production cutover after successful deployment verification.
- Retain the current Cloudflare deployment configuration until the replacement is confirmed, so rollback remains possible.

### Excluded

- Rebuilding the frontend in a new framework or Sites starter.
- Database schema changes or migration application.
- Changes to Supabase RLS, storage policies, Edge Functions, or Stripe logic.
- Product redesign, feature additions, or unrelated refactoring.
- Deleting the Cloudflare deployment before the Sites replacement is verified.

## Architecture

Sites hosts the compiled React single-page application. Vite remains the build system and the existing output remains the deployable frontend artifact. Browser navigation must fall back to the SPA entry point so deep links, invitations, password resets, and application routes continue to load.

The current production Supabase project remains the system of record and security boundary. The browser continues to use the public Supabase configuration, while sensitive operations stay behind RLS and authenticated Edge Functions. Stripe and server-side integrations remain where they are; no service-role key or other privileged credential is introduced into the frontend or committed to source control.

The migration is hosting-only. Sites-specific changes should be isolated to `.openai/hosting.json` and the smallest necessary build or routing compatibility files. Existing product code and dependencies are preserved unless a verified Sites incompatibility requires a targeted correction.

## Deployment Flow

1. Record a scoped collaboration claim without absorbing other agents' edits.
2. Register one new private Sites project and persist only its project identity and supported hosting configuration.
3. Configure Sites runtime values from the existing public frontend configuration without committing secrets.
4. Run the repository checks required by its contributor contract, followed by the normal Vite production build.
5. Package, save, and deploy the verified build through the Sites workflow.
6. Confirm the Sites deployment reaches a successful state and returns its canonical URL.
7. Proceed with the production-domain cutover when supported by the available Sites controls; if an account or DNS action cannot be automated, report the exact remaining action.
8. Keep the prior Cloudflare deployment recoverable until the replacement is confirmed.

The user explicitly authorized proceeding through deployment and cutover without waiting for a manual preview review. This removes a preview approval pause but does not weaken build, security, or deployment verification.

## Configuration and Security

- Production Supabase URL and public browser key are supplied through the supported Sites runtime configuration path.
- Privileged keys, credentials, user data, and local environment files are never committed or packaged.
- Existing Supabase Auth, RLS, Storage, RPC, and Edge Function controls remain authoritative.
- Missing required public configuration must fail visibly during validation or startup rather than silently selecting another backend.
- Sites registration stores only supported identity and hosting fields in `.openai/hosting.json`.

## Failure Handling and Rollback

- A build or validation failure stops publication and leaves the current Cloudflare release serving production.
- A Sites packaging, save, or deployment failure is reported without changing the public domain.
- A deployment is considered verified only when Sites reports success and provides the deployment URL.
- The Cloudflare configuration is not removed as part of the initial migration. If the Sites release or domain cutover fails, traffic can remain on or return to the existing release.
- Any custom-domain step that requires user-owned DNS or account access is isolated as the final handoff action after the Sites deployment succeeds.

## Verification

Verification is proportional to a production hosting migration and includes:

- repository lint and TypeScript gates required by the contributor contract;
- the no-new-JavaScript ratchet;
- the Vitest suite, with targeted route or configuration coverage if compatibility code changes;
- the normal Vite production build;
- checks that SPA deep links, auth callback/reset paths, public assets, and service-worker behavior are compatible with the Sites artifact;
- confirmation that no privileged environment values enter tracked files or the deployment archive; and
- successful Sites deployment status with a returned URL before any production-domain action.

Existing unrelated failures must be distinguished from migration regressions and reported with evidence. The migration will not modify unrelated product areas to make broad checks pass.

## Concurrent Work Constraints

The active checkout contains extensive work owned by other sessions. This migration must preserve all of it, avoid files covered by open claims, stage files explicitly, and commit only migration-owned changes. If Sites compatibility requires touching a claimed product or build file, work pauses for coordination instead of overwriting concurrent edits.
