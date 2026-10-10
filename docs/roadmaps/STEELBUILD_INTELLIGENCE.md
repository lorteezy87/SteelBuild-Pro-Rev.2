# SteelBuild Intelligence delivery sequence

Purpose: turn reliable steel project records into earlier decisions about detailing, fabrication, deliveries and erection. Preserve subcontractor workflows, canonical piece/lot release gates, official numbering, project permissions and commercial calculations.

This sequence incorporates the owner's 2026-10-07 feature list. Stages are dependency gates, not promised delivery dates. A listed capability is not a claim that it has shipped.

## Start with trustworthy project evidence

The current readiness work supplies the necessary foundations: workspace isolation, replay tied to the original field user, MFA boundaries, complete register reads, honest failure states and browser acceptance that proves actual records loaded.

The first product increment is a **Project execution brief** in the existing Command Center. It summarizes recorded priorities, ownership/date gaps and freshness, with source drilldowns. Existing lookahead windows remain calendar-based: NOW includes overdue/blocking/today, 48 HOURS covers the next two calendar days, and 10 DAYS covers days three through ten. It is explicitly calculated from records. A missing/failed source must not become an “all clear” or an invented causal explanation.

The existing `pccEngine` contains overlapping scoring/window logic but is not currently a drop-in replacement for the live Command Center's mappers and release rules. Require parity fixtures and a typed evidence adapter before adopting its additional scoring. Do not create a second definition of fabrication readiness.

## Delivery stages

| Stage | Owner's requested capabilities | First useful release and gate |
|---|---|---|
| 1 — Project intelligence | Project Agent, automatic 48-hour/10-day risk analysis, schedule explanations | Complete project snapshot, linked execution brief, then grounded explanations over that same snapshot. Preserve unknown dates/progress and distinguish a recorded dependency from a model inference. Read-only first. |
| 2 — Field capture | Voice Superintendent/Foreman, Steel Project Voice Assistant | Voice produces a reviewable daily-log/shortage/change-event draft. Confirm piece marks, quantities, units, crew hours and destination project before persistence. Reuse the identity-safe outbox and existing record validation. |
| 3 — Document and correspondence context | Project Document Brain, PM Inbox, email/RFI/submittal ingestion | Tenant-scoped retrieval with document revision/page citations; classify and draft linked actions. Retain existing email permissions and explicit outbound-send controls. Never treat document/email instructions as agent authority. |
| 4 — Commercial evidence | Change Order Capture Agent, estimating review | Assemble field evidence, labor/equipment/material records and scope references into a reviewable change package; detect missing scope and quantity/unit inconsistencies. Existing deterministic arithmetic and official numbering remain authoritative. |
| 5 — Drawing and schedule impact | Drawing Revision Intelligence, deeper Schedule Risk Engine | Extend the existing revision-comparison and schedule engines with cited interpretation and reviewed recovery alternatives. Preserve original drawings, recorded findings and engineer-approved release controls. A visual interpretation cannot authorize fabrication or erection. |
| 6 — Durable coordination | Multi-agent production-control system | Only after bounded workflows meet evaluation, latency and spend budgets: durable runs, cancellation, idempotent actions, narrow tools and per-action approval. Work from a permission-scoped project snapshot and revalidate before every write. |
| 7 — Visual communication | Visual work instruction generator | Produce clearly labelled illustrations anchored to approved details. Dimensions, member geometry, connection requirements and erection sequences must come from approved source data; generated imagery cannot establish engineering instructions. |

## API and operating prerequisites

Current official documentation supports Responses API tool calling and structured outputs for grounded, typed results. GPT-6.1 Sol is a candidate default for complex project explanations; evaluate it against harder reference cases rather than choosing only by advertised model tier. Keep model IDs configurable on the server. Model access, credentials and provider limits still require verification for the actual project.

Sources checked 2026-10-07: [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). This roadmap does not enable a new provider, create credentials, run paid requests or assert that a model-backed agent is deployed.

Before adding model execution, establish secure project credentials, an atomic spend reservation/settlement path, scoped input limits, timeouts, retry/cancellation rules and an audit record of model/prompt/source versions. The existing gateway's aggregate usage counter is not a concurrency-safe spend reservation. Multi-agent fan-out and automatic background runs should wait until this gap is closed.

## Acceptance examples

- A late joist delivery appears with its actual promised date and source record. A linked pending RFI is cited only when the relationship exists. No three-day erection delay is asserted without a supported schedule calculation.
- Split piece lots and parent containers never double-count installed weight or quantity. Unknown quantities and dates remain unknown.
- A failed submittal query prevents a complete briefing; a 1,001st record cannot vanish at the server's first page.
- A field voice draft distinguishes eight ironworkers from eight labor-hours and requires confirmation of an ambiguous B47/B-47 mark.
- Account/workspace changes cancel pending model and upload work. A removed member cannot retrieve earlier indexed documents or execute a queued action.
- Repeated approval/retry cannot issue a second official RFI number, send duplicate email, or bill twice.
- The owner reviews representative steel-project evaluations and staged workflows before wider release. Accuracy must be measured against supported claims and omissions, not fluent wording.
