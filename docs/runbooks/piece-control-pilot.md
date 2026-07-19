# Piece Control Pilot Runbook

## Purpose

This runbook controls rollout of canonical piece imports, relationships,
release, stations, logistics, dashboard reporting, and 3D status. Legacy flows
remain available throughout shadow and pilot validation.

## Migration order

Apply migrations in timestamp order:

1. `20260718000000_piece_control_slice0.sql`
2. `20260718010000_piece_control_slice1.sql`
3. `20260718020000_piece_control_slice2.sql`
4. `20260718030000_piece_control_slice3.sql`
5. `20260718040000_piece_control_slice4.sql`
6. `20260718050000_piece_control_slice5.sql`
7. `20260718070000_piece_control_slice7.sql`

Do not enable `pilot` or `live` in a migration. Mode changes are project-admin
actions through `set_piece_control_mode`.

## Backup and restore expectations

Before applying migrations to a production environment:

- Confirm the scheduled database backup completed and is restorable.
- Confirm storage backup coverage for model, drawing, shipping-ticket, and POD
  files.
- Record the migration version and deployment identifier.
- Follow `backup-dr.md`, `backup-dr-db.md`, and `backup-dr-storage.md`.
- Do not treat rollback to `shadow` or `off` as a database restore. Mode rollback
  preserves canonical records and only disables canonical behavior.
- A database restore is an incident-response decision and must restore database
  and storage to a mutually consistent point.

This runbook documents expectations only. It does not perform backups,
restores, deployment, or production mode changes.

## Shadow validation

1. Change `off` to `shadow` using the exact confirmation phrase shown in the UI.
2. Import and reconcile representative IFC, CSV, KISS, PowerFab/FabSuite, and
   production sources.
3. Review the pilot readiness report and export its CSV.
4. Resolve invalid/duplicate source rows.
5. Reconcile canonical piece count and known tons against legacy metrics.
6. Link model elements, drawings, and material requirements.
7. Confirm unknown weights are visible and excluded from tonnage percentages.
8. Confirm 3D canonical colors match lifecycle/hold state while unlinked
   elements retain legacy fallback.
9. Review failed-command audits and mode history.

## Pilot enablement

Only a project admin or owner can move `shadow` to `pilot`. The server rejects
the transition unless canonical scope exists, import decisions are clean, and
the six production stations total 100 percent.

Before confirming:

- Export and retain the readiness report.
- Confirm a dedicated pilot work package and approved drawing are available.
- Confirm material receipt provenance is real, not inferred from notes.
- Confirm release-gate blockers are understood.
- Confirm project users know canonical commands are server-mediated and
  physical logistics transitions are irreversible.
- Run the focused E2E suite against the dedicated test tenant.

## Live enablement

Only promote `pilot` to `live` after pilot acceptance. The server additionally
requires active model linkage, drawing/material mapping coverage, and resolved
canonical-versus-legacy metric discrepancies.

Retain the legacy dashboard and reporting comparison until the project manager
signs off on counts, tons, lifecycle, release, production, and logistics.

## Rollback

- Use `pilot -> shadow`, `pilot -> off`, `live -> shadow`, or `live -> off`.
- Enter the exact confirmation phrase.
- Do not delete canonical pieces, events, relationships, station completions,
  releases, or logistics history.
- Legacy rows are not rewritten by mode changes.
- Export the readiness report and capture the mode audit event before and after
  rollback.

## Incident response

1. Stop new canonical mutations by rolling the affected project to `off`.
2. Preserve logs; do not delete command failures or piece events.
3. Export the readiness report and record affected project, command, actor,
   entity IDs, failure ID, and timestamps.
4. Compare canonical and legacy counts/tons and identify the first divergent
   immutable event.
5. Follow `incident-response.md` for severity, ownership, communication, and
   restore decisions.
6. Re-enable `shadow` only after the defect is corrected and scoped validation
   passes.

## Project manager pilot checklist

- Canonical actionable piece scope is complete for the pilot package.
- Import coverage and model-element coverage are understood.
- Invalid marks and duplicate source rows are resolved.
- Unknown weights are corrected or explicitly accepted.
- Required drawings are linked and approved.
- Material mappings and receipt provenance are complete.
- Held pieces and release-gate failures are reviewed.
- Canonical/legacy piece and tonnage discrepancies are resolved or accepted in
  writing.
- Lot splitting, station sequence, release, and logistics were exercised in the
  test tenant.
- Rollback owner and incident contact are identified.

## Project manager live checklist

- Pilot checklist remains satisfied.
- Pilot work packages completed release through erection without unexplained
  audit failures.
- Dashboard and 3D outputs match canonical lifecycle events.
- All active model elements required for reporting are linked.
- Legacy comparison shows no meaningful unexplained count or tonnage delta.
- Readiness CSV and pilot acceptance are retained with project records.
- Project admin enters the explicit `pilot -> live` confirmation; no automated
  process enables live mode.

