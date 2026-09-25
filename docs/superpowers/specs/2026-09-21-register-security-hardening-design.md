# Register and Security Hardening Design

## Goal

Restore a usable Piece Register detail view and prepare the requested security hardening without bypassing shared-environment controls.

## Decisions

- The selected piece's Digital Thread remains an inline, non-modal detail panel above the Register table. It must be bounded, scrollable, responsive, and expose an accessible name.
- The Cloudflare catch-all header moves from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` without changing the existing reviewed source allowlist. The existing header parser test verifies the deployed artifact contract and recalculates inline-script hashes.
- `email-ingest` deployment remains owner-operated, as requested.
- Branch-protection changes, Supabase Auth leaked-password protection, and staging Edge Function deletion are live-control changes. They require current console/API state and cannot be inferred from repository files.
- The requested FK/index/duplicate work requires current catalog definitions and duplicate preflight results. No migration is authored or applied from historical migration text alone.

## Non-goals

- No production or staging database migration, function deletion, Auth configuration change, GitHub ruleset mutation, or deployment in this change set.
- No CSP allowlist expansion without evidence of a required runtime origin.
