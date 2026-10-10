# Production drawing cutover — exact source and legacy readiness

Status: **read-only preflight, not approval or execution of a production cutover**.
No SQL, ledger, customer record, source PDF, account, or provider state was changed.

The cutover affects fifteen stored approved/released Shop Drawing packages with
no captured manifest. **The 84 incomplete revision sources are metadata routing
gaps with existing parent-sheet/set PDF hints, not 84 absent PDFs.** However,
all 84 parent revision codes differ from their current revision rows. Every
package requires PM source review; neither status history nor these hints
justifies automatic copying, attestation or release.

## Observation and exact candidate

Source: main `e69d8cb7d5feaa31e2bb6bf79a2185368312513f`.
Catalog/ledger inspection: production `kjrwqagyeswwoxpjkcko` and staging
`ndyfjffsulfbwpmwdmic`, October 9, 2026, 14:44–14:59 UTC.
Any later application must repeat the preflight against its reviewed main SHA.

All nine versions below are **absent in production** and present as a single
full-payload statement in staging. SHA-256 of each staging ledger payload equals
the raw Git blob at the source above. Comparing function bodies separately found
all **31 final candidate function bodies** on staging byte-equivalent to their
last definitions in these ordered Git files (MD5 comparison of `pg_proc.prosrc`);
ledger presence alone was not used as proof of installed definitions.

| Pending version | Exact Git and staging ledger SHA-256 |
| --- | --- |
| `20261008013546` | `c4f4a86dda10c0965fd099e48d2b4c2af64c04fbf2b99392105103d3e1a1476a` |
| `20261008021100` | `70e55b0f4075f872df66d8a9016c3fa1cb7444d12b1987185e45134d1751b140` |
| `20261008022100` | `4494ece435afe5b65c823faf3ff7ac75dcee113a342c74cbde64d64e8ac45a50` |
| `20261008023000` | `55672c0e4bb545fcdb7643f16bb7e1a3002ed429328819cb8641bed22b831198` |
| `20261008032524` | `281a52c5d64136f81cf30e37240990f575eb2cea920398511d7e08b524984dbf` |
| `20261008041759` | `3c6f690ddde03e55618752456144dd04cbc1b3eca9254784bd9e030f505f5182` |
| `20261009070300` | `b4b77581e51a0c61ee63d47fa34d1010a123bb1759bee6889e0ca0ec719b0ea7` |
| `20261009125901` | `ba0d72e62e8df02777f53d653593d7d9f41811798e0cfb0d551e367ce034eebb` |
| `20261009140000` | `b22297e7d1c6fd1f3e2f5ae1af080695a28404cf450c563085a73754743f0311` |

Already-installed production prerequisites also match Git and staging:
MFA `20261007073051` (`8354f2ff700eb49b4d3e6580419c07087bc1e6cfbbe6222dec58bc1a52162e9e`),
numbered creation `20261007112918` (`29e8db4bd72c6f036aa8acc8437a73b4ef0defdad83787e6b809e50ba7a76eb6`),
and atomic billing `20261008071019`
(`3dfc1339eb999c33b5bad396d439958c8a6e6820071a612e33e686db9d5bbe44`).
Do not replay or restamp them.

Production has none of the candidate evidence, workflow-context, GC-to-shop link,
or checkout-intent tables. Both immediate parent foreign keys required by the
manifest are validated and non-deferrable: drawings→drawing_sets and
drawing_revisions→drawings. The current production `create_project(jsonb)`
definition remains the reviewed original MD5
`b933684ffdb42e8d4e28a3c013897556`. Production's package evaluator body equals
staging's retained `evaluate_fab_release_package_base` body
(`576bf6a3a10c43c514af67250945b359`); the unmodified split implementation also
matches in both environments (`pg_get_functiondef` MD5
`937ca75c991562999a3b70773f3fafce`).
No active transaction older than 60 seconds, idle transaction, or lock wait was
observed in the separate aggregate activity check. This is a point-in-time
observation, not a lock acquisition guarantee.

## Dependency order and client compatibility

Use the ordered versions above inside the reviewed manual transaction; retain
each original blob unchanged for its matching ledger statement. Embedded
transaction wrappers are execution concerns only, never a reason to alter the
stamped payload. Do not use db push, migration repair, or MCP apply_migration.

| Version | Dependency and effect | Older-client behavior |
| --- | --- | --- |
| 20261008013546 | Existing drawing/revision/RFI/signoff schema; replaces the set gate. | Same RPC shape; stricter current-sheet and exact Shop Drawing governance. |
| 20261008021100 | Existing split implementation, failure journal and piece/set relation; copies links to returned children atomically. | Same split contract; malformed or foreign links fail the split. No historical child backfill. |
| 20261008022100 | Same piece parent as split; serializes link/unlink and adds replacement. | Existing link/unlink signatures remain; container parents are refused. Ship with split correction. |
| 20261008023000 | Existing GC and shop parents; adds composite indexes, links and audit relation. | Additive API. Existing no-impact writes can be refused if reviewed impact links exist. These links never grant approval. |
| 20261008032524 | Existing workspace membership and role precedence. | Same helper signatures/grants; removed workspace members lose stale project-role authority. |
| 20261008041759 | Updated set gate; original package evaluator must still exist and base name must be absent. | Same package return columns; complete sibling checks and existing holds/RFIs apply at log insertion. |
| 20261009070300 | Five drawing prerequisites, current membership helpers, installed MFA and validated immediate parent FKs. Replaces final set gate and revision publication; adds evidence/atomic workflow. | **Breaking workflow cutover.** Direct shop lifecycle/round writes are refused. Existing captured revision sources cannot be rewritten. Historical status alone cannot authorize fabrication. |
| 20261009125901 | Installed atomic billing/private schema; creates four service-only checkout RPCs. | Additive DB surface. Old billing handlers do not use it, so SQL alone provides no durable checkout guarantee. New handler must deploy after SQL and pass provider acceptance. |
| 20261009140000 | Existing plan limit helper and original create_project payload; uses current role helpers for restoration. | Same create RPC; direct inserts/restores now obey capacity. Restore contention returns retryable 55P03; privileged admissions require READ COMMITTED and obey the same quota. |

The set gate keeps its `drawing-shop-v2` marker, but now includes manifest
coverage. Product Data and NULL/unknown types retain strict exclusion from shop
approval; no historical type is inferred. The uninstalled upload-reservation
candidate is outside this nine-file release and remains outside migration globs.

Main's client uses `apply_submittal_round_workflow` and the coverage RPCs. Any old
browser, native, sibling, or offline replay path sending direct shop lifecycle
writes receives `ROUND_WORKFLOW_REQUIRED` after the manifest installs. The
service worker fetches navigation HTML from the network when online, but does
not forcibly replace JavaScript already executing in an open tab. A frontend
publication alone does not make those tabs compatible; require an online reload
for affected workflows and review sibling/native compatibility. Do not disable
guards to keep old writes succeeding.

## Fifteen approved/released packages: reconciliation readiness

The read-only 14:49 UTC census includes active exact-type Shop Drawing submittals
in active projects. It found **9 Approved as Noted** and **6 Released for
Fabrication** packages. These are package counts, not proof each governs a set
or that steel has actually been fabricated.

- Fourteen packages link one live same-project set; one Released package has no
  linked set or sheets. No duplicate set IDs, foreign sheets, empty linked sets,
  or superseded active sheets were found in this cohort.
- Ten have a live current round. All ten match parent status and submission date;
  nine match the current set roster. One Released package has a different round
  roster. Five packages have no current round.
- The linked sets contain **103 current sheet-revision rows**. Every active
  sheet has exactly one current revision. **19** have all source metadata needed
  for capture; **84** lack revision-level file_url and a valid page, so no Storage
  row can be matched through that revision. All revision codes are present.
  This is a metadata check, not PDF readback.
- All 84 incomplete revisions have nonblank PDF references and positive page
  numbers on their parent drawing, with matching private app-files metadata;
  their parent sets also reference existing private PDFs. These source hints
  span eleven packages. This is a revision metadata routing gap, **not a finding
  that those PDFs are absent**. The parent references remain review material,
  not proof that the file was part of the original submitted/approved roster.
- Comparing trimmed codes exactly, all 84 incomplete revisions differ from
  their parent sheet revision number. Fifty-nine sheet/set file references
  match after the supported app-files/ prefix removal; twenty-five differ.
  Among the nineteen source-complete revisions, all nineteen file/page pairs
  match their parent sheet, seventeen revision codes match and two differ.
  No normalization was invented to force a match, and none of these comparisons
  establishes which document was originally approved.
- At package level: **3 complete current source rosters, 2 partial, 9 with zero
  eligible current PDF sources, 1 empty package**. Only two of the three complete
  packages also have a matching live round. The third has no round.
- All 103 revision rows were created after the recorded submission day. Later
  import could explain this; timestamps alone establish neither changed content
  nor original approval.
- None has a linked, nondeleted, sent/acknowledged transmittal with a send date
  in the inspected structured links. None has exact current-round revision
  items on such a transmittal, or a nonblank package/current-round/markup file
  reference in the inspected fields.
- All fifteen have stored audit snapshots recording approval or release changes.
  None of those inspected approval snapshots contains drawing_revision_ids,
  revision_ids or revision_manifest keys at the top level or metadata level.
  Status history is useful review context, not proof of the original PDF roster.

The source predicates follow the candidate: existing app-files object metadata
at the project's organization uploads PDF path (optional app-files/ prefix),
nonblank revision code, and positive page number. Names, record UUIDs, file
paths, signed URLs, PDF contents and private narrative fields were not returned.

The following anonymous rows show per-package readiness. A/R labels identify
only positions in this snapshot and must never be used as record IDs.

| Snapshot row | Stored status | Live round | Round set roster | Current sheet revisions | Capture-eligible source metadata | Approval provenance |
| --- | --- | --- | --- | ---: | ---: | --- |
| A1 | Approved as Noted | Yes | Matches | 2 | 0 | Requires PM review |
| A2 | Approved as Noted | No | Missing | 8 | 0 | Requires PM review |
| A3 | Approved as Noted | Yes | Matches | 1 | 0 | Requires PM review |
| A4 | Approved as Noted | Yes | Matches | 7 | 4 | Requires PM review |
| A5 | Approved as Noted | No | Missing | 4 | 0 | Requires PM review |
| A6 | Approved as Noted | No | Missing | 19 | 0 | Requires PM review |
| A7 | Approved as Noted | Yes | Matches | 14 | 0 | Requires PM review |
| A8 | Approved as Noted | Yes | Matches | 5 | 0 | Requires PM review |
| A9 | Approved as Noted | Yes | Matches | 1 | 0 | Requires PM review |
| R1 | Released for Fabrication | No | Missing | 4 | 4 | Requires PM review |
| R2 | Released for Fabrication | Yes | Matches | 0 | 0 | Requires PM review |
| R3 | Released for Fabrication | Yes | Matches | 5 | 5 | Requires PM review |
| R4 | Released for Fabrication | Yes | Differs | 5 | 0 | Requires PM review |
| R5 | Released for Fabrication | Yes | Matches | 2 | 2 | Requires PM review |
| R6 | Released for Fabrication | No | Missing | 26 | 4 | Requires PM review |

**All fifteen require PM review. Zero are eligible for automatic reconciliation.**
No original reviewed PDF roster was established by the inspected structured
evidence. External correspondence or retained reviewed PDFs may support a
future owner/PM review; their existence and contents were not assumed.

The remaining active exact-Shop population comprises three Submitted, two
Under Review and two Draft packages (22 total). The twenty non-Draft packages
lack the new manifest. This audit's detailed source-readiness cohort is the
fifteen approved/released packages only.

A separate approved/released type census found **zero NULL, zero blank and zero
unknown-type packages** in active projects at this observation. The recognized
vocabulary was Shop Drawing, Product Data, Sample, Mock-up, Calculation and Other.
One additional Product Data package is Approved as Noted and remains outside
shop-drawing approval authority. A future NULL/unknown record requires explicit
classification and review; it must not be automatically retagged as Shop Drawing.
The staging NULL-type legacy fixture is not a production population count.

## Operator actions before and during cutover

1. Review the affected packages in the app with the project PM. Retain their
   existing status/history as historical facts; separate them from verified
   current-revision authority. Do not invent approval, transmission or receipt
   dates, retype legacy records, or bulk backfill evidence.
2. Obtain the actual submitted PDF roster, revision/page identifiers and returned
   review from retained records or project correspondence. Compare every current
   sheet against those originals. The status audit can identify when a recorded
   change occurred, but cannot substitute for that review.
3. For the 84 missing revision source references/pages, compare the available
   parent sheet/set PDFs and page metadata against the actual reviewed records;
   repair the register only from verified sources through the approved revision
   workflow. Do not mechanically copy parent references into historical revisions.
   Never point
   an old approval at a newly received PDF merely to clear a blocker. Retain old
   sources. Confirm file bytes/readability separately; this census checked only
   Storage metadata.
4. If originals are proven to match the complete current roster, use the reviewed
   legacy attestation action with a concrete PM statement and existing actual
   submission date. A missing current round can be created by that action after
   review. Do not describe the three metadata-complete packages as preapproved
   for this action.
5. The package with a mismatched existing round roster needs a newly reviewed
   package/round route. Legacy reconciliation does not rewrite an existing round's
   immutable drawing-set roster; it could capture sources yet still leave
   `round_roster_changed` coverage. The empty Released package likewise needs an
   explicitly reviewed package rather than an inferred link.
6. Where original approval cannot be proven, use the appropriate permitted
   corrective/new-Draft and resubmission process. Re-approval follows review; the
   migration must not grant it. Existing release overrides remain explicit
   operator decisions and do not create revision evidence.
7. Finish matching staging browser/PDF and Edge acceptance before production.
   Preserve prior function bundles/configuration, use bounded manual SQL and
   exact ledger stamps, verify installed bodies/grants/triggers, then require a
   fresh green drift gate. Deploy the compatible reviewed handlers and frontend
   through their existing gates; resolve the open-tab reload window explicitly.
8. After release, verify both public domains, fresh authentication, affected
   package coverage, permitted status changes, fabrication holds, project limits
   and checkout test-mode behavior. A committed post-cutover rollback must
   preserve newly captured evidence and receipts. Do not drop evidence or restore
   permissive authorization to recover availability.

No record reconciliation, provider delivery, production application, browser
acceptance, or enterprise readiness is established by this audit.

## Separate upload-reservation operation bounds

The additive candidate in PR #523 remains uninstalled. It bounds one reservation
to an exact actor/request and project/workspace payload, allocates one path,
requires current authorization after waits, and returns only a small receipt.
It does not yet bound how many distinct requests an authorized actor may create.
The reservation RPC itself has no per-function wait/statement timeout; deployment
must evaluate actual API limits as well as lock/retry behavior. The migration's
SET LOCAL lock_timeout limits installation only, not future RPC calls.

Before any client/policy adoption, agree and test abuse/rate limits, maximum
outstanding reservations, monitoring, and retention semantics without inventing
new paid-plan exclusions. Successful/retried requests must stay deterministic.
Never expire a receipt in a way that lets the same actor/request silently bind a
different path. Distinguish unused reservation metadata from uploaded or captured
objects; absence of a recognized reference is not permission to delete bytes.
The 1,423 previously unclassified canonical objects still need classification.
Private project/org cascade cleanup is not a source-object deletion policy.
Captured source retention, monotone adoption floors, nonproject producers,
legacy access and export completeness remain coordinated follow-up work.

## Reproducing the anonymous readiness census

Run this SELECT only against the reviewed production target. It returns anonymous
counts and booleans per package, not paths or personal/project names. It does not
invoke a workflow or change any row.

```sql
WITH target AS (
 SELECT s.*,p.org_id FROM public.submittals s JOIN public.projects p ON p.id=s.project_id
 WHERE s.submittal_type='Shop Drawing' AND s.status IN('Approved','Approved as Noted','Released for Fabrication')
 AND NOT coalesce(s.is_deleted,false) AND s.deleted_at IS NULL AND NOT coalesce(p.is_deleted,false)
), readiness AS (
 SELECT s.id,s.status,
 cardinality(coalesce(s.drawing_set_ids,'{}')) AS linked_set_count,
 (SELECT count(DISTINCT x) FROM unnest(coalesce(s.drawing_set_ids,'{}')) x) AS distinct_linked_set_count,
 (SELECT count(*) FROM unnest(coalesce(s.drawing_set_ids,'{}')) x JOIN public.drawing_sets ds ON ds.id=x AND ds.project_id=s.project_id AND NOT coalesce(ds.is_deleted,false) AND ds.deleted_at IS NULL) AS active_same_project_sets,
 (SELECT count(*) FROM unnest(coalesce(s.drawing_set_ids,'{}')) x WHERE NOT EXISTS(SELECT 1 FROM public.drawings d WHERE d.drawing_set_id=x AND d.project_id=s.project_id AND NOT coalesce(d.is_deleted,false) AND d.deleted_at IS NULL)) AS empty_sets,
 (SELECT count(*) FROM public.drawings d WHERE d.drawing_set_id=ANY(coalesce(s.drawing_set_ids,'{}')) AND d.project_id<>s.project_id AND NOT coalesce(d.is_deleted,false) AND d.deleted_at IS NULL) AS foreign_project_sheets,
 r.id IS NOT NULL AS active_current_round,
 coalesce(r.status=s.status,false) AS current_round_status_matches,
 coalesce(r.drawing_set_ids @> s.drawing_set_ids AND s.drawing_set_ids @> r.drawing_set_ids,false) AS current_round_roster_matches,
 coalesce(r.submitted_date=s.submitted_date,false) AS current_round_submission_date_matches,
 s.submitted_date IS NOT NULL AS submission_date_present,
 (nullif(btrim(s.file_url),'') IS NOT NULL OR nullif(btrim(r.file_url),'') IS NOT NULL OR nullif(btrim(r.markup_file_url),'') IS NOT NULL) AS package_or_return_file_reference,
 sheet.*,
 (SELECT count(*) FROM public.drawing_transmittals t WHERE t.project_id=s.project_id AND t.submittal_id=s.id AND NOT coalesce(t.is_deleted,false) AND t.deleted_at IS NULL AND t.status IN('sent','acknowledged') AND t.date_sent IS NOT NULL) AS linked_sent_transmittals,
 (SELECT count(*) FROM public.drawing_transmittals t WHERE t.project_id=s.project_id AND t.submittal_id=s.id AND t.submittal_round_id=r.id AND NOT coalesce(t.is_deleted,false) AND t.deleted_at IS NULL AND t.status IN('sent','acknowledged') AND t.date_sent IS NOT NULL) AS current_round_sent_transmittals,
 (SELECT count(*) FROM public.drawing_transmittals t JOIN public.drawing_transmittal_items i ON i.transmittal_id=t.id AND i.project_id=s.project_id JOIN public.drawing_revisions rev ON rev.id=i.drawing_revision_id AND rev.project_id=s.project_id WHERE t.project_id=s.project_id AND t.submittal_id=s.id AND t.submittal_round_id=r.id AND NOT coalesce(t.is_deleted,false) AND t.deleted_at IS NULL AND t.status IN('sent','acknowledged') AND t.date_sent IS NOT NULL) AS current_round_exact_revision_items,
 (SELECT count(*) FROM public.pma_audit_logs a WHERE a.project_id=s.project_id AND a.entity_id=s.id AND a.entity_type='submittals') AS submittal_audit_rows,
 (SELECT count(*) FROM public.pma_audit_logs a WHERE a.project_id=s.project_id AND a.entity_id=s.id AND a.entity_type='submittals' AND a.new_values->>'status' IN('Approved','Approved as Noted','Released for Fabrication') AND a.old_values->>'status' IS DISTINCT FROM a.new_values->>'status') AS recorded_approval_or_release_changes
 FROM target s LEFT JOIN public.submittal_rounds r ON r.id=s.current_round_id AND r.submittal_id=s.id AND r.project_id=s.project_id AND NOT coalesce(r.is_deleted,false) AND r.deleted_at IS NULL
 CROSS JOIN LATERAL (
   SELECT count(*) AS active_sheets,
     count(*) FILTER(WHERE coalesce(d.is_superseded,false)) AS superseded_sheets,
     count(*) FILTER(WHERE rv.current_count=0) AS sheets_without_current_revision,
     count(*) FILTER(WHERE rv.current_count>1) AS sheets_with_multiple_current_revisions,
     count(*) FILTER(WHERE rv.current_count=1 AND rv.source_ready_count=1) AS sheets_with_current_source_metadata,
     count(*) FILTER(WHERE rv.current_count=1 AND rv.source_ready_count=1 AND rv.pre_submission_count=1) AS source_rows_created_before_submission_end
   FROM public.drawings d CROSS JOIN LATERAL (
     SELECT count(*) AS current_count,
       count(*) FILTER(WHERE rev.file_url IS NOT NULL AND regexp_replace(rev.file_url,'^app-files/','') LIKE s.org_id::text||'/uploads/%.pdf' AND regexp_replace(rev.file_url,'^app-files/','') !~ '(^|/)\.\.(/|$)' AND rev.pdf_page>0 AND nullif(btrim(rev.revision_code),'') IS NOT NULL AND obj.id IS NOT NULL) AS source_ready_count,
       count(*) FILTER(WHERE rev.created_at < s.submitted_date+interval '1 day') AS pre_submission_count
     FROM public.drawing_revisions rev LEFT JOIN storage.objects obj ON obj.bucket_id='app-files' AND obj.name=regexp_replace(rev.file_url,'^app-files/','')
     WHERE rev.drawing_id=d.id AND rev.project_id=s.project_id AND rev.is_current AND rev.archived_at IS NULL
   ) rv WHERE d.project_id=s.project_id AND d.drawing_set_id=ANY(coalesce(s.drawing_set_ids,'{}')) AND NOT coalesce(d.is_deleted,false) AND d.deleted_at IS NULL
 ) sheet
) SELECT jsonb_build_object('observed_at',now(),'package_count',count(*),'anonymous_rows',jsonb_agg(to_jsonb(readiness)-'id' ORDER BY status,id)) AS result FROM readiness;
```

Additional source diagnostics counted null/blank file references, invalid private
paths, missing Storage metadata, missing/invalid pages and missing revision codes
over the same current-revision join. Audit-key checks were limited to the named
keys above; absence is not a claim that all external evidence has been searched.
