# SteelBuild Pro Trust Recovery Design

**Date:** 2026-08-15

**Repository:** `lorteezy87/SteelBuild-Pro-Rev.2`

**Status:** Approved direction, pending written-spec review

## Objective

Restore confidence in the new-user workflow and the RFI, project-health, and Field Today surfaces by making labels match the data authority behind them. Portfolio mode must aggregate real records, health must not contradict known operational exceptions, and a daily plan must not silently become an overdue backlog.

## Evidence and Root Causes

The live account exists and is confirmed, but has no successful password sign-in, organization membership, project membership, or pending workspace invitation. A later Auth invitation failed because the address already existed, and a repeated signup returned a privacy-preserving success response without replacing the existing password. The product currently exposes separate auth-user, organization-invitation, and project-membership workflows without one end-to-end state model.

The RFI page disables its RFI and work-package queries when `useProjectId()` returns `null` for portfolio mode. Empty arrays are then summarized as genuine zeros even though the live portfolio contains RFIs.

Project health is drawn from multiple independent authorities: the manually stored `projects.health_status`, a dashboard score that omits RFIs, and separate overdue counters. The affected project is stored as `On Track` while containing overdue RFIs and overdue leaf schedule tasks.

Field Today uses `tasksForToday()` as both the daily plan and the recovery queue. That helper intentionally includes every overdue task, every undated task, and near-future work, then sorts the oldest overdue tasks first. Completed tasks are removed before `completedToday` is calculated, forcing that KPI to zero.

## Approaches Considered

### 1. Copy-only corrections

Rename stored health to “PM Health,” rename Field Today to “Current + Backlog,” and explain that portfolio zeros mean no project is selected. This is low risk but preserves the underlying contradictions and does not meet the trust goal.

### 2. Local page patches

Fix each page independently: load all RFIs in portfolio mode, special-case health labels on the RFI page, and exclude overdue tasks from Field Today. This is faster, but creates more competing calculations and leaves the account workflow fragmented.

### 3. Canonical trust primitives — recommended

Introduce small, tested domain helpers for portfolio scope, operational health, and field-plan buckets, then make the affected pages consume them. Consolidate user onboarding around the Team workspace invitation path and turn legacy User Management into a compatibility entry point rather than a second authority. This is the selected approach because it repairs the causes and provides reusable acceptance tests.

## Design

### A. Canonical user onboarding

The Team page is the only supported place to add a workspace user. Creating an auth record directly is not treated as membership. The workflow is:

1. An owner or admin creates an `organization_invitations` row from Team.
2. The UI copies the workspace invitation link and clearly states that the link must be sent to the recipient; it must not claim an email was sent.
3. The recipient opens that link and either signs in, creates an account, or resets an existing password without losing the `?invite=` token.
4. After authentication, `OrgOnboarding` validates the invitation email and calls the existing `accept_invitation` RPC.
5. The resulting organization membership becomes the workspace authority. Project access remains a separate, explicit assignment after workspace acceptance.

The legacy system-admin User Management route will become a compatibility redirect to Team. System-account diagnostics are not part of this release; the product will no longer present `user_profiles` rows as if they were onboarded workspace users.

Repeated signup must use neutral language. When Supabase returns a user with no identities, the result is treated as an existing/obfuscated account response: the UI will say that the address may already have an account and offer both **Sign in** and **Reset password**. A newly created user with an email identity and no session retains the confirmation-email message.

The current production account is not mutated by this code change. Operational recovery is a password reset followed by a valid Team invitation link to the intended workspace.

### B. RFI portfolio aggregation

RFI data loading will have two explicit modes:

- **Project mode:** filter RFIs and work packages by the selected project ID.
- **Portfolio mode:** list RFIs across active, non-deleted, non-held projects and filter child rows through the active project ID set.

`All Projects` will summarize the loaded portfolio rows. It must never translate “query not executed” into numeric zero. Loading and query errors retain their existing error surfaces.

The portfolio hero will identify itself as portfolio context. Project-only health and percent-complete values will not be presented as if they describe one project. Create, import, edit, and bulk mutation actions that require one project will require explicit project selection.

### C. Canonical operational health

Add a pure `deriveOperationalHealth()` helper with one ordered severity model:

- `On Hold` remains a distinct terminal state.
- Stored `At Risk` is never improved automatically.
- Stored `Watch` is never improved automatically.
- Any overdue RFI or overdue leaf schedule task prevents `On Track` and produces at least `Watch`.
- Any critical overdue RFI, three or more overdue RFIs, or five or more overdue leaf schedule tasks produces `At Risk`.
- With no overdue evidence, the stored assessment remains the result.
- If required evidence was not loaded, the result declares itself partial rather than silently assuming zero.

The helper returns the effective label, severity, whether evidence is partial, and concise reasons such as `2 overdue RFIs` or `6 overdue schedule tasks`. Dashboard scoring may retain its percentage, but the displayed label and score band are capped by operational severity so a numeric score cannot say `Good` when the operational result is `Watch` or `At Risk`.

RFI, Dashboard, Projects, and Field Today will use the same helper whenever they display project health. Stored `health_status` remains the PM assessment input, not a competing display authority.

### D. Field Today versus Recovery Backlog

Replace the overloaded `tasksForToday()` output with a pure partition:

- **Today plan:** incomplete leaf tasks due today, or tasks with a real start date on/before today whose end date is absent or on/after today.
- **Recovery backlog:** incomplete leaf tasks whose end date is before today.
- **Unscheduled/planning gap:** incomplete leaf tasks with no start date and no past-or-today end date, because the data cannot prove they are active today.
- **Upcoming:** incomplete leaf tasks starting after today, with the existing seven-day lookahead available as a separate queue.

“Today’s Tasks” and “Today’s Plan” use only the Today plan. Recovery, undated, and upcoming work receive separate counts or panels and cannot inflate the today KPI. The recovery queue sorts oldest overdue first, preserving the useful escalation behavior without mislabeling it.

“Completed Today” must be evidence-based. Schedule tasks do not currently contain a completion timestamp, so the KPI will display `Unavailable`/`—` with an explanatory label until a real completion date source exists. It will not calculate zero from a set that already excludes completed work.

### E. Error and trust-state behavior

- No-data and unavailable-data are distinct states.
- Portfolio queries filter to visible active projects before aggregation.
- Partial health evidence is labeled partial.
- Mutations requiring a project are unavailable in portfolio mode.
- Invite messaging distinguishes `link created`, `email sent`, `account exists`, and `membership accepted`.

## Testing Strategy

All behavior changes follow red-green-refactor tests.

1. RFI page/query helper: portfolio mode loads and scopes all active-project RFIs; project mode remains filtered; unavailable data does not become zero.
2. Operational health helper: overdue evidence caps `On Track`, thresholds produce `At Risk`, stored worse states remain worse, and missing evidence is partial.
3. Dashboard and Projects derivations: displayed health uses the canonical result and includes its reasons.
4. Field partition: overdue, today, active-window, undated, upcoming, completed, deleted, summary, and parent rows land in exactly one expected bucket.
5. Field UI summary: today count excludes backlog; recovery count is separate; completed-today is unavailable without evidence.
6. Auth/onboarding UI: repeated-signup copy is neutral, invite tokens survive auth mode changes, and legacy User Management sends membership work to Team.
7. Existing focused suites, full unit tests, type checks, lint, production build, and authenticated browser acceptance are run before completion.

## Acceptance Criteria

- In All Projects, the RFI totals equal the sum of visible active projects and do not render false zeros.
- A project with overdue RFIs or overdue schedule tasks cannot display effective health `On Track`.
- The affected project resolves to `At Risk` from its current live evidence and explains why.
- Field Today does not show 7/23–8/1 backlog tasks in Today’s Plan on 8/15; those tasks appear in Recovery Backlog.
- Today’s Tasks counts only tasks due today or active in a dated window containing today.
- Completed Today does not display a fabricated zero.
- A new recipient follows one workspace invitation path from Team through authentication to organization membership.
- An existing-but-unusable account is guided to password reset without a false confirmation-email promise.
- No production database mutation is required for the code implementation.

## Out of Scope

- Automatically assigning every workspace member to every project.
- Replacing Supabase Auth.
- Adding a new schedule-task completion-event schema in this release.
- Recalculating or overwriting stored `projects.health_status` rows.
- Sending the password reset or accepting the workspace invitation for the currently affected account.
