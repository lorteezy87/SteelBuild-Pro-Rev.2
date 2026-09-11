# SteelBuild Pro — module-by-module master build prompt

**Revision:** 2026-09-11 · expanded SteelBuild Sheets drawing-system edition

> Paste this entire document into your coding agent. The assignment is to build
> SteelBuild Pro in the exact sequence below, completing and verifying ONE module
> before starting the next. This document is a target specification, not a claim
> that the existing application already satisfies every requirement.
>
> Begin with M0. If resuming an existing implementation, inspect its completion
> ledger and verify the last completed module against the current commit before
> choosing the next. Do not replace an existing application simply because this
> prompt uses the word “recreate.” Establish the target checkout first.

**Goal:** A dependable structural-steel operations system whose drawings, approvals,
blockers, fabrication release, piece lots, schedule, field progress, and financial
records agree about the same project.

**Architecture:** React/TypeScript SPA with a Supabase data layer. PostgreSQL owns
identity, relationships, authorization, constraints, transactional transitions and
audit. Read models compose these authorities without inventing new status writers.

**Reference priority:** The user's explicit decisions; this revised specification;
verified current Rev 2 domain contracts; observed SteelBuild Sheets interactions;
older descriptions. Report an actual conflict before implementing a conflicting
business rule. Do not copy a historical bug to achieve visual similarity.

## 1. Execution contract

### 1.1 Exactly one active module

A module is a complete vertical feature: permitted database operations, a usable
screen, real reads and writes, navigation, validation, access control, tests, and
observable failures. A schema-only migration, attractive mockup, static dashboard,
or page with nonfunctional buttons is not a completed module.

Use the ordered module cards in §12. Decimal IDs are real modules, not parallel
workstreams: M3 → M3.1 → M3.2 and so forth. Complete them in the listed order.
The original M0–M35 numbering is retained; large entries now contain explicit,
sequential submodules so a suite cannot hide several unfinished features.

1. Inspect the current module's prerequisites, repository instructions and active
   work claims. Preserve others' changes; use an isolated branch when needed.
2. State the module's user outcome and exact scope in one paragraph.
3. Trace existing authorities before adding a table, status, writer or calculation.
4. Record an executable acceptance checklist and representative fixtures.
5. Implement and validate this module only. Resolve its defects before moving on.
6. Demonstrate its real user flow, including failure and unauthorized attempts.
7. Commit the bounded change and record evidence in the completion ledger.
8. Advance automatically once the module is verified, unless the user asked for a
   checkpoint or an unresolved decision genuinely changes the business contract.

Do not ask for routine permission after every file or test. Never interpret silence,
a timer, an automated notification or a passing build as deployment approval.
Production deployment, destructive migration and external communications follow the
user's actual authorization. Complete the reviewable work before requesting any
required approval.

### 1.2 No building ahead; no fake dependencies

An earlier module cannot depend on a later module's UI, table, RPC, AI gateway,
email connector or undocumented side effect. Do not create a foreign key to a table
that does not exist. Do not expose a later module's button backed by a toast or stub.

If a later integration is optional, omit that capability from the current module's
acceptance scope and record a precise integration contract assigned to the later
module. The later module owns the additive migration and integration tests. If the
dependency is essential, stop and propose a corrected order; do not label a broken
flow “done.” Technical primitives required now belong to the current module.

Examples:
- M3 extraction must work without the M24 AI gateway; manual correction completes
  the early workflow. AI assistance is added in M25.
- M13 offline field capture works with daily logs and photos. Offline punch creation
  is added and verified in M14, after the punch table and authority exist.
- M3.6 offers a tested shop/GC picker. M6 implements its RFI integration later.
- Basic route/permission gating is M0–M2 infrastructure. M21 adds configurable
  flags; modules are never publicly exposed pending a future security module.

### 1.3 Completion ledger and gate

Maintain `docs/build/MODULE_STATUS.md` with one row per module:

| Module | State | Commit | Schema evidence | Logic/API evidence | Browser flow | Remaining blocker |
|---|---|---|---|---|---|---|
| M0 | not_started | — | — | — | — | — |

States: `not_started`, `active`, `blocked`, `verified`. Exactly one may be `active`.
A module is `verified` only when all applicable evidence below is recorded. A
claimed exception must say why a check is inapplicable; “not tested” is not a pass.

- [ ] Requirements and boundaries implemented; no required placeholder controls.
- [ ] Migrations replay on a disposable database and upgrade the previous module.
- [ ] Constraints, RLS, privileges and transactional RPC behavior tested with at
      least two tenants and the relevant authorized/unauthorized roles.
- [ ] Private files cannot be read using another tenant's identifiers or URLs.
- [ ] All list reads are complete or explicitly paginated; errors and unloaded
      data cannot become a successful zero count.
- [ ] Mutation retries do not create duplicates; conflicts preserve the user's
      draft and require a deliberate resolution.
- [ ] Logic tests cover positive, negative and boundary cases; interaction tests
      exercise the real feature rather than only asserting its implementation.
- [ ] Lint, TypeScript, retained JS check, strict-null and implicit-any gates,
      no-new-JS check, tests and production build pass. Never expand ignore lists.
- [ ] Real browser entry through navigation, primary action, persisted reload,
      denied action, failure recovery, project switch, keyboard use and responsive
      layout are demonstrated. Fixture and authenticated staging evidence are
      reported separately.
- [ ] No relevant runtime errors, framework overlays, inaccessible primary actions
      or unreviewed regression against already completed modules.
- [ ] Independent review or a documented focused self-review addresses correctness,
      permissions, dependencies and the module's acceptance contract.
- [ ] Commit/PR and evidence are recorded. Production status is reported separately.

A CI runner that never starts is a blocked gate, not a code-test failure and not a
passing check. Do not bypass the gate. Do not call a module production-verified
because local tests or an unauthenticated landing page passed.

## 2. Product and technical foundation

Build for PMs, detailing coordinators, shop supervisors and field crews. Favor dense,
legible registers, clear ownership, due dates, reasons, source records and next
permitted actions. Do not make users infer whether “approved,” “held,” “issued” and
“released” mean the same thing. They do not.

| Layer | Target |
|---|---|
| Frontend | Vite, React 18, TypeScript; new application code is `.ts`/`.tsx` |
| Routing | React Router, lazy modules, a single route/nav catalog |
| Server state | TanStack Query; scoped keys include project/org, filters and the identity of the resource being read |
| Validation | Typed domain validators and Zod at input boundaries |
| Components | Existing design-system and local Radix primitives; preserve the repository's modal conventions |
| Styling | CSS custom-property tokens; light and dark themes; Tailwind as compatibility layer |
| Large lists | Virtualized rows or explicit server pagination; bounded complete reads for authoritative calculations |
| PDF | Version-pinned pdf.js + matching worker; private Storage object references |
| IFC | Version-pinned web-ifc + matching WASM and Three.js, lazily loaded |
| Database | Supabase PostgreSQL, RLS, authenticated RPCs, constraints and audit |
| Server integrations | Supabase Edge Functions; external-provider credentials remain server-side |
| CI/deployment | Follow verified repository configuration; Rev 2 currently defines CI-gated Cloudflare Workers publishing |
| Mobile | Responsive web from the first module; Capacitor packaging after core acceptance |
| Telemetry | Structured errors and operational audit from M0; managed telemetry expansion in M23 |

Use the selected repository's lockfile for exact versions. Do not silently upgrade
major versions during a module. A package name or API in this prompt is not a reason
to ignore the installed version's documentation.

The browser holds only a public Supabase client key and the user's session.
Database access requires RLS **and** appropriate grants; transitions also require
constraints, role checks and transactional RPCs. RLS alone does not make arbitrary
client updates or forged tenant relationships safe. No service-role, Stripe, email,
LLM or backup secret goes into `VITE_*`, source control, screenshots or client logs.

Preserve Rev 2's domain repositories and API barrel in an existing checkout.
Components should call hooks/repositories, not scatter raw writes through the UI.
A repository may use the scoped Supabase client; do not force every operation into
a generic CRUD API when the operation needs a domain transaction.

For a new build, use a new development Supabase project and disposable test data.
Do not reuse the reference project's production credentials or apply this target
schema to production as part of writing or executing the prompt.

## 3. Data authority and invariants

| Concern | Authority | Must not be substituted with |
|---|---|---|
| Tenant membership/access | Auth identity + org/project memberships and DB checks | Selected project in browser state |
| Official record number | Atomic server allocator + uniqueness constraint | Client `max + 1`, count or random formatting |
| Sheet identity | Stable sheet ID within a project/register namespace | File name, array index or revision label |
| Revision identity | Immutable revision ID, ordered history and current pointer | Overwriting a URL on the sheet |
| Approval workflow | Governing submittal round, sheet responses, comment dispositions | PDF existence or a free-form sheet stage |
| Sheet blocker | Active `drawing_holds` record and its audit | Set edit lock or color alone |
| Set edit lock | Authorized lock state and DB write barrier | Fabrication approval |
| Fabrication release | Server gate + immutable release event/snapshot | “Approved” badge or latest transmittal |
| Piece lifecycle | Canonical actionable leaf lots and protected RPCs | Imported legacy fab status or inferred 3D color |
| Schedule dates/duration | Agreed date convention, calendar and validated atomic schedule writes | Mixed exclusive/inclusive arithmetic |
| Financial totals | Versioned contract/SOV/approved CO facts and exact cent arithmetic | Formatted floats or a hand-edited dashboard total |
| External delivery | Provider receipt/outbox attempt state | Creating a transmittal row |

Official numbers must be unique and safely allocated under concurrency. Do not
promise gap-free numbering: cancellation, rollback, allocation retries and voids may
leave gaps. Preserve auditability and never reuse an issued number.

Use immutable IDs and enforce same-project relationships in the database. A foreign
key that proves only “the other ID exists” does not prove it belongs to this project.
For polymorphic shop/GC links, use explicit typed associations and exactly-one-target
constraints; do not store an unchecked arbitrary table name and UUID.

Archive editable business records where appropriate. Hold events, issued document
snapshots and release/audit history are retained records with domain-specific
lifecycle rules; do not add a universal soft-delete UI to them. A deleted or
superseded record cannot satisfy a current release requirement.

Null, unavailable, disabled, failed, stale and zero are different states. Every
operational aggregate must identify its scope and evidence readiness. “All Projects”
must aggregate authorized projects or clearly require selection; it must never
accidentally display one selected project's numbers or fake zeros.

## 4. Auth, roles, permissions and change safety

Keep three role layers distinct: platform administrator, workspace owner/admin/member,
and project-specific admin/PM/detailer/fab/field/viewer. Map existing role spellings to
one tested rank/permission service; role labels in this prompt do not create new DB
enum values by themselves.

Resolve the current workspace with explicit loading/error/ready states. A cached
workspace can keep its identity visible during a refresh failure, but must not
acquire new access or enable unsafe writes. Never implement authorization “fail-open.”
A missing membership query result is not proof the user needs to create a new org.

| Operation | Minimum target permission |
|---|---|
| View project sheets, history and valid private file links | Authorized project reader |
| Upload/edit draft sheet metadata, propose title-block values | Project detailer or stronger, within unlocked scope |
| Record internal markup | Authorized project author, revision editable |
| Transmit formal submittal, record authorized response, issue record copy | PM or explicitly delegated document controller |
| Place/release sheet hold | PM/admin or an explicitly granted hold-management permission |
| Lock/unlock set, exceptional administrative repair | Project admin, with recorded reason |
| Request/record fab release | Existing release role and server gate; override requires explicit override permission |
| Ship/deliver/erect canonical lots | Existing logistics role and lifecycle guards |
| Read audit | Authorized project reader; sensitive personal fields restricted as needed |
| Edit/delete issued history or audit | No ordinary client operation |

Membership and project relationships are verified inside sensitive RPCs. Actor IDs,
server timestamps and role-at-action are assigned from the authenticated session;
client-supplied display names are snapshots, never proof of identity.

Use request IDs for retryable operations and expected record versions for concurrent
edits. Replay of one completed request returns its original result; it must not
allocate a second number, issue twice, release a different hold, or send twice.

If preserving the existing repo, honor its no-`<form>`/no-Radix-Dialog rules. Supply
keyboard submit, cancel, labels, focus trapping/restoration and visible validation
through approved primitives. Do not confuse preserving those conventions with
omitting accessible keyboard interactions.

## 5. SteelBuild Sheets-inspired drawings system

### 5.1 What to carry over, and what to strengthen

The local SteelBuild Sheets distribution exposes Drawing Sets, GC Drawings,
Sheet/IFC Viewer, RFI Log, Holds & Blockers, Packages, Erection Sequences,
Submittals, Transmittals and data-completeness validation. Its help/UI strings
include title-block mapping/rescanning, selective bulk edits, revision overlay and
side-by-side comparison, and issuing packages as a unit.

Carry over those task-oriented interactions and compact register layout. Preserve
Rev 2's multi-tenant authorization, canonical lots and submittal/release authorities.
The supplied Sheets artifact is a compiled distribution, not a reviewed source tree
or a completed authenticated visual audit. Do not assert pixel-perfect parity from
bundle strings alone. The layout below is an explicit target design.

Strengthen the reference where necessary:
- A team passcode is not the target tenant/role model.
- Client-side next-number calculation is not the official numbering authority.
- Updating a live hold must append an amendment event instead of erasing its origin.
- Releasing a hold must not blindly overwrite a newer revision or restore a stale
  pre-hold workflow state.
- Sending a package must not directly rewrite canonical piece lifecycle or bypass
  submittal scrub/release checks.
- Call deterministic completeness checks “Validation.” Do not imply compliance
  with buildingSMART IDS unless an actual IDS implementation is delivered.

### 5.2 Separate concepts in both schema and UI

**Drawing set:** A logical collection such as “Shop steel — Area A.” It can receive
multiple uploads and revisions. An upload batch is a processing event, not inherently
a new logical set. A release package can draw approved revisions from multiple sets.

**Sheet:** Stable identity and descriptive metadata. A PDF source may contain many
pages; every selected drawing page becomes one sheet/revision mapping. A user can
exclude cover/index/blank pages in a reviewed import manifest. Always account for
every source page as imported or intentionally excluded; never silently skip pages.

**Revision:** Immutable source file/page reference, revision label, content checksum,
issued/received dates and upload provenance. “Current” identifies the intended working
revision; a historical issued revision remains retrievable even after a newer one
arrives. A revision label is not a unique ID or a reliable chronological sort key.

**Hold:** A sheet-level active blocker with required reason and retained placement,
amendment and release history. It overrides the effective readiness display, not the
underlying document identity, approval history or set edit-lock semantics.

**Submittal round:** An approval request over exact revision IDs. Responses can differ
per sheet. The package summary must expose mixed approval; one approved sheet cannot
make every sheet approved.

**Release package:** A named shop/field/erection issue scope with revision snapshots,
readiness checks, intended recipients and issue history. Document issuance and
canonical work-package/piece release are connected through explicit events, not
one generic “status” button.

**Transmittal:** The record of what was transmitted, revision/file snapshots,
recipient and purpose. Acknowledgment proves receipt, not engineering approval.

**GC/contract drawing:** A first-class reference document in a separate namespace.
It can inform an RFI or work package without becoming a fabricated shop sheet or
satisfying a fabrication-release drawing requirement.

### 5.3 Control-center layout

Use the existing Detailing Control Center route in an existing build. A new build
should expose a single discoverable Drawings entry with these sections as their
owning modules complete:

- Control Board: real counts, overdue decisions, blocker reasons and next actions.
- Drawing Register and Drawing Sets: flat grid plus expandable set grouping.
- GC Drawings: the contract/reference register.
- Sheet Viewer: focused document, metadata and revision/markup tools.
- Submittals and Process Board: approval ownership, rounds and aging.
- Packages and Transmittals: controlled issue preparation and delivery history.
- Holds & Blockers: active/released views with direct sheet links.
- Validation: complete, project-scoped issue list after M9.1.
- 3D Model: canonical status view after M26.

Unbuilt sections remain absent from active navigation. Do not ship a visible stub
to imply a capability exists. Keep route/tab/filter state linkable and back-button
friendly. On project change, clear active selection, viewer picks and mutation targets from
the old project. Preserve unsaved drafts under their original user/project identity
or obtain a deliberate discard decision; never retarget a draft to the new project.
Release old document buffers after any pending save has a safe, visible outcome.

The desktop composition is: project/context header, compact KPI strip, filter/action
bar, primary grid, optional right inspector. The grid stays the primary work area.
Open the full viewer when document inspection needs more room; do not reduce a
large drawing to a permanent thumbnail beside decorative cards.

KPI definitions must be explicit: active sheets, sheets awaiting approval, active
holds, overdue responses, release-ready scope and validation issues. Show the
snapshot time/scope and provide click-through to the exact contributing records.
Do not count historical revisions as active sheets or mix package and sheet counts.

### 5.4 Drawing Register contract

Default columns: selection; sheet number; title; register/set; current revision;
document issue status; submittal-derived workflow; hold badge/reason; responsible
party; due date; last activity. Optional columns: discipline, drawing type,
size, area, sequence, linked work package, linked-piece count, open-RFI count,
approval response, file availability and revision change indicator.

“Responsible party” is a derived association to the governing workflow record.
Do not invent an `assigned_to` column on the existing `drawings` table.

Required behaviors:
1. Natural-sort sheet numbers consistently in grids, pickers, exports and next/previous
   navigation. Stable tie-breaks include immutable ID. Preserve leading zeros.
2. Search title/number/set; combine register, discipline, workflow, hold, due-date and
   revision filters. Display active filters and support a reliable clear action.
3. Resize/reorder columns, sticky headers, useful density, visible keyboard focus,
   remembered per-user preferences and a reset-to-default command.
4. Select visible rows or explicitly select all filtered results. Label the scope;
   do not silently select unreviewed pages. Selection survives sort/filter only when
   the UI explains hidden selections, and never crosses project boundaries.
5. Bulk Edit uses an enable switch for each field. Disabled means “leave unchanged,”
   enabled-empty means “clear” only where clearing is valid. Show old→new preview,
   permission/lock failures and the number of affected rows before committing.
6. High-risk bulk actions are all-or-nothing within their declared transaction.
   If an operation is intentionally per-row, show actual successes and failures
   with retryable IDs; never report blanket success after partial failure.
7. Persist edited fields through validated domain operations. Revision labels,
   workflow stages and release states are not arbitrary bulk-edit text fields.
8. Table emptiness distinguishes no rows, no filter matches, no project, loading,
   inaccessible scope and a failed query. Offer the appropriate next action.

### 5.5 Upload and review pipeline

`selected → validating → staged → extracting → review_required → committing → complete`
with recoverable `failed` and deliberate `cancelled` states. Persist the batch ID,
original filename/checksum, source-page manifest and each page's processing state.

Validate file signature/type, supported encryption, page count and configured size
limit before promising success. Bound worker concurrency; allow cancellation and
retry at the failed page without duplicating completed sheets. Validate destination
project/set and permissions again on commit, not only when upload starts.

For each selected source page, preview source page number, thumbnail, proposed sheet
number/title/revision and proposed action: create sheet, attach new revision,
duplicate/no-op, conflicting match or excluded page. Require a reviewed decision for
ambiguous identities. A duplicated sheet number in two distinct sets/registers is
not necessarily a duplicate file or the same stable sheet.

Storage and PostgreSQL do not share one transaction. Stage uploads under an operation
ID, verify each object, commit metadata/relationships transactionally, then finalize
its manifest. On metadata failure retain a clearly failed staged object for safe
retry/cleanup. Never claim “nothing saved” if cleanup is unconfirmed. Cleanup may
remove unreferenced staging objects after a documented grace period; it cannot delete
an issued or history-referenced file.

A PDF page reference may point to an immutable multipage source object plus page index;
physically splitting every PDF is optional. Extraction/UI must still maintain one
reviewed source-page mapping per sheet revision and preserve exact original bytes.

### 5.6 Title-block mapping and extraction

A template is a versioned project/register/layout configuration, not a random field
on the most recently uploaded set. Separate shop and GC templates; support multiple
paper sizes/layouts and explicit template selection when they differ.

Store normalized `{x,y,width,height}` rectangles for number/title/revision with the
page's rotation and template version. Validate positive width/height, nonnegative
origin, `x+width <= 1` and `y+height <= 1`; checking each value individually is not
sufficient. Account for PDF crop box, rotation and text transformation matrices.

Read text intersecting each mapped region using pdf.js text coordinates. Preserve
raw extraction, normalized proposal and provenance per field. Show source page/crop,
confidence/review reason and the template used. An empty or ambiguous extraction is
“needs review,” not permission to erase an existing human-corrected value.

M3.1 works fully with deterministic extraction and manual correction. Image-only scans
remain viewable and importable with provisional metadata. OCR/AI is an optional later
assistant; it cannot silently replace a user-approved value or become a prerequisite
for opening a document.

Rescan supports selected sheets or an explicit entire-set scope. Show old→new values
with per-row/per-field checkboxes. Apply only accepted fields with expected versions.
A rescan cannot silently renumber issued documents, change approval status or alter
revision identity. The template editor itself must be usable without forcing a rescan.

### 5.7 PDF viewer and markup

The initial page fits the available viewport with side panels collapsed. Opening or
closing a panel in fit mode recomputes the fit so the whole drawing remains visible.
Manual zoom preserves the user's document focal point. Fit Page, Fit Width and Reset
have distinct, tested meanings; page changes follow an explicit fit/manual policy.

Use a single viewport transform for PDF pixels, text, annotations, hit-testing and
measurement. CSS transforms provide immediate pan/zoom; a debounced, cancellable
pdf.js render improves sharpness afterward. Bound bitmap size/DPR separately from
visual zoom. Support at least 15%–600% visual zoom, including non-passive wheel
handling, pointer-centered zoom, toolbar zoom, keyboard controls and touch pinch.
Avoid recursive render loops, stale canvas completion and page jumps while zooming.

Opening another sheet/revision cancels obsolete render tasks. A stale render or file
request must not overwrite the new page. Signed-URL expiry yields a refresh/retry
state with the intended revision preserved; an HTML error response is not parsed as
PDF. One bad page does not prevent viewing valid pages.

Markup tools: select, pen, arrow, rectangle, highlight, text, erase and undo/redo.
Store annotations against a **revision ID** with normalized page coordinates, author,
creation/update versions and an audit event for removal. Stroke points may include
pressure; normalization must use the untransformed PDF page coordinates.

Persist after completed strokes/edits through a retry-safe save operation. Show saving,
saved, unsaved and failed states. Do not submit every pointermove to the database or
overwrite another user's annotation collection with a stale whole-sheet JSON array.
Changing the current revision does not carry markups forward as if drawn on new steel;
a deliberate copy operation records provenance and asks the user to review alignment.

Export marked-up PDFs as derived artifacts while preserving original revisions.
If calibrated 2D measurement is delivered, record per-sheet scale and units; do not
infer physical dimensions from screen pixels or paper size alone.

### 5.8 Revision publication and comparison

Create immutable revision records from the first upload, not only when an old file
is replaced. A sheet's current pointer changes in one transaction using an expected
current revision; enforce at most one current revision per sheet. Store a content
checksum and exact Storage object/page reference. Signed download URLs are refreshed
at read time; they are not permanent object identities.

A new upload with the same checksum is a no-op or explicit duplicate; a reused label
with different bytes is a conflict requiring review, not an unnoticed overwrite.
Natural-sort display labels, but order history by revision sequence/publication time.

History lists current and historical revisions, uploader, dates, source and issue
references. Users can open any two retained revisions. Comparison offers synchronized
side-by-side navigation and a visual overlay with a visible legend: removed red,
added green, unchanged neutral. Color is supplemented by labels/patterns where needed.

Align by page dimensions/rotation with an explicit reviewed alignment transform if
needed. Do not resize unrelated paper sizes until geometry differences disappear.
Show “alignment uncertain” for mismatched crops/scales. A visual ink difference is
not proof of an engineering change; AI semantic interpretation is a later layer.

Publishing a new revision does not rewrite an already-issued transmittal, release,
submittal-round attachment or markup history. Flag changed governing revisions and
require a new evaluation before a later release. Existing released steel remains a
historical fact; new risk is shown as revision exposure.

### 5.9 Holds & Blockers — transactional target contract

The supplied migration establishes `drawing_holds`, a required nonblank reason,
one active hold per drawing, actor/time snapshots, release metadata and a register
join. Preserve those concepts. Its browser-side revision-status synchronization is
a historical implementation detail, not the target consistency guarantee.

**Place hold:** resolve actor and permission on the server; verify same-project sheet;
lock its relevant hold/current-revision state; require reason; insert one active hold
and an audit event atomically. The unique active-hold constraint resolves races.
A second independent request returns “already held” with the existing hold identity;
it must not silently replace who placed the original hold or when.

**Amend hold:** accept the hold ID, expected version and new reason. Keep original
placement unchanged; append who changed what and when. An already-released hold is
immutable. Do not re-open it by editing a flag.

**Release hold:** select the exact hold ID, verify it is still active and the actor
can release it, require release notes when the reason/policy demands them, then set
release actor/time and append the release event in one transaction. A retry with the
same request ID is safe. A stale request cannot release a newly placed hold.

The primary read model derives `effective_status = on_hold` while a hold is active,
otherwise displays the current revision's legitimate release status. Releasing the
hold removes that override; it does not automatically approve, scrub or release a
sheet. Retain `prior_release_status` as historical context.

If backward compatibility still requires writing `drawing_revisions.release_status`,
perform the compatibility write in the same server transaction. Store the affected
revision ID. Restore its prior status only if that same revision is still governed
by the same hold and its state has not independently advanced. If those conditions
fail, derive the current legitimate state and return an explicit conflict/review
result. Never restore an old “released” status onto a newer unapproved revision.

**Revisions while held:** the hold is sheet-scoped and continues across a new current
revision until deliberately released. Retain which revision was current when placed.
A new revision cannot clear a hold by becoming current.

**RFI answer:** default is to record the answer only. When the operator explicitly
chooses “release these holds,” preview exact linked hold IDs/reasons, verify that
permission independently and execute the selected releases with the answer in one
transaction. Unrelated holds remain active. A reply is not automatically proof the
blocker is resolved.

**Display:** active and released tabs; reason, sheet/set, current revision, owner,
placed age, linked RFI, release actor/time/notes, status of any compatibility sync.
Show sheet badges and package/work-package exposure without duplicating hold records.
The active-hold KPI counts active hold identities in the selected project, not history
rows. Preserve pagination/error state before claiming a complete count.

**Database checks:** required reason; valid lifecycle timestamps; exactly one active
hold per sheet; retained actor IDs plus display snapshots; project-consistent FK;
explicit SELECT and managed-write policies; no ordinary DELETE permission; server
versions/request IDs; immutable placement and release audit. If a security-definer
RPC is used, pin search_path and revoke default PUBLIC/anon execution.

### 5.10 Approval, packages, transmittals and release

Treat the stage vocabulary as a state graph, not an unconditional linear conveyor:
`Not Started`, `IFA`, `OFA`, `BFA`, derived `R&R`, `OFS`, `IFC`, `Released`.
Resubmittal loops and partial package results are first-class. Keep release status,
engineering response, ball-in-court and document lifecycle in separate fields.

Submittal round membership freezes exact revision IDs at transmission. Record per-sheet
approved/AAN/R&R/rejected responses and their comments. OFS is a post-approval scrub
with required dispositions/checklist. Only a validated transition can make a sheet
ready for IFC or internal fab release. Manual labels cannot bypass that transition.

A release package has a name/number, shop/field/erection purpose, responsible actor,
revision members, readiness snapshot and issue history. Draft membership is editable;
issued membership is immutable. “Partially ready” must expose precisely which members
are blocked and why. A package cannot become ready from a shallow “all approved” check.

Transmittal creation and actual email delivery are separate operations. Before M33,
support a generated downloadable packet plus explicit recording of manual issue.
After M33, an outbox records queued/sent/failed provider delivery and deduplicates
retries. The UI never says “email sent” merely because the DB insert succeeded.
Snapshot recipient identity/contact, purpose, item revision IDs/labels, file references,
issue date and actor. Later document changes cannot rewrite that evidence.

The fabrication gate checks current governing scope, IFC/Released status, holds,
blocking RFIs, required approvals/scrub evidence and revision consistency. Missing,
unloaded or failed evidence blocks evaluation. Override policies are explicit and
narrow; identity, authorization and missing-record failures are never overridable.
Persist the evaluation and overridden blocker reasons at the moment of release.

### 5.11 Sheet → piece → shop/field connections

Use `piece_drawing_sets` plus retained direct `piece_drawings` links, expanded to live
sheets and deduplicated. Canonical actionable leaf lots exclude archived records,
containers and split parents. Exact lot identity matters when a mark is split.

PDF mark scanning proposes boundary-safe, normalized exact matches; it does not write
relationships silently. Review every ambiguous or split-lot match. Domain RPCs enforce
same-project relationships and permissions on accepted links.

Validation flags missing title/revision/PDF, missing hold reason, conflicting current
revisions, absent required piece links, missing usable quantity/weight, and current
hold exposure on erected lots. Validate sheet types so a cover/general-notes sheet
is not falsely required to contain fabricated marks. Distinguish current exposure
from a historical claim that the hold existed at erection time.

3D color follows explicit canonical lot links first. Unique same-mark inference is
allowed only with valid relationship evidence and exactly one actionable lot;
conflicting, archived or split-parent links cannot seed inference. Inferred display
must never authorize a ship/deliver/erect mutation. The legend uses the same resolver
as the mesh colors and counts distinct elements, not placed meshes or duplicate rows.

## 6. Data contracts and schema ownership

This is a target contract, not executable migration SQL. In an existing checkout,
inspect actual columns, RPC arguments and policies; add a small reviewed migration
instead of declaring a second competing table. New schemas should use equivalent
constraints and names consistently. Generate TypeScript types from the authorized
development schema after each schema module, never by changing production for a spec.

| Aggregate | Required target facts | Constraints / ownership |
|---|---|---|
| organizations/memberships | Org identity, user identity, role, invite lifecycle | No self-escalation; authenticated tenancy checks |
| projects/memberships | Org FK, project identity, role assignments | Same-org membership verified on grant and every project operation |
| drawing_sets | Logical set ID, project, register/category, name, lock state/version | Lock fields server-managed; imports are separate events |
| drawing_upload_batches/pages | Operation ID, object/checksum, per-page manifest/status/error | Retry-safe page outcomes; page accounting and staged-object cleanup |
| drawings | Stable ID, project, set, sheet number/title/discipline, current revision identity, archive/version | Set/project consistency; deliberate identity matching |
| drawing_revisions | ID, sheet/project, label/ordinal, immutable object/page/checksum, provenance, effective issue facts | One current revision; no issued-history overwrite |
| titleblock_templates | Project/register/layout, version, normalized rectangles, rotation | Full rectangle bounds; accepted-field provenance |
| drawing_annotations | Revision/page, geometry/tool, actor/time, version/removal event | Revision-bound edits, concurrent saves, private access |
| drawing_holds/events | Exact schema concepts in §5.9; affected revision, reason, actor/time, request/version | Unique active hold; atomic transitions; retained audit |
| gc_drawing_sets/gc_drawings | Reference namespace, identity, versioned file/page metadata | Shop/GC picker type enforced; cannot satisfy fab-sheet gate |
| submittals/rounds/responses | Number, scope, exact revision membership, BIC/status, responses/comments | Immutable transmitted rounds; per-sheet authority |
| release_packages/items | Number, purpose, exact revision membership, readiness/issue events | Separate document package from canonical work package |
| transmittals/items/outbox | Number, recipient/purpose, issued item snapshots, delivery attempts | Snapshot files/revisions; idempotent issue/delivery |
| rfis | Number/question/answer/BIC/due/status, typed document associations | Answer/hold-release selection transaction; official identity |
| fab_release_log/overrides | Scope, immutable gate result, governing revision IDs, approved override facts | Server evaluation; protected audit |
| work_packages | Project/WP identity, scope, budgets, schedule references | Authoritative mapping to current lots/drawings |
| pieces/relationships/events | Parent/lot identity, mark, qty/weight, lifecycle, hold, set/direct links | Protected transitions; no client direct writes; conserved splits |
| schedule_tasks/dependencies/calendars/baselines | Tree/order, date-only boundaries, duration, actuals, calendar, immutable baselines | No cycles/orphans; atomic cascade; explicit duration semantics |
| SOV/CO/pay apps | Exact monetary amounts, approval/version state and submission snapshots | Cent-safe totals; temporal context; no retroactive rebilling |
| operational audit | Actor, target, event, server time, request ID, before/after facts | Append-only and tenant-scoped |

For lifecycle spelling use Rev 2's canonical sequence:
`not_started → released → in_fabrication → fabricated → shipped → delivered → erected`.
“Received” may label a delivery workflow action; it is not a new canonical lot status.
Keep hold orthogonal to progress and preserve prior valid lifecycle while held.

Keep legacy drawing RFI-number text separate from UUID relationships. Resolve each
using its canonical mapper; never pool the two ID spaces into a single unchecked list.

Do not invent `piece_lots` as a second progress authority if the selected schema models
lots and parents in `pieces`. Likewise reuse the deployed schedule dependency model;
do not introduce a duplicate table solely because an older brief named one.

## 7. Navigation, workflow reachability and empty states

One route catalog feeds sidebar, primary navigation, launcher and permission/module
checks. An existing Rev 2 checkout uses `src/config/routes.js` and its nav catalogs;
a new build uses typed equivalents such as `src/config/routes.ts`. Never create
new JavaScript solely to reproduce an old file extension.

Primary domains: Dashboard; Projects; RFIs; Drawings/Detailing; Fabrication; Deliveries;
Schedule; Field; Cost; Reports; Closeout. Each appears only when its first complete
module is available. Settings covers Profile/Security/Display from M2, with later
capabilities added by their owner modules.

Every module must be reachable by a normal click from its domain, with correct
breadcrumbs, project context, deep links, browser back/forward and direct-URL access
checks. A direct URL that works while the launcher omits it is incomplete.

Loading states retain context; failed states name the failed operation and preserve
recoverable drafts; empty states explain the next legitimate action. Never generate
fake sample zeros in a production project. Exports retain the selected project/filter
scope and identify whether the export is complete.

## 8. Visual and interaction system

Use a professional, compact steel-operations interface. Dark: near-black layered
surfaces, restrained gold accent, readable neutrals. Light: clean neutral surfaces,
high-contrast text and the same information hierarchy. Carry the existing Barlow
Condensed/Inter/IBM Plex Mono choices only where the assets are available and licensed;
use sensible fallbacks with no broken-font layout dependency.

Use semantic CSS tokens for surfaces, text, borders, status and focus. Command-control
surfaces use the existing command token scope; do not wrap all pages in a dark-only
skin. The 3D canvas may remain dark in both themes, but all overlaid controls must use
a scoped readable palette; the adjacent inspector continues to follow the app theme.

Tables need readable headers, row density, stable numeric alignment, useful hover and
selection, visible scroll positions and focus. Status uses text/icon plus color.
Primary actions remain visible at normal desktop and 390px widths; on mobile stack
viewer and inspector instead of leaving a 50px-wide drawing canvas.

Design keyboard flows deliberately: Escape cancels the current transient action;
Enter submits only an intentional editable row/action; shortcuts ignore text inputs;
focus returns to the initiating control; tab order follows the visible workflow.
Destructive operations preview scope and preserve a recoverable path when the domain
allows it. Accessibility and responsive behavior are required in every module, not
postponed to M35.

## 9. Integrations and background work

Implement server-side gateways only in their owner module: authentication/workspace
operations (M1–M2), external billing (M20), export/deletion (M22), managed telemetry
(M23), LLM gateway (M24), provider-assisted import/compare (M25), email/connectors
(M33), backup/restore operations (M35). Do not create fake endpoints for future modules.

For every gateway: authenticate caller, resolve authorized org/project, validate
payload and related IDs, scope secrets, bound request size/time, map provider errors,
retain a retry/request ID, redact logs and record actual completion. A frontend feature
flag does not secure a callable endpoint.

Background extraction and delivery jobs use persisted state, retry count, failure
reason and idempotent completion. Jobs paused by missing configuration are visible as
unavailable/queued according to their real state, never “sent” or “processed.”

Private file links expire; refresh access after authorization checks. Preserve immutable
object identity in the DB and perform no cross-tenant “repair” by guessing another
organization's storage path. Backups require a tested restore; an artifact upload alone
is not proof the database and files can be recovered together.

## 10. Feature availability and authorization

M0 supplies the static module catalog; M1–M2 supply identity and role/tenant checks.
M21 adds persisted feature flags and authorized overrides, with a typed catalog and
a safe default for absent configuration. A flag can remove a capability from nav and
block its route; server authorization remains authoritative.

Core drawings/RFI/release/piece workflows must remain coherent when optional AI, 3D,
email, integrations or advanced reporting are disabled. An unavailable optional module
must not break opening a sheet or evaluating a deterministic release gate.

Existing entitlement/billing rules are preserved in an existing product. This prompt
is a build specification, not authorization to change pricing, activate live payment
processing, publish marketing, or remove existing business restrictions.

## 11. Verification, evidence and runtime boundaries

Use pure-function tests for domain arithmetic and transitions; interaction tests for
forms, tables and async state; disposable DB tests for RLS/constraints/concurrency;
and Playwright for the real browser workflow. Mock network access in Vitest. Browser
fixture evidence does not replace authenticated staging permission/persistence tests.

Run the repository's relevant gates, including all four type checks where retained:

```bash
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm run check:no-new-js
npm test
npm run build
```

For a brand-new TypeScript-only build, configure strict TypeScript from M0 and record
why a legacy JS check is inapplicable; do not manufacture a JavaScript codebase merely
to pass a historical command. Prefer exact behavior assertions over brittle source-text
scans. Do not modify tests to bless a bug or broaden grandfathered ignore lists.

Each module's browser evidence includes page identity, useful initial content,
permission/error states, no framework overlay, relevant console health and screenshots
of the critical interaction at desktop and mobile widths. Include reload/project-switch
checks for any module that owns a selected record or an in-progress operation.

Use representative fixtures: more than 1,000 records to expose server row caps; mixed
current/historical revisions; multiple lots with the same mark; cancelled/failed reads;
request replay; two concurrent users; two tenants; missing optional integrations.
Queries needing complete evidence should fail when a page fails, not return a partial
list masquerading as complete. Server row limits can be below the requested page size;
paging must exhaust actual returned rows and detect safety-limit truncation.

Measure responsiveness on a declared reference device/browser and fixture. Record
rendered row/element counts and dataset size. Avoid unsupported promises such as
“instant on every model” or treating a 1/16-inch display increment as proven physical
measurement accuracy.

## 12. Strict build order and module acceptance cards

Each card defines a vertical deliverable. The global gate in §1.3 applies to every
card. The listed prerequisites identify data dependencies; the immediately preceding
card must also be verified because execution is strictly serial.

Existing file names are integration anchors; proposed paths below are target names
for a new build. Resolve an existing equivalent before creating a parallel feature.
No module may treat a later card's feature as already available.

**Execution order:**

M0 → M1 → M2 → M3 → M3.1 → M3.2 → M3.3 → M3.4 → M3.5 → M3.6 → M4 → M4.1 → M5 → M6 → M7 → M8 → M9 → M9.1 → M10 → M10.1 → M11 → M12 → M12.1 → M13 → M13.1 → M14 → M14.1 → M15 → M16 → M17 → M18 → M19 → M19.1 → M20 → M21 → M22 → M23 → M24 → M25 → M25.1 → M25.2 → M26 → M27 → M28 → M29 → M30 → M31 → M31.1 → M32 → M33 → M33.1 → M34 → M35 → M35.1

### M0 — Application shell and verification foundation

**Prerequisites:** None

**User outcome:** Open a local development app, navigate between its implemented shell routes, switch theme and observe an intentional recoverable error.

**Data and interfaces:** Create package/config/lockfile, src/app/providers.tsx, src/config/routes.ts, src/config/moduleCatalog.ts, src/styles/tokens.css and shared error/loading/empty-state primitives. Configure a new development environment, CI and disposable test setup. Supply the storage/client configuration interfaces, without creating business tables.

**Screen and interactions:** Build responsive navigation, theme persistence, keyboard focus and an error boundary. Register only implemented routes. Provide a development-only fixture route excluded from production.

**Authority and failure rules:** No secrets in browser build output. CI deploy jobs depend on actual success; disable competing auto-publish paths for the chosen target. Do not publish production merely to prove the shell works.

**Required acceptance tests:** Build from a clean install; verify lazy-route fallback, not-found route, persisted theme, error-boundary retry and keyboard navigation. Inspect compiled environment output for privileged secrets. Confirm a failing check prevents preview/deploy promotion.

**Done when:** Local and authorized preview shell render with no runtime errors at desktop and 390px widths; CI executes and all applicable gates pass. Record the baseline commands and current commit.

### M1 — Authentication and workspace membership

**Prerequisites:** M0

**User outcome:** Sign in, recover access, create or join a workspace, and see only its authorized membership context.

**Data and interfaces:** Own organizations, organization_members, organization_invitations and user_profiles; AuthContext, OrgProvider/useOrg, auth-state mapping and invite acceptance transaction. Use versioned migrations and server-generated invite tokens with expiry/replay rules.

**Screen and interactions:** Login, signup/email-confirmation state, forgot/reset-password, logout, workspace selection, invite acceptance and member management. Implement MFA enrollment/challenge where required by the chosen auth policy, with recovery behavior.

**Authority and failure rules:** No session after email-confirmation signup is an expected state. Never grant roles from editable user metadata or a failed profile lookup. Invite acceptance verifies intended recipient and valid token; owners cannot strand a workspace by deleting its last owner.

**Required acceptance tests:** Two independent users create isolated workspaces; invite replay is safe; expired/wrong-recipient invites fail; unauthorized role escalation fails through direct API calls. Test auth refresh, logout, password recovery and delayed membership reads.

**Done when:** A signed-in user completes the real invite/login/recovery flow; a second workspace cannot read or edit the first; loading or network failure never creates an accidental new workspace or grants access.

### M2 — Projects, project roles and operational settings

**Prerequisites:** M1

**User outcome:** Create a project in the selected workspace, assign a coworker a project role, switch projects and reopen a deep link.

**Data and interfaces:** Own projects, project memberships, create_project, project-role lookup and role-aware access predicates. Introduce the reusable atomic official-number allocator and request/version conventions here for all later consumers. Wire src/hooks/useProjectRole.ts and project-context state.

**Screen and interactions:** Projects register, project setup/detail, project switcher, member roles, Profile/Security/Display settings. Start with honest empty dashboard content; future domain cards remain absent. Retain recoverable drafts on validation failure.

**Authority and failure rules:** Project creation and membership assignment verify workspace access on the server. Same-organization membership alone does not grant every project. An inaccessible bookmarked project cannot inherit the last valid project context.

**Required acceptance tests:** Cross-org create/query/update attempts fail; field cannot grant admin; switching project clears selection/drafts; concurrent numbering yields unique identities and does not require gap-free sequences. Exercise server refusal with a bypassed frontend.

**Done when:** Two authorized projects switch cleanly, an unauthorized project is inaccessible by URL and API, and the role service is consumed consistently by navigation and actual write authorities.

### M3 — Drawing sets, intake manifest and register

**Prerequisites:** M2

**User outcome:** Upload a multipage shop PDF into a logical set, review proposed sheet identities, commit it, then find and edit a sheet in the register.

**Data and interfaces:** Own drawing_sets, drawings, first-revision records, upload batches/page manifests, staging object references and set lock/version rules. Implement drawing repository/query keys and src/pages/drawings/DrawingRegisterPage.tsx equivalents. First revision identity is a dependency of every subsequent document operation.

**Screen and interactions:** Implement §5.4–5.5: natural-sorted grid, set grouping, search/filters, source-page review, per-field bulk editing and inspected conflict/retry results. Include basic PDF open/download; advanced canvas controls belong to M3.2.

**Authority and failure rules:** Client metadata cannot move a sheet across projects. A locked set blocks unauthorized edits in the DB. Only reviewed identity matches attach to existing sheets. Revision label and workflow/release changes are not generic bulk edits.

**Required acceptance tests:** Import a 50-page file with 48 drawing pages and two deliberately excluded pages; account for all 50. Retry a failed page without duplicates. Test duplicate number in two sets, checksum replay, locked-set edit, project switch mid-upload, and more than 1,000 register records.

**Done when:** A user completes intake to persisted sheets/thumbnails, reopens the intended source page, and bulk-updates only enabled descriptive fields. Failed object/metadata operations display their true partial state and recover without duplicate sheets.

### M3.1 — Title-block templates, extraction and rescan

**Prerequisites:** M3

**User outcome:** Draw number/title/revision regions on a representative page, preview extraction, reuse the template and accept selected rescan changes.

**Data and interfaces:** Own versioned titleblock_templates by project/register/layout, field provenance and extraction-review state. Implement src/lib/drawings/titleblockGeometry.ts and titleblockExtraction.ts with normalized coordinates and PDF transforms. No AI gateway dependency.

**Screen and interactions:** Mapper with zoom/pan/rotation awareness; template picker; old/new crop previews; per-field acceptance; selected-sheet and explicit whole-set rescan. Preserve manual corrections unless the operator accepts a replacement.

**Authority and failure rules:** Template mutation requires project document-author permission. Apply metadata through expected-version checks; extraction cannot publish a revision, rename an issued sheet silently, or clear a good value from an empty rectangle.

**Required acceptance tests:** Use rotated/cropped PDFs, three paper sizes, wrapped titles, empty fields, duplicate-number proposals and image-only scans. Reject rectangles extending past page bounds. Verify shop template cannot overwrite GC template. Apply only revision text while leaving number/title unchanged.

**Done when:** Two uploads reuse the intended template; a corrected region rescans existing pages with a reviewed per-field diff; an image-only page completes intake with manual metadata and remains viewable without AI.

### M3.2 — PDF viewer, navigation and calibrated measurement

**Prerequisites:** M3.1

**User outcome:** Open a sheet, inspect details at high zoom, reveal metadata, navigate to the next sheet, and return to full-page fit.

**Data and interfaces:** Own src/components/drawings/viewer/PdfViewport.tsx, viewportTransform.ts, render scheduler, signed-object loader and optional per-revision scale calibration. Consume immutable file/page references from M3; do not create a second document cache authority.

**Screen and interactions:** Implement §5.7: collapsed initial panels; Fit Page/Fit Width/Reset; pointer-centered wheel/pinch zoom; pan shortcuts; next/previous; fullscreen; render cancellation; loading and signed-link retry. Native PDF fallback remains an explicit view choice.

**Authority and failure rules:** View permissions are checked before file resolution. UI shortcuts do not modify records. Measurements display calibration/source units and precision limits; a scale change is an audited metadata action.

**Required acceptance tests:** Assert page-point stability during zoom; fit after opening/closing both side panels; rapid sheet changes reject old renders; expired signed link retries same revision; long-page/cropped/rotated drawings remain visible. Test mouse, touch and keyboard with text input focused.

**Done when:** A real reference PDF is fully visible in fit mode with panels either open or closed; pan/zoom remain responsive, document identity remains correct after rapid navigation, and any measured length matches a known calibrated fixture.

### M3.3 — Revision-bound markups and annotation persistence

**Prerequisites:** M3.2

**User outcome:** Draw a revision comment, undo an edit, reload at another zoom, and see the annotation in the same document location.

**Data and interfaces:** Own revision-bound annotations, revision/annotation versions, author metadata and removal/copy events. Implement normalized page geometry, annotation repository and src/components/drawings/viewer/MarkupLayer.tsx. Store immutable source PDF separately.

**Screen and interactions:** Pen, arrow, box, highlight, text, selection, erase, undo/redo and palette. Show saving/saved/unsaved/failed state. Support deliberate copy-to-revision with provenance and a derived marked-up PDF export.

**Authority and failure rules:** Set-lock and revision access apply to writes and exports. An author cannot spoof another user or overwrite someone else's annotation set with stale JSON. Issued history remains intact when annotations are voided or superseded.

**Required acceptance tests:** Place ink at a known normalized point, resize/zoom/rotate/reload and verify alignment. Simultaneous independent strokes both survive; a stale edit conflicts visibly. Test save failure/retry, locked revision, cross-tenant fetch and keyboard undo without deleting server history.

**Done when:** Markups persist at the correct revision and coordinates, concurrent authors do not lose each other's work, failed saves remain visible, and exported markup does not replace the original document.

### M3.4 — Revision publication, history and deterministic compare

**Prerequisites:** M3.3

**User outcome:** Publish a new revision against the current one, reopen both retained documents and inspect added/removed ink.

**Data and interfaces:** Own the publish revision transaction, current-pointer uniqueness, revision ordering/checksums and immutable source references. Implement revision repository/history panel and RevisionCompareDialog with synchronized transforms. Preserve M3 first-revision identity.

**Screen and interactions:** Review new-vs-existing sheet match, replacement conflict and checksum duplicate. Show revision timeline/current marker; choose any two revisions; switch overlay/side-by-side; review alignment and independent load failures.

**Authority and failure rules:** Publishing is expected-version checked. Two users cannot silently make two current revisions. Old transmittal/annotation links retain exact revision IDs. No source file deletion while history references it.

**Required acceptance tests:** Publish A then B then C and verify three retained revision identities; concurrent B publications yield one success and one conflict. Add/remove one test line and verify visual legend. Test changed paper size/rotation, reused labels/different bytes and failed historical file retrieval.

**Done when:** History opens all three revisions, one is current, the compare shows the known change without hiding alignment uncertainty, and retry cannot duplicate revision identity or overwrite an issued snapshot.

### M3.5 — Sheet-level Holds & Blockers

**Prerequisites:** M3.4

**User outcome:** Place a reasoned hold, find the blocked sheet in the register/active-holds view, amend the reason, then release that exact hold with history intact.

**Data and interfaces:** Own drawing_holds and append-only hold events; implement transactional place/amend/release operations, request IDs and expected versions. Consume current revision identity and lock/access rules. Apply the full contract in §5.9; prior_release_status is historical context.

**Screen and interactions:** Place/release from sheet inspector and Holds & Blockers; Active/Released views; reason/owner/age and release metadata; sheet badge; header count with complete evidence. No RFI-dependent control until M6.

**Authority and failure rules:** Server derives actor/time, rejects blank reason and cross-project IDs, serializes concurrent placement, and preserves one active hold per sheet. Set edit lock and workflow hold remain distinct. Release never restores obsolete approval/release facts.

**Required acceptance tests:** Race two placements; replay a release; amend with stale version; publish a new unapproved revision while held; release an old hold after another is placed; simulate compatibility-sync failure; query as unauthorized tenant. The currently active hold and history must remain correct.

**Done when:** The register, active list and count agree after reload; one placement survives the race; the new revision stays held until explicit release and does not inherit the old revision's released status.

### M3.6 — GC/contract drawing register and shared document picker

**Prerequisites:** M3.5

**User outcome:** Upload GC reference drawings with a separate title-block template and select shop/GC documents from one typed picker.

**Data and interfaces:** Own gc_drawing_sets/gc_drawings or equivalent tagged document aggregate and versioned private references. Provide linkableDrawingsForProject returning an explicit shop/GC tagged result with identity, set, sheet label and current revision. Add a real picker integration to the document inspector.

**Screen and interactions:** Independent GC register, set grouping, natural search, intake review, template selection, current/history document viewing and clear Shop/GC badges. No fabricated-piece status controls on GC sheets.

**Authority and failure rules:** Both namespaces enforce project access. A same-looking sheet number in GC and shop is not interchangeable. Shared picker output cannot coerce GC into a shop-only fabrication relationship.

**Required acceptance tests:** Upload GC A-101 and shop A-101; show distinct IDs/badges/history. Apply GC template without affecting shop. Verify cross-project picker exclusion and that consumers requesting shop-only governing documents reject GC results.

**Done when:** The GC register completes upload-to-view/history independently; the shared picker resolves both types without identity collision. RFI and work-package integrations are explicitly owned by M6 and M8.

### M4 — Submittal rounds, responses and approval workflow

**Prerequisites:** M3.6

**User outcome:** Prepare an approval request over specific revisions, record mixed sheet responses, resolve comments and complete the scrub transition.

**Data and interfaces:** Own submittals, rounds, frozen round-revision memberships, sheet responses, comment dispositions and workflow audit. Reuse atomic numbering. Implement submittalStatusToStage and transition validators with existing Rev 2 meanings; reference recipients use authenticated users or immutable contact snapshots until M31.

**Screen and interactions:** Submittal register/detail, round composer, per-sheet response grid, ball-in-court/dates, mixed-state summary, comment-disposition queue and OFS checklist. Record manual transmission honestly; connector-backed sending belongs to M33.

**Authority and failure rules:** Actor permissions and response provenance are server-checked. A mixed round cannot become wholly approved. Closed/void rounds cannot govern a current release. Approved/AAN is not IFC or released; scrub and dispositions are enforced in the transition authority.

**Required acceptance tests:** Ten concurrent creates have distinct numbers. Two-sheet round returns one Approved and one R&R; only the affected scope enters resubmittal. Test skipped scrub, missing dispositions, stale response update, revised sheet after round send, unauthorized response and replayed transmission.

**Done when:** The round history retains exactly what was submitted, mixed responses stay visible, and a complete authorized scrub can advance eligible scope while rejected or held sheets remain blocked.

### M4.1 — Release packages and transmittal snapshots

**Prerequisites:** M4

**User outcome:** Assemble a named shop/field/erection document package, inspect readiness, generate a transmittal packet and record manual issue.

**Data and interfaces:** Own document release_packages/items and draft/sent/acknowledged/void transmittals with exact revision/file/recipient snapshots. Reuse numbering and current document/approval read models. This is document issue preparation; M7 owns final fabrication authorization.

**Screen and interactions:** Package list/composer, purpose/scope/recipient summary, readiness blockers, document packet preview and transmittal log/detail. Offer generate/download packet and explicit recorded-manual-issue; no fake email-sent button.

**Authority and failure rules:** Issued package membership and transmittal snapshots are immutable. Acknowledge is receipt, not approval. Send/void requires document-control permission and audit. A shop-package issue must not change canonical lot lifecycle, which does not yet exist.

**Required acceptance tests:** Create mixed shop/GC reference packet with two revisions; issue; publish a later revision and confirm old transmittal still opens old files. Retry issue without duplicate number/event. Reject missing file, unauthorized recipient-scope mutation and edit of sent items.

**Done when:** A generated packet and its issued record agree on exact items, revisions, recipient and time. Draft/issued/acknowledged/void states reflect actual operator actions and future email delivery remains visibly separate.

### M5 — Detailing Control Center integration

**Prerequisites:** M4.1

**User outcome:** Use one Drawings entry to see workload, open its contributing records and complete a document-control action without losing project context.

**Data and interfaces:** Own hub composition and documented read-model contracts, not new workflow writers. Reuse all M3–M4.1 repositories. Integrate existing DrawingSubmittalHub equivalent, URL tabs/filters and same-project action links.

**Screen and interactions:** Control Board, Drawing Register/Sets, GC Drawings, Process Board, Submittals, Packages, Transmittals and Holds. Display clear ownership, due dates, active-hold count and missing evidence. Validation/3D/AI remain absent until their modules complete.

**Authority and failure rules:** Counters use the same scoped evidence as their detail lists. Missing data renders unknown/error, not healthy/zero. No hub dropdown bypasses underlying writer permissions. Project change clears all project-specific drafts and selections.

**Required acceptance tests:** Navigate from active-hold KPI to exactly those sheets; create a submittal from a set with prefilled scope; attach a reviewed revision to the correct draft/open workflow; test back/forward, filtered empty state, delayed query failure and project switch with an open draft.

**Done when:** The header, grids and workflow board agree; every visible primary action completes through the canonical writer; no unbuilt tab or stale project artifact appears. Save screenshots and a click-based acceptance walkthrough.

### M6 — RFI lifecycle and selected hold resolution

**Prerequisites:** M5

**User outcome:** Raise a question from either document register, assign ownership/due date, record an answer and optionally release explicitly selected related holds.

**Data and interfaces:** Own rfis, typed shop/GC/revision associations, answer/hold-resolution transaction and audit. Use atomic numbers and retained question/answer provenance. Add the M3.6 picker to the RFI composer; work-package linkage is added in M8.

**Screen and interactions:** RFI register/detail, open/overdue filters, drawing context, answer/reopen/close controls and exact hold-release preview. Keep standard RFI and Detail Query record kinds separate where the repository defines them.

**Authority and failure rules:** An answer alone does not release any hold. Selected release IDs/versions, same-project links and release permission are checked within the answer transaction. No silent transition from answered to approved drawing or fabricated piece.

**Required acceptance tests:** Create from GC and shop sheets; preserve correct badges/revision context. Race numbering; submit incomplete answer; retry answer/release; hold placed after preview must remain active. Verify unauthorized answer/release and an unrelated linked-sheet hold are untouched.

**Done when:** A user can trace sheet → question → answer and its selected hold events. RFI numbers are unique, answering without the option leaves holds active, and permitted selected releases occur once with a complete audit.

### M7 — Server-enforced fabrication release gate

**Prerequisites:** M6

**User outcome:** Evaluate a proposed release scope, see exact blockers, resolve them and create a retained authorization snapshot.

**Data and interfaces:** Own evaluate_fab_release_package equivalent, release event/override schema and protected release transaction. Consume exact revision IDs, submittal/scrub state, holds and blocking RFIs. Expose one shared typed evaluation consumed by UI and server writer.

**Screen and interactions:** Release readiness view, per-sheet/record blocker links, explicit exception scope/reason, final release confirmation and immutable history. Integrate package readiness from M4.1 without adding a second approval state.

**Authority and failure rules:** Re-evaluate in the release transaction; the previous client preview is not authorization. No permission/identity/missing-evidence override. Allowed business exceptions require specific role, reason and captured blocker/version facts. Audit cannot be edited or deleted by normal clients.

**Required acceptance tests:** Attempt OFA-only, Approved-only, held, R&R, unresolved scrub, open blocking RFI, stale governing revision and failed evidence releases; all fail. Resolve each valid fixture and release. Race a new hold against release; transaction outcome preserves a consistent snapshot.

**Done when:** The server refuses every invalid path even when called directly; authorized valid release succeeds once and retains exact evidence. The full release gate browser/DB suite becomes a regression gate for every later module.

### M8 — Work packages and drawing/RFI scope

**Prerequisites:** M7

**User outcome:** Create a work package, assign governing shop drawings and relevant RFIs, inspect blockers and view its planned shop/field scope.

**Data and interfaces:** Own work_packages and checked drawing/RFI associations, budget-hour fields, planned dates and scope versions. Integrate shared document picker with separate reference-versus-governing roles. Canonical piece rollups are added by M9.

**Screen and interactions:** WP register/detail/composer, governing/reference documents, blockers, shop/field budgets, dates and readiness links. Before M9, show no canonical scope rather than invented piece count or tonnage.

**Authority and failure rules:** Explicit WP mutations verify project/role and release gate. GC references can be linked as references but cannot satisfy shop-drawing readiness. Deleted/superseded sheets cannot make a package ready.

**Required acceptance tests:** Attach eligible shop sheets and a GC reference; introduce an RFI/hold and see the governing blocker. Reject cross-project sheet/RFI/WP IDs. Test stale edit and a sheet that changes revision after readiness preview.

**Done when:** WP scope is persisted and navigable; its readiness agrees with M7 and its missing canonical-piece scope is honestly labeled. Budget/date editing works without relying on the future schedule or financial modules.

### M9 — Canonical piece lots, imports and protected lifecycle

**Prerequisites:** M8

**User outcome:** Import marks, review duplicates/matches, assign lots to work packages/drawings, split a lot and advance only eligible canonical leaves.

**Data and interfaces:** Own canonical pieces parent/lot model, import batches/rows, set/direct drawing links, station configuration/completions and protected import/assign/link/hold/release/logistics RPCs. Reuse selectActionableLeafPieces, canonical tonnage and lifecycle mappings in an existing repo.

**Screen and interactions:** Piece Register Overview/Register/Imports/Lots & Links/Production/Logistics; default WP sort; explicit mark/lot identity; bulk action previews; per-row failures; import reconciliation. Scan PDF text for proposed mark links with reviewed exact matches.

**Authority and failure rules:** No client direct pieces updates. Splits conserve quantities/known weight and exclude parents from rollups. Ambiguous marks cannot auto-link or bulk-advance. Hold blocks disallowed transitions; wrong stage cannot be skipped by a 3D or shipping import path.

**Required acceptance tests:** Import/replay 1,201 lots, duplicate marks, split parents and malformed weights; compare leaf totals before/after split. Link set + direct sheet without double count. Attempt each invalid lifecycle/role transition and permitted ship/deliver/erect operations.

**Done when:** Register, production and logistics agree on current canonical leaves. Quantity/tonnage are conserved and deduplicated; all writes are protected/idempotent; invalid release remains blocked by M7.

### M9.1 — Detailing and piece data-completeness validation

**Prerequisites:** M9

**User outcome:** Run validation for the selected project, filter its findings and open the exact sheet or lot needing correction.

**Data and interfaces:** Own deterministic rule/result types and a complete project-scoped evidence repository. Consume current sheets/revisions, holds, sheet types, WPs, actionable lots and both relationship authorities. Reuse src/lib/detailingValidation equivalents where present.

**Screen and interactions:** Validation tab with Run/Retry, snapshot time, checked sheet/lot counts, severity/rule/record filters and precise links. Distinguish pending/failed/stale evidence; avoid falsely calling these checks standards-compliant IDS.

**Authority and failure rules:** A page or evidence-source failure invalidates the run. Derived current hold exposure on erected pieces must not claim the hold existed during erection. Rules that require fabrication marks apply only to relevant drawing types.

**Required acceptance tests:** Use more than 1,000 rows and a reduced server row cap; fail the last relationship page; test missing title/revision/PDF, multiple current revisions, archived links, weight disagreement, split parents and erected held-sheet exposure. Deduplicate multiple links to one sheet.

**Done when:** Counts and findings match hand-checked fixtures, failed reads cannot show a clean result, and every displayed issue navigates to its exact record. Correcting a record changes the next complete run appropriately.

### M10 — Project schedule and dependency engine

**Prerequisites:** M8, M9.1

**User outcome:** Create a work-package schedule, indent tasks, connect dependencies and see the grid and Gantt update together.

**Data and interfaces:** Own schedule tasks, parentTaskId, sibling sortOrder, calendars and dependency edges. Store leaf plans; derive summary dates, duration and progress from descendants. Define working-day, inclusive finish-date and lag conventions before implementation.

**Screen and interactions:** Provide a dense Microsoft Project-style hierarchy, synchronized grid/Gantt selection, inline edits, dependency inspector, zoom, expand/collapse and full-screen mode. Explain rejected edits at the affected cell.

**Authority and failure rules:** Reject cycles, invalid parent moves and cross-project edges. Summary fields are read-only rollups. Delete or move subtrees atomically, without orphan tasks or links. Distinguish calendar days, workdays, effort and elapsed duration.

**Required acceptance tests:** Exercise weekends, holidays, milestones, finish-to-start lag, other supported link types, nested summaries, cycle attempts and subtree deletion. Compare a hand-calculated network to computed dates and float. Save/reload reordered siblings.

**Done when:** An authorized planner can edit a real hierarchical schedule through the UI; persisted grid and Gantt agree, constraints survive concurrent edits and no unsupported dependency type appears selectable.

### M10.1 — Baselines, actuals and lookahead

**Prerequisites:** M10

**User outcome:** Capture a baseline, enter actual progress and compare the upcoming work against drawing and material constraints.

**Data and interfaces:** Own immutable baseline snapshots and versioned actual/progress events; derive variances and lookahead from the current schedule. Consume existing drawing, release and piece evidence without creating duplicate completion writers.

**Screen and interactions:** Provide baseline selection, planned/actual bars, variance columns, two/six-week windows and actionable constraint links. Show the date and completeness of readiness evidence.

**Authority and failure rules:** Actual progress must not silently rewrite a baseline. Manual percentages and quantity-derived progress need a declared authority. Negative float is a computed warning, not proof of a particular cause.

**Required acceptance tests:** Rebaseline without changing earlier snapshots; change a calendar and inspect variance; fail one readiness source; test partially complete work and dependency changes after baseline capture.

**Done when:** A saved baseline is reproducible and the lookahead distinguishes late, blocked, incomplete-evidence and ready work with links explaining each classification.

### M11 — Deliveries, loads and field receipts

**Prerequisites:** M9.1, M10.1

**User outcome:** Build a load from eligible lots, record shipment, receive a partial delivery and reconcile the remaining quantity.

**Data and interfaces:** Own delivery/load headers, line snapshots and receipt events. Route canonical piece transitions through the protected lifecycle writer; canonical arrival status is delivered. Split lots through the existing quantity-conserving operation when required.

**Screen and interactions:** Provide load planning, printable manifests, shipment/receipt details, quantity discrepancies and unresolved receipt work. Separate planned delivery date from actual delivery time.

**Authority and failure rules:** Prevent the same available quantity being reserved or shipped twice. Receipt retries are idempotent; discrepancies remain explicit. A logistics screen cannot bypass fabrication eligibility or directly update pieces.

**Required acceptance tests:** Test competing load assignments, partial shipment and receipt, damaged/missing quantities, duplicate scans, receipt replay, cancelled loads and tenant isolation. Reconcile known quantity/weight before and after each action.

**Done when:** A partial delivery leaves the correct remainder, all affected screens agree on delivered quantities and the manifest preserves the actual issued lot/revision references.

### M12 — Procurement and material commitments

**Prerequisites:** M8, M11

**User outcome:** Create a material requirement, request/approve a purchase order and record partial material receipts against it.

**Data and interfaces:** Own requirements, purchase orders, lines, approval versions and receipt events. Use vendor identity snapshots until the shared directory arrives in M31. Financial cost-code integration is introduced by M15 after that authority exists.

**Screen and interactions:** Provide requirement-to-order traceability, quantities/units, promised dates, receipt history, shortfall filters and attachment evidence. Clearly distinguish an approved order from an order actually sent.

**Authority and failure rules:** Use exact monetary arithmetic and explicit unit conversions. Amend an approved order through a versioned change. Over-receipts require an explicit permitted discrepancy workflow; never silently change the ordered quantity.

**Required acceptance tests:** Exercise mixed units, partial receipts, duplicate receipt requests, cancelled lines, revised price/quantity and unauthorized approval. Keep a receipt failure from falsely marking a requirement fulfilled.

**Done when:** Every received amount traces to an order line, outstanding requirements reconcile and material readiness uses confirmed receipts rather than scheduled promises.

### M12.1 — Shop planning and production coordination

**Prerequisites:** M9, M10, M12

**User outcome:** Plan eligible shop work by station or crew and compare planned effort with actual production completions.

**Data and interfaces:** Own station planning assignments and effort estimates; reuse canonical station completion and piece lifecycle events from M9. Consume material and drawing readiness. Declare the capacity unit used by each station.

**Screen and interactions:** Provide station queues, blocked-work reasons, planned/actual hours and reassignment controls. Show summaries derived from actionable leaf lots and avoid counting split parents.

**Authority and failure rules:** Planning an assignment does not complete production. A release hold or missing required material blocks the affected protected operation; overrides need the domain-specific permission and audit reason.

**Required acceptance tests:** Race a new hold with production advancement; split an assigned lot; record/retry a station event; compare queue totals to canonical register totals. Test unavailable readiness evidence.

**Done when:** Shop personnel can follow the queue to the canonical production action, and planning, completion and readiness remain distinct and reconciled.

### M13 — Daily field reports, labor/equipment/material and photos

**Prerequisites:** M11, M12.1

**User outcome:** Record a daily report with crew hours, equipment, delivered/installed work, weather notes and annotated photos, then submit it for review.

**Data and interfaces:** Own daily logs, labor/equipment/material entries, photo references and review events. Attach existing piece/delivery references where useful. Expense and contract integrations are added only by their later modules.

**Screen and interactions:** Provide a date/project report list, editable draft, crew and equipment rows, captioned photos, review status and printable report. Explicitly show unsaved fields and failed uploads.

**Authority and failure rules:** Server-derived actor/time identify submissions and approvals. An approved report needs a correction revision; editing descriptive installed quantities must not secretly advance canonical pieces.

**Required acceptance tests:** Test midnight/time-zone boundaries, duplicate submit, failed photo upload, draft restoration, rejection/resubmission and forbidden edits after approval. Verify signed attachment access across tenants.

**Done when:** A field user can produce a complete report, a reviewer can approve or return it, and the exported report matches the saved revision and attachments.

### M13.1 — Field offline outbox and reconciliation

**Prerequisites:** M13

**User outcome:** Create and edit daily-log drafts and queue photo uploads offline; reconnect and understand exactly what synchronized.

**Data and interfaces:** Own scoped local draft/outbox records, client operation IDs, upload checkpoints and conflict records. Use a supported browser storage mechanism with explicit quota/eviction handling.

**Screen and interactions:** Show offline state, queued/sending/synced/failed counts, per-item retry and conflicting fields. Warn before discarding unsynchronized work. Expose no offline punch feature before M14.

**Authority and failure rules:** Re-authenticate and recheck project access before replay. Clear or isolate local records across user/organization changes. Do not report synced until durable server acknowledgement; preserve failed local payloads for recovery.

**Required acceptance tests:** Cut connectivity during upload and submission, restart the browser, revoke membership before replay, log in as another user, exhaust storage and replay the same operation twice.

**Done when:** Offline daily reports survive a restart and synchronize once, with visible recoverable conflicts and no cross-user disclosure or duplicate server reports.

### M14 — Punch lists and quality inspections

**Prerequisites:** M13.1

**User outcome:** Create a location-linked issue, assign corrective work, attach evidence and have an authorized reviewer verify closure.

**Data and interfaces:** Own punch items, inspection templates/runs, responses, corrective actions and closure events. Add optional revision-bound sheet anchors. Extend the existing outbox only after these entities and replay endpoints exist.

**Screen and interactions:** Provide list/board filters by owner, location, severity and due date, mobile capture, inspection checklists and a verification queue. Show open/reopened history.

**Authority and failure rules:** Reported complete and independently verified closed are separate states. Template edits cannot rewrite completed inspections. A critical finding blocks another workflow only through an explicit domain rule.

**Required acceptance tests:** Test failed inspection responses, missing required photos, reassignment, overdue dates, reopening, unauthorized closure, offline duplicate replay and a drawing revision change.

**Done when:** An issue can be captured offline, synchronized, corrected and verified with a preserved evidence trail; reopened work appears in the relevant operational queue.

### M14.1 — Safety observations and incident records

**Prerequisites:** M14

**User outcome:** Record a safety observation or restricted incident, assign corrective actions and track their reviewed resolution.

**Data and interfaces:** Own safety observations/incidents, classifications, restricted attachments and corrective-action references. Minimize personal data and specify separate access for sensitive details.

**Screen and interactions:** Provide quick observation capture, restricted incident detail, action due dates and aggregate reports that omit protected narrative. Explain visibility before attachment upload.

**Authority and failure rules:** Project membership alone does not grant incident access. Keep sensitive content out of telemetry, notifications, search snippets and ordinary exports. Do not imply legal reporting compliance without separately verified requirements.

**Required acceptance tests:** Test ordinary crew, safety reviewer and unrelated tenant access through UI, storage and direct endpoints. Verify that aggregate counts cannot expose restricted details or attachments.

**Done when:** Authorized staff can resolve safety actions, while restricted records remain inaccessible through every supported read/export path.

### M15 — Cost codes, budgets and schedule of values

**Prerequisites:** M12, M14.1

**User outcome:** Establish a project budget and schedule of values, allocate work packages and reconcile approved procurement commitments.

**Data and interfaces:** Own cost codes, approved budget versions, SOV lines and allocation links. Use fixed decimal or integer minor units with an explicit currency/rounding policy. Add the deferred procurement cost-code integration here.

**Screen and interactions:** Provide editable drafts, approval/version comparison, original/revised budget columns and allocation reconciliation. Separate costs, contract billing values, commitments and actual expenses.

**Authority and failure rules:** SOV is the billing allocation authority; operational progress is supporting evidence rather than automatic earned billing. Approved versions are immutable. Duplicate links cannot count a commitment twice.

**Required acceptance tests:** Test fractional quantities/rates, cent rounding, negative adjustments, allocation above/below totals, concurrent approvals and revised purchase orders. Hand-reconcile budget and SOV fixtures.

**Done when:** Approved budget/SOV totals reconcile exactly and the UI explains unallocated or mismatched amounts instead of silently forcing balance.

### M16 — Change requests and change orders

**Prerequisites:** M15

**User outcome:** Turn an RFI or field condition into a priced change request and an approved contract change with traceable scope.

**Data and interfaces:** Own request/change-order versions, line items, attachments, approval events and resulting authorized budget/SOV adjustments. Link existing RFIs, drawings and WPs.

**Screen and interactions:** Provide request register, cost/schedule impact worksheet, pending/approved/rejected states and comparison of submitted versus approved scope. Show approval evidence and effective date.

**Authority and failure rules:** A pending request is exposure, not approved contract value. Apply an approved change exactly once in a transaction. Corrections create a revision or reversal with audit, not silent mutation.

**Required acceptance tests:** Test rejected requests, partial approvals, credit changes, concurrent approve requests, duplicate replay and an edit after submission. Reconcile original contract plus approved changes to revised value.

**Done when:** An approved change updates the authorized financial baseline once, and every resulting amount traces to its approved version without counting pending exposure as revenue.

### M17 — Pay applications and retainage

**Prerequisites:** M16

**User outcome:** Prepare a period pay application from the approved SOV, review stored materials and retainage, and issue an immutable application snapshot.

**Data and interfaces:** Own pay-application headers/lines, period boundaries, approval/issue versions and prior-application references. Store exact billed amounts and explicit retainage rules; never infer prior billing from mutable current progress.

**Screen and interactions:** Provide previous/current/cumulative work, stored materials, retainage, balance to finish, reconciliation warnings and a printable issued application. Mark draft versus issued clearly.

**Authority and failure rules:** Prevent overlapping/duplicate issued periods under the chosen contract rules. Validate line caps and credits explicitly. Issued snapshots cannot change when the SOV or rate changes later; corrections require an authorized adjustment.

**Required acceptance tests:** Hand-check multiple periods, fractional cents, retainage changes, stored-material drawdown, credit changes, withdrawn drafts and duplicate issue requests. Compare screen, exported totals and persisted values.

**Done when:** Two consecutive applications reconcile line by line and to the contract total, with prior amounts unchanged after subsequent project edits.

### M18 — Backcharges and time-and-material tickets

**Prerequisites:** M13, M17

**User outcome:** Capture authorized extra work or a backcharge with daily evidence, price its lines and submit it through review.

**Data and interfaces:** Own ticket/backcharge versions, labor/equipment/material pricing lines, evidence links and approval events. Link approved financial effects through M16 or the declared cost authority without double posting.

**Screen and interactions:** Provide mobile capture, signature/acknowledgement evidence, disputed/approved states and exportable detail. Distinguish acknowledgement of attendance from acceptance of a price or liability.

**Authority and failure rules:** Rate changes do not rewrite previously issued tickets. A signature field must identify what was acknowledged. No automatic emailing, collections or external demands before explicit authorized delivery through M33.

**Required acceptance tests:** Test rate snapshots, overtime rules as configured, disputed quantities, missing evidence, duplicate approval and shared evidence referenced by several tickets. Reconcile posted amounts once.

**Done when:** A reviewer can reproduce a ticket total from its saved quantities/rates and see the exact financial consequence of approval or dispute.

### M19 — Expenses and actual cost capture

**Prerequisites:** M15, M18

**User outcome:** Capture a receipt, code the expense, review it and reconcile the resulting actual cost.

**Data and interfaces:** Own expenses, line allocations, receipt objects, review/payment references and duplicate candidates. Use existing cost-code and approval authorities; payment status requires actual evidence.

**Screen and interactions:** Provide receipt upload, manual entry, split coding, review queue and posted-cost detail. Deterministic/manual capture must work before AI extraction is added in M25.

**Authority and failure rules:** An uploaded receipt is not proof of payment or approval. Prevent duplicate posting using stable source identity plus reviewable duplicate detection; preserve corrections as audited adjustments.

**Required acceptance tests:** Test split allocations, tax/rounding, duplicate receipts, currency mismatch, failed upload, returned approval and posting retries. Reconcile expenses against the actual-cost summary.

**Done when:** Approved expenses appear once in the correct cost codes, with visible unallocated amounts and a traceable receipt/approval trail.

### M19.1 — Contracts and commercial commitments

**Prerequisites:** M19

**User outcome:** Register an executed contract, its parties, value, dates, obligations and approved amendments.

**Data and interfaces:** Own contract records, document versions, obligation reminders and references to existing SOV/change authorities. Store party snapshots until M31 links a shared contact. Define which approved authority controls each commercial total.

**Screen and interactions:** Provide contract register, version history, obligations, linked changes and document access. Label draft, executed and superseded documents distinctly.

**Authority and failure rules:** Do not parse an unsigned draft into an approved financial baseline. Editing metadata cannot rewrite an executed document or issued billing history. Limit sensitive commercial documents by role.

**Required acceptance tests:** Test amendment history, duplicate document uploads, expired obligations, restricted access and disagreement between contract metadata and approved SOV totals.

**Done when:** A user can locate the governing executed document and reconcile its approved amendments with the financial baseline; unresolved disagreements are visible.

### M20 — Subscriptions, entitlements and billing

**Prerequisites:** M19.1

**User outcome:** An authorized organization owner can inspect their subscription and, where approved for this product, change it through a test-mode provider flow.

**Data and interfaces:** Own provider-customer mappings, webhook receipts, subscription snapshots and server-derived entitlements. Inspect and preserve current repository restrictions on pricing and payment changes before implementation.

**Screen and interactions:** Provide plan/usage state, provider portal or checkout entry where allowed, pending-change feedback and webhook reconciliation status. Existing customer access must not depend on a browser callback alone.

**Authority and failure rules:** Never allow client writes to plan or entitlement fields. Verify provider signatures and replay idempotently; tolerate out-of-order events through authoritative reconciliation. Keep test/live identifiers separate.

**Required acceptance tests:** Test duplicate/out-of-order webhooks, checkout cancellation, delayed activation, invalid signatures, payment failure and unauthorized plan writes. Use provider test mode and mocked failure fixtures.

**Done when:** Entitlements match verified provider state and remain secure under replay; any required live charging authorization is recorded separately from module test completion.

### M21 — Configurable feature availability

**Prerequisites:** M20

**User outcome:** Configure allowed modules for an organization while preserving predictable navigation and direct-route behavior.

**Data and interfaces:** Own flag definitions, organization overrides and audited configuration changes. Extend the static module availability foundation; consume M20 entitlements where applicable.

**Screen and interactions:** Provide an authorized configuration screen and consistent navigation, launcher, route and action states. Explain unavailable capabilities without showing fake data.

**Authority and failure rules:** Flags are availability controls, not replacements for database authorization. A disabled UI cannot leave protected endpoints callable by unauthorized users. Do not hide an in-progress write before its outcome is shown.

**Required acceptance tests:** Toggle a module with an open deep link, test stale caches and unauthorized override writes, and verify navigation/route/server behavior for entitled and non-entitled organizations.

**Done when:** Availability is consistent across entry points and audited changes cannot grant privileges beyond the underlying role and entitlement checks.

### M22 — Exports, retention and deletion workflows

**Prerequisites:** M21

**User outcome:** Request an authorized project export and review the scope and consequences of a retention or deletion request.

**Data and interfaces:** Own export/deletion jobs, manifests, retention policies and evidence of completion. Enumerate domain records, object storage and retained audit/billing exceptions explicitly; do not promise erasure incompatible with required retention.

**Screen and interactions:** Provide scope preview, job progress, expiring download links and a concrete deletion preview. Show blocked requests and retained categories with reasons.

**Authority and failure rules:** Check tenant/role at request and download. Never execute a production destructive request merely to demonstrate the feature. Keep deletion jobs idempotent and resumable, with recoverable failure states.

**Required acceptance tests:** Export a multi-module fixture and verify counts, relationships and file checksums. Test expired links, cross-tenant requests, interrupted jobs and deletion of an isolated disposable tenant under the declared policy.

**Done when:** Exports are complete and access-controlled; a disposable deletion rehearsal matches the preview and reports every retained or failed item honestly.

### M23 — Observability, support diagnostics and service health

**Prerequisites:** M22

**User outcome:** Identify a failed user operation from its correlation ID and distinguish healthy, degraded and unknown service state.

**Data and interfaces:** Own sanitized error/event schemas, health probes, operation correlation and support diagnostic bundles. Connect the selected monitoring provider without exposing domain records or credentials.

**Screen and interactions:** Provide useful retry/error messages and an authorized health view with last-check time, failed dependency and diagnostic reference. Mask secrets and sensitive attachment contents.

**Authority and failure rules:** A cached success is not current health. A timeout is unknown/degraded according to a declared rule, not a fabricated outage cause. Monitoring failure must not prevent the primary workflow.

**Required acceptance tests:** Inject database, storage, gateway and network failures; trace one operation across client/server logs; verify redaction and access restrictions; test monitoring provider failure.

**Done when:** A support person can locate a reproducible failure using safe diagnostics, while ordinary users receive an accurate status and actionable recovery path.

### M24 — Shared AI gateway and job protocol

**Prerequisites:** M23

**User outcome:** Run an authorized test operation through one controlled AI gateway and inspect its outcome, usage and failure state.

**Data and interfaces:** Own gateway request/response schemas, allowed operations, provider adapters, timeouts, request IDs, rate limits and job persistence where needed. All later AI capabilities use this interface.

**Screen and interactions:** Provide only authorized diagnostics plus consistent pending/cancel/retry/error primitives for subsequent features. Do not expose a raw provider-key configuration to ordinary users.

**Authority and failure rules:** Keep provider secrets server-side. Validate model output against the operation schema. Treat source documents as untrusted data, not instructions. Record unavailable cost estimates as unknown, with pricing version when known.

**Required acceptance tests:** Test malformed output, timeout, cancellation, oversized documents, prompt injection text, permission revocation and duplicate requests. Verify usage limits and redacted traces.

**Done when:** The gateway reliably returns validated results or typed failures, with attributable usage and no privileged credentials or unrestricted provider operations in the browser.

### M25 — Assisted document extraction

**Prerequisites:** M24

**User outcome:** Extract proposed title-block, RFI or receipt fields and explicitly review them before saving through existing module commands.

**Data and interfaces:** Own extraction proposals, source page/region references, model/version metadata, validation errors and acceptance decisions. Extend M3.1 and M19 manual flows without replacing their authorities.

**Screen and interactions:** Show source beside proposed fields, confidence limitations, changed-value highlights and accept/edit/reject controls. Preserve the manual workflow when extraction fails or is unavailable.

**Authority and failure rules:** AI output never directly changes approved records, release status or cost postings. Unsupported confidence scores must not be fabricated. Recheck source revision and target row version before applying a proposal.

**Required acceptance tests:** Test rotated/scanned sheets, duplicate sheet numbers, illegible text, adversarial document instructions, stale proposals and gateway failure. Ensure rejected fields are not saved.

**Done when:** A user can trace each accepted value to its source and saved audit; failed extraction leaves the original document and manual workflow usable.

### M25.1 — Revision impact intelligence

**Prerequisites:** M25

**User outcome:** Compare two exact drawing revisions, review proposed changes and trace their exposure to linked RFIs, WPs and actionable piece lots.

**Data and interfaces:** Own revision-analysis runs, evidence anchors and reviewed findings. Reuse the canonical comparison and relationship repositories, including set-based and legacy direct drawing links.

**Screen and interactions:** Provide comparison, evidence-backed findings, affected-work filters and reviewed RFI/change-request drafts. Separate extracted observations, inferred consequences and user decisions.

**Authority and failure rules:** AI cannot approve drawings, create an active hold, release fabrication or send a message without the existing authorized action. Incomplete relationship evidence must not produce an all-clear exposure result.

**Required acceptance tests:** Test repeated marks, split parents, overlapping direct/set links, failed relationship pages, changed current revision and an invented model finding. Reconcile exposed quantities against canonical leaf fixtures.

**Done when:** Every retained finding identifies its source revisions and supporting evidence; exposure is deduplicated and users explicitly choose any resulting operational action.

### M25.2 — Assisted imports and reconciliation

**Prerequisites:** M25.1

**User outcome:** Convert a supported spreadsheet/PDF into a reviewed import preview, correct mappings and commit valid rows through canonical import commands.

**Data and interfaces:** Own import proposals and field mapping versions; reuse existing batch IDs, row errors and idempotent writers. Declare supported formats and units; retain source provenance.

**Screen and interactions:** Provide source/mapping/preview/reconcile steps, invalid-row filters, duplicate candidates, totals before/after and an explicit commit result.

**Authority and failure rules:** AI interpretation must not bypass uniqueness, tenant checks, quantity conservation or official numbering. Unclear mark identity and unit assumptions require review; partial commit rules must be explicit.

**Required acceptance tests:** Test 1,201 rows, duplicate files, multi-sheet workbooks, merged headers, mixed units, corrupt rows and commit interruption. Retry without double creation and reconcile every source row.

**Done when:** Each source row is accounted for as imported, deliberately excluded or rejected, and canonical totals match the reviewed committed preview.

### M26 — IFC viewer and canonical model status

**Prerequisites:** M9.1, M25.2

**User outcome:** Load an IFC model, select a physical element, inspect its canonical linked lot and apply only permitted lifecycle actions.

**Data and interfaces:** Own model/upload versions and reviewed element-to-piece mappings; consume canonical lifecycle, hold, relationship and tonnage authorities. Keep IFC GUID, render-fragment identity and business lot identity distinct.

**Screen and interactions:** Provide model tree/search, element isolation, fit/section tools, status legend, selection panel and explicit unmatched/ambiguous states. Reset selection safely when model/project changes. Support the declared desktop/mobile performance envelope.

**Authority and failure rules:** Use IFC units, placements and model coordinates from verified parser behavior; do not apply an arbitrary global rotation or assume every file is Y-up. Model geometry is not authoritative fabricated tonnage. No direct pieces writes or automatic links from ambiguous marks.

**Required acceptance tests:** Use known orientation/unit fixtures, multi-mesh elements, duplicate marks/GUID conflicts, split lots, stale selections, model replacement, forbidden status transitions, failed live updates and whole-element highlighting. Reconcile model-linked totals to the register.

**Done when:** The viewer navigates a representative real model, highlights the complete selected element and agrees with canonical operational state; unmatched, incomplete and inferred evidence remain visible.

### M27 — Operational command center and alerts

**Prerequisites:** M26

**User outcome:** Open the project command center, understand current blockers and navigate to the exact work needing action.

**Data and interfaces:** Own alert rule configurations, evaluation runs, deduplication keys, acknowledgement/snooze events and read-model contracts. Consume existing domain authorities with completion/error state.

**Screen and interactions:** Provide prioritized action rows with owner, reason, age, due date, impact evidence and next action. Show freshness and failed-source warnings; no healthy label over missing evidence.

**Authority and failure rules:** Alerts do not become a second workflow status writer. Repeated evaluations must not create duplicate alerts. Acknowledged is not resolved; resolution follows the source condition. External notifications wait for M33.

**Required acceptance tests:** Fail one source, exceed a normal query page, resolve/reopen a condition, change project access and run duplicate evaluations. Verify exact record navigation and deduplicated exposure.

**Done when:** The command center reflects demonstrable source conditions, distinguishes unknown from zero and refreshes appropriately when the underlying issue changes.

### M28 — Portfolio and executive reporting

**Prerequisites:** M27

**User outcome:** Compare authorized projects across schedule, detailing, production and cost, and drill into the source behind each measure.

**Data and interfaces:** Own report definitions and authorized aggregation contracts. Preserve data readiness separately from rows and aggregate only canonical facts using declared weighting and date windows.

**Screen and interactions:** Provide All Projects and selected-project views, completeness badges, numerator/denominator explanations, filters and export. Keep current-period, cumulative and forecast measures visibly distinct.

**Authority and failure rules:** No project selection cannot silently disable queries and display zeros. Do not average percentages without an agreed weight. Unknown weight/cost/progress stays unknown or partial, not zero.

**Required acceptance tests:** Test no projects, multiple projects, one inaccessible project, partial query failure, unequal project sizes, split lots and date-boundary changes. Reconcile dashboard, drilldown and export.

**Done when:** Portfolio totals match accessible source records and every partial or unavailable metric is labeled; no contradictory health and blocker states remain.

### M29 — Closeout and warranty

**Prerequisites:** M28

**User outcome:** Assemble a closeout package from approved documents, completed punch work and required certificates, then track warranty obligations.

**Data and interfaces:** Own closeout requirements, evidence links, package versions, acceptance events and warranty records. Snapshot issued document revisions rather than following mutable current pointers.

**Screen and interactions:** Provide completeness checklist, missing/expired evidence, package preview/download, acceptance history and warranty due-work list.

**Authority and failure rules:** An uploaded document does not satisfy a requirement until its declared verification condition passes. Package issue cannot silently close unresolved punch or safety work. Avoid generating legal warranty terms.

**Required acceptance tests:** Test missing files, superseded revisions, unresolved punch, expired certificates, issue retries and later document replacement. Reopen an accepted requirement through an audited change.

**Done when:** The issued closeout package is reproducible and every requirement shows its exact evidence or unresolved reason; warranty follow-up references the accepted contractual record.

### M30 — Project risk and exposure register

**Prerequisites:** M29

**User outcome:** Review deterministic operational risks, add an assessed risk and track mitigation ownership and outcomes.

**Data and interfaces:** Own assessed risks, scoring definitions, mitigation actions and review history. Consume alert/source relationships; deduplicate shared piece, schedule and cost exposure.

**Screen and interactions:** Provide likelihood/impact rationale, linked evidence, mitigation owner/due date and changes over time. Label modeled exposure and user judgement separately from actual incurred cost.

**Authority and failure rules:** Risk scores are aids under a documented model, not guarantees or hidden AI decisions. Missing evidence lowers certainty, not the risk score by default. Do not sum overlapping exposure as independent losses.

**Required acceptance tests:** Test multiple risks touching the same lots/change, stale reviews, unavailable sources, mitigation completion without source resolution and scoring-version changes.

**Done when:** A reviewer can reproduce each score and understand which exposure is shared, estimated, verified or unknown, with no unexplained rollups.

### M31 — Contacts, vendors and project directory

**Prerequisites:** M30

**User outcome:** Maintain shared organization contacts and vendors, assign project responsibilities and link existing party snapshots deliberately.

**Data and interfaces:** Own directory entities, contact methods, project assignments and audited merge mappings. Preserve historical recipient/contract/vendor snapshots on issued records.

**Screen and interactions:** Provide role/company filters, contact detail, duplicate review and a preview of records affected by a merge or link.

**Authority and failure rules:** Do not infer that matching names identify the same person. Directory edits cannot change historical recipients or grant project access; membership and external-contact identity remain distinct.

**Required acceptance tests:** Test duplicate names/emails, vendor merge, archived contacts, restricted fields and linking older order/contract snapshots. Verify no automatic user invitation or email.

**Done when:** Current workflows can select a canonical contact while historical documents retain their actual party details and access remains independently controlled.

### M31.1 — Project documents, notes and search

**Prerequisites:** M31

**User outcome:** File supporting documents and notes, find them by authorized project context and open their exact revision or related record.

**Data and interfaces:** Own general document versions, note revisions, tags and search indexing contracts. Link to drawings and contracts instead of importing their files into a competing revision authority.

**Screen and interactions:** Provide document list, version/history, note editor, relation picker and search results with source type, project and revision. Show indexing delay or unavailable search explicitly.

**Authority and failure rules:** Search and previews must enforce the same authorization as the original record. Do not leak restricted incidents, commercial documents or deleted content through snippets/caches.

**Required acceptance tests:** Test revoked access, replaced documents, indexing failure, stale results, duplicate filenames and attachment download isolation. Verify results navigate through normal app routes.

**Done when:** Users can reliably find accessible records without duplicating their authorities, and unauthorized content is absent from both results and previews.

### M32 — Operational calculators

**Prerequisites:** M31.1

**User outcome:** Use clearly scoped quantity, unit-conversion, productivity or estimate calculators and save their inputs with the result.

**Data and interfaces:** Own versioned calculator definitions and saved calculation records where needed. Declare formulas, supported units, rounding and assumptions; separate estimates from authoritative operational quantities.

**Screen and interactions:** Provide input units, validation, worked-result breakdown, reset and export. Display unsupported conditions instead of plausible-looking outputs.

**Authority and failure rules:** Never label a calculation as structural approval, a safe lift or regulatory compliance without a separately scoped, professionally validated engineering workflow. A saved estimate cannot overwrite certified or imported weights.

**Required acceptance tests:** Check formulas against independently calculated fixtures, boundary/zero/negative inputs, imperial/metric conversions, extreme values and changed formula versions.

**Done when:** Each supported result is reproducible from saved inputs and formula version, with scope and units visible; unsupported inputs fail clearly.

### M33 — Email delivery and communication records

**Prerequisites:** M31.1, M32

**User outcome:** Preview exact recipients, attachments and content for an existing submittal, transmittal or notice, then send through an authorized provider.

**Data and interfaces:** Own delivery intents, recipient snapshots, idempotency keys, provider events and attachment manifests. Connect earlier document issue records without rewriting their snapshots.

**Screen and interactions:** Provide reviewable send preview, confirmed recipient list, queued/sent/delivered/failed states as supported by real provider events, retry and communication history.

**Authority and failure rules:** Use server-side provider credentials and verified callbacks. A queued job is not delivered mail. Prevent duplicate sends after timeout; reconcile uncertain outcomes before retry. Never treat the build prompt as permission to email real contacts.

**Required acceptance tests:** Use test recipients/sandbox to exercise provider acceptance, delayed/failed delivery, duplicate callbacks, revoked attachment access, timeout and retry. Verify the exact issued files and revision labels.

**Done when:** Authorized test sends are attributable and idempotent, and the UI truthfully distinguishes queued, provider-accepted, delivered where evidenced, and failed outcomes.

### M33.1 — External file and business-system connectors

**Prerequisites:** M33

**User outcome:** Connect one explicitly selected provider, browse authorized source records and import or link a reviewed item with provenance.

**Data and interfaces:** Own connector installations, encrypted server-side tokens, scoped sync cursors, source IDs and synchronization jobs. Implement only named supported providers; others remain absent.

**Screen and interactions:** Provide connection status, scope explanation, source picker, import preview, per-item reconciliation and disconnect/revoke behavior.

**Authority and failure rules:** Never expose credentials in the SPA. Define source-versus-local authority and conflict policy per field. External deletion must not silently erase an issued local document or canonical history.

**Required acceptance tests:** Test expired/revoked tokens, pagination, duplicate events, moved/deleted source files, provider rate limits and connection to the wrong organization.

**Done when:** The selected connector completes a real authorized test round trip with clear ownership, no duplicates and recoverable failures; unsupported integrations are not shown as working.

### M34 — Resource and crew capacity planning

**Prerequisites:** M10.1, M12.1, M33.1

**User outcome:** Assign crews, people or equipment to scheduled work and understand capacity conflicts across the authorized planning horizon.

**Data and interfaces:** Own resource calendars, availability and assignments linked to existing tasks/stations. Define headcount, hours, units and utilization denominators explicitly before building rollups.

**Screen and interactions:** Provide allocation grid, synchronized schedule context, capacity/overload indicators and reassignment preview. Display unavailable calendars and pending assignments distinctly.

**Authority and failure rules:** Do not treat three people as three hours or sum a crew and its members twice. Cross-project planning requires access to each contributing assignment; hidden work must not leak details.

**Required acceptance tests:** Test part-time calendars, overlapping assignments, crew membership changes, holidays, multi-project demand, unavailable evidence and concurrent moves.

**Done when:** Capacity and utilization match a hand-checked fixture and reassignment updates the relevant schedule/queue without altering production completion facts.

### M35 — Responsive field acceptance and performance

**Prerequisites:** M34

**User outcome:** Perform the core drawing-to-field workflow on supported desktop/tablet/phone sizes using normal navigation.

**Data and interfaces:** Own final performance budgets, representative seed datasets and accessibility/device acceptance records. Preserve existing module authorities. A native wrapper is included only if the chosen target explicitly requires it.

**Screen and interactions:** Finish touch targets, dense desktop layouts, keyboard navigation, focus behavior, full-screen workspaces and PDF/IFC panel behavior. Validate fit with panels both collapsed and open.

**Authority and failure rules:** Performance optimization cannot truncate rows, hide failed evidence or discard unsaved work. Declare device/model/document limits from measurement, not guessed marketing claims.

**Required acceptance tests:** Run authenticated flows at desktop and 390px width, keyboard-only navigation, slow/offline networking, large PDFs/models and more than 1,000 linked records. Measure initial load and interaction budgets on declared hardware.

**Done when:** Core workflows are reachable and usable on the supported devices, with measured budgets and no unresolved critical accessibility, data-integrity or silent-failure defects.

### M35.1 — Recovery rehearsal and final integrated release gate

**Prerequisites:** M35

**User outcome:** Restore a representative backup into an isolated environment and demonstrate the complete operational story before requesting any necessary production release approval.

**Data and interfaces:** Own backup manifests, checksums, retention configuration, restoration procedures and release evidence. Cover database plus storage objects; configure the authorized offsite provider, such as the existing Backblaze B2 destination, through secrets.

**Screen and interactions:** Provide operator documentation for backup freshness, failure, restore verification and rollback. Record separate evidence for code gates, live access checks, preview acceptance and production state.

**Authority and failure rules:** A successful upload is not a proven restore. Use distinct dated backup paths, least-privilege access and explicit retention. Do not run blanket rclone cleanup or delete old versions as an incidental test; preserve recovery points under the approved policy.

**Required acceptance tests:** Restore schema/data/files, verify checksums and relational counts, sign in as two roles/tenants, reproduce an issued drawing package and pay application, and simulate one failed backup. Keep restored outbound integrations disabled or sandboxed.

**Done when:** The isolated restored app passes the integrated scenarios in §13; all module evidence is recorded. Any pending production deployment is stated as pending, with a concrete reviewable release and rollback procedure.

## 13. Integrated acceptance, handoff and reference record

### 13.1 One connected operational story

Run this story against disposable, authenticated staging data after M35.1. Keep
intermediate states and evidence so a reviewer can reproduce each conclusion. This
is additional integration acceptance; it does not replace each module's gate.

1. **Establish boundaries.** Create Organization A with a PM, detailing coordinator,
   shop user, field user and read-only reviewer. Create unrelated Organization B.
   Give A two projects. Confirm all relevant direct reads, writes and private files
   enforce the expected organization, project and role restrictions.
2. **Account for drawing intake.** Upload a 50-page PDF containing 48 intended
   sheets and two explicitly excluded cover/blank pages. Review sheet number,
   title, revision and discipline. Commit all 50 page outcomes; repeat the request
   and verify no additional sheet or revision appears. Separately use a dataset
   above 1,000 records and verify complete pagination.
3. **Use the register as a working tool.** Search, sort, filter and select sheets;
   bulk-update one enabled field while untouched fields remain unchanged. Force one
   row conflict and verify that the result identifies the exact failed row. Open a
   sheet from normal navigation and see the entire page at default fit with panels
   collapsed; open each panel and verify fit remains usable. Zoom, pan and return to
   fit without losing the selected sheet.
4. **Preserve drawing history.** Annotate Revision A as two different users, then
   publish B. Confirm both annotations remain attached to A, B becomes current and
   historical files remain accessible to authorized users. Compare A/B in overlay
   and side-by-side modes. Publish C from a stale B expectation while another user
   changes the current revision; the conflict must prevent silent overwrite.
5. **Exercise a real blocker.** Place a required-reason hold on B. Try a concurrent
   second hold, then amend the reason. There must be one active hold, unchanged
   original placement identity/time, and an amendment event. Publish C while held:
   the sheet remains held. A stale release request for an older hold cannot clear
   a newly placed hold. Releasing never restores B's approval onto C.
6. **Run mixed review outcomes.** Submit exact sheet revisions in Round 1. Record
   an approved sheet, a BFA response with an unresolved condition, and an R&R
   response. Resolve/acknowledge conditions under the declared workflow and resubmit
   only the necessary sheets in Round 2. Round 1 membership, responses and files
   remain unchanged. Display the governing round and ball in court per sheet.
7. **Resolve an RFI deliberately.** Link the blocked sheet and a GC reference to an
   RFI. Record an answer without releasing its hold; it stays held. Use the explicit
   selected-hold release action with the required permission, and verify answer,
   selected hold release and audit commit atomically. An unrelated hold stays active.
8. **Issue documents and evaluate fabrication separately.** Preview a package of
   exact revisions and issue it once. Retry issuance; it must return the same issue
   result. Attempt fabrication release with missing approval, an active hold and
   an unavailable required evidence source; each must fail with the exact reason.
   Race a new hold against release and verify the database serializes the outcome.
   Once eligible, record the authorized release and its immutable gate snapshot.
9. **Keep piece quantities honest.** Import a representative parent/lot dataset,
   including repeated marks and both direct-sheet and drawing-set links. Split one
   lot, confirm conserved quantities and known weight, then re-run detailing
   validation. The parent is excluded from actionable totals and overlapping links
   do not double-count exposure. Failure on the last relationship page yields an
   incomplete/error result, never a clean validation badge.
10. **Coordinate shop, schedule and logistics.** Assign eligible leaf lots, complete
    permitted production steps and schedule their work under a parent task. Capture
    a baseline, change a dependency and review the variance. Ship part of a lot,
    record a partial field receipt and reconcile the remainder. Arrival uses the
    canonical `delivered` lifecycle state. A model-viewer action produces the same
    protected transition and totals as the Piece Register.
11. **Complete field evidence.** Create a daily report and punch item offline,
    attach photos, restart, reconnect and replay once. Review the report and verify
    punch closure with the required role. A conflict or failed photo upload stays
    visible until resolved. Sign in as another user and confirm the first user's
    cached drafts are not disclosed.
12. **Reconcile financial periods.** Approve an SOV and one priced change. Prepare
    two consecutive pay applications with retained and stored-material amounts.
    Hand-check previous/current/cumulative values in exact cents. Change later
    source metadata and confirm issued applications do not change. Confirm pending
    changes, disputed backcharges and unapproved expenses are not silently posted.
13. **Verify portfolio truth.** Open All Projects, then one project. Compare totals
    to canonical leaves and approved financial facts. Deny or fail one data source:
    the dashboard must show partial/unavailable evidence instead of zero or a green
    all-clear. Follow each action row to the exact record through normal routes.
14. **Verify delivery and recovery.** Send an issued document only to an authorized
    test recipient, then replay a provider callback and confirm no duplicate send.
    Restore the backup into an isolated environment with outbound integrations
    disabled/sandboxed. Compare database counts, original file checksums, revision
    histories, holds, issued packages and pay applications. Record measured recovery
    time and any missing evidence; do not substitute a backup upload log for restore
    acceptance.

### 13.2 Required end-of-module report

Use this compact report after each verified module:

```text
Module: M[number] — [name]
Outcome: [what the user can now do]
Authority: [tables/services reused or introduced and protected writer]
Evidence: [commit + exact gate commands/results + DB/browser evidence links]
Demonstration: [entry route, action, persisted result, denied/failure case]
Limitations: [actual remaining limitations; no unsupported production claim]
Next: [next serial module and confirmed prerequisites]
Production: [unchanged / authorized preview / deployed with deployment evidence]
```

If blocked, record the failed gate, concrete evidence and required input or external
change. Continue resolving that module where possible; do not start a later module
and label the gap a follow-up. A reviewer should be able to tell exactly what works
and what remains unverified without reading the agent's entire conversation.

### 13.3 Instructions for the agent receiving this prompt

Start with repository inspection, not broad feature generation. Identify the target
checkout, its instructions, current commit, runtime, database environment and existing
module ledger. In an existing app, map implemented features to these acceptance cards
and verify them before replacing anything. Establish any genuinely missing product
choice before implementing the dependent behavior; resolve ordinary engineering
choices autonomously within the stated invariants.

Write the current module's bounded implementation checklist with the actual paths,
interfaces, fixtures and commands for that checkout. Use targeted regression tests
for new logic, complete the module gate, record evidence, and continue in serial order.
Do not start parallel module implementation or produce one large scaffold containing
all 54 modules. Do not mistake this document itself for a completed software build.

### 13.4 Reference provenance and intentional corrections

This brief was expanded from the two supplied/downloaded recreation briefs, the
user's sheet-hold migration excerpt, read-only inspection of a SteelBuild Sheets
browser distribution and current local Rev 2 source. The following files are useful
reference anchors when available; they are **not** dependencies needed to understand
this standalone prompt:

- Prior briefs: `RECREATE_STEELBUILD_PRO.md` in Downloads and in the downloaded
  `SteelBuild-Pro-Rev.2-main-2` directory.
- SteelBuild Sheets: `steelbuildsheetsdist.zip`; inspected static bundle labels and
  behavior references for drawing sets, GC drawings, sheet/IFC viewing, holds,
  revision comparison, title-block mapping, packages, submittals and transmittals.
  No authenticated walkthrough of that product was performed. The layouts and
  acceptance requirements above are an explicit target, not a claim of pixel-perfect
  reproduction or proof that the reference product implements them reliably.
- Hold contract: `supabase/migrations/20260908045525_drawing_holds.sql` and
  `src/hooks/useDrawingHolds.ts` in the Rev 2 reference. The supplied excerpt's
  statement that the migration was applied live is historical user-provided context;
  this document does not independently verify or apply that production migration.
- Workflow anchors: `src/lib/submittalStageMapping.ts`,
  `src/lib/fabReleaseGate.ts`, and
  `src/components/drawings/register/DrawingRegisterGridPanel.tsx`.
- Piece authorities: `src/lib/pieceControl/canonicalRollups.ts`, `tonnage.ts`,
  `lifecycle.ts`, and `queryKeys.ts`. Resolve the actual exports in the chosen
  checkout before editing a consumer.
- Navigation/deployment: `src/config/routes.js` and `.github/workflows/ci.yml` in
  the inspected Rev 2 source. A new typed catalog should preserve the single
  authority principle rather than the historical filename extension.

Deliberate departures from older descriptions:

| Earlier description or reference behavior | Required target in this prompt |
|---|---|
| Build broad phases or scaffold all modules | 54 ordered vertical modules, each verified before advancing |
| Early modules assume future AI, email or punch tables | Functional manual/local workflow first; integration owned by its later module |
| Gap-free official numbers | Atomic unique allocation; explicit voids and legitimate gaps |
| RLS alone secures every operation | RLS plus grants, tenant-consistent relationships, role checks and protected transactions |
| One upload equals one permanent drawing set | Stable logical sets, tracked upload batches and accounted-for pages |
| Revision history begins only after replacement | Immutable revision identity and provenance from the first upload |
| Markups stored as a stale whole-sheet array | Revision-bound, conflict-aware annotation persistence |
| Hold release restores a saved status from the browser | Transactional hold authority; current legitimate state remains authoritative |
| A second hold overwrites the original placement | One active hold, preserved placement and separate amendment history |
| Issue, approval and fabrication release mean the same thing | Distinct authorities with exact revision snapshots and a server release gate |
| Canonical piece arrival is `received` | Canonical state `delivered`; receipt remains an operational action |
| All Projects can show zero when project reads are disabled | Complete aggregation or explicit loading/partial/unavailable evidence |
| Any IFC model uses the same hard-coded rotation | Verified units/placements/orientation with known model fixtures |
| A successful CI build or backup upload proves production/recovery | Separate authenticated acceptance, deployment evidence and isolated restore rehearsal |

The target is complete when the module ledger and connected acceptance story prove
that drawings, approvals, holds, fabrication, field work and financial history agree.
A page count, table count, screenshot or feature list alone cannot establish that.
