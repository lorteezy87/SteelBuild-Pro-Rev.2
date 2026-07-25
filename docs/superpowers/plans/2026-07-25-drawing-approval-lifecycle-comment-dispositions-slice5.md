# Drawing Approval Lifecycle — Slice 5: Comment Dispositions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Track returned reviewer comments as structured disposition rows and
block OFS→IFC / R&R→OFA while required comments remain unresolved (unless an
audited override is documented).

**Architecture:** Additive `submittal_comment_dispositions` table. Sheet-level
`submittal_sheet_responses` remains SoT for per-sheet R&R/AAN/NE. Slice 4’s
soft `comments_addressed` checkbox is secondary; gate truth = disposition rows.

## Product decisions

1. Status enum: Unreviewed · Accepted · Incorporated · Clarification Required ·
   RFI Required · Not Applicable · Disputed · Complete
2. `is_required boolean NOT NULL DEFAULT true` — only required rows gate
3. Resolved for gating: `Complete`, `Not Applicable`, `Incorporated`
4. OFS→IFC and R&R→OFA blocked on unresolved required rows; override audited
5. Revision source/reason: additive columns on `drawing_revisions`

## Tasks

- [ ] Claim + this plan
- [ ] `commentDispositionGate` + tests
- [ ] Migration + RLS + soft_delete_project + types + entity
- [ ] Wire into `addSubmittalRound` / IfcIssueDialog messaging
- [ ] Checklist UI on SubmittalDetail
- [ ] Carry-forward integration in `submittalResubmittal`
- [ ] Verify + commit + PR update
