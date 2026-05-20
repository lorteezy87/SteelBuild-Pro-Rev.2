# Connect a Shared Outlook Mailbox via Power Automate

This guide wires a shared Microsoft 365 / Outlook mailbox to a SteelBuild Pro
project so inbound project email (RFIs, submittals, transmittals, change
orders) lands in that project's **Email Inbox** for review. It targets the
already-deployed `email-ingest` edge function — no code changes are needed on
your side.

## How it flows

```
Shared Outlook mailbox
   │  (new email arrives)
   ▼
Power Automate cloud flow  ──HTTP POST (JSON + base64 attachments)──►  email-ingest edge function
                                                                          │
                                          classify (AI) + dedup + store ──┤
                                                                          ▼
                                              email_messages (import_status='pending')
                                              email_attachments + Storage: email-attachments/
                                                                          │
                                                                          ▼
                                              SteelBuild Pro → Email Inbox (human triage)
```

Every ingested email is staged as `pending` — nothing is auto-applied to
project records. A person reviews and links/promotes it in the Email Inbox.

---

## Prerequisites

| Item | Status / how to get it |
| --- | --- |
| `email-ingest` function deployed | Live (Supabase → Edge Functions → `email-ingest`). |
| `EMAIL_WEBHOOK_SECRET` set on the function | Supabase → Edge Functions → `email-ingest` → **Secrets**. Used as the `x-webhook-secret` header. If unset, every call returns `401`. |
| Attachments support | Requires `email-ingest` **v8+** (the base64-attachment update). Body + metadata work on any version; attachments only flow once v8 is deployed. |
| The project UUID | In the app: **Integrations → Email Accounts** shows the full webhook URL ending in the project UUID, with a copy button. Or ask a project admin. |
| Shared mailbox access | The account that authorizes the Power Automate Office 365 connection must have access to the shared mailbox. |
| Power Automate **premium** | The generic **HTTP** action is a premium connector. Most M365 plans that include Power Automate per-flow/per-user cover it; confirm with IT. |

**Endpoint shape** (one per project — the project UUID is the last path segment):

```
https://kjrwqagyeswwoxpjkcko.supabase.co/functions/v1/email-ingest/<PROJECT_ID>
```

---

## Step 1 — Smoke-test the endpoint first

Before building the flow, prove the endpoint + secret + project line up using
the bundled script ([`scripts/test-email-ingest.ps1`](../scripts/test-email-ingest.ps1)).

Preview the request (no secret needed):

```powershell
./scripts/test-email-ingest.ps1 -ProjectId <PROJECT_ID> -DryRun
```

Send a real test (classifies as an RFI, appears in the Email Inbox):

```powershell
./scripts/test-email-ingest.ps1 -ProjectId <PROJECT_ID> -Secret '<EMAIL_WEBHOOK_SECRET>'
```

Test the attachment path (expects `attachments_stored: 1` on v8+):

```powershell
./scripts/test-email-ingest.ps1 -ProjectId <PROJECT_ID> -Secret '<EMAIL_WEBHOOK_SECRET>' -IncludeAttachment
```

A `200` with `{"status":"ingested", ...}` means you're ready to build the flow.
`401` = wrong/missing secret; `400` = bad project UUID. (See Troubleshooting.)

---

## Step 2 — Build the Power Automate flow

1. **Create** → *Automated cloud flow*. Name it e.g. `SteelBuild – <Project> Email Ingest`.
2. **Trigger:** Office 365 Outlook → **When a new email arrives in a shared mailbox (V2)**.
   - **Original Mailbox Address:** the shared mailbox SMTP address.
   - **Folder:** `Inbox` (or a dedicated subfolder — see *Reducing noise*).
   - Show advanced options:
     - **Include Attachments:** **Yes**  ← required for attachments to flow.
     - **Only with Attachments:** No.
3. **Add an action:** **HTTP** (premium).
   - **Method:** `POST`
   - **URI:** `https://kjrwqagyeswwoxpjkcko.supabase.co/functions/v1/email-ingest/<PROJECT_ID>`
   - **Headers:**
     - `x-webhook-secret` : `<EMAIL_WEBHOOK_SECRET>`
     - `Content-Type` : `application/json`
   - **Body:** the JSON below. Replace each `«token»` by picking the matching
     **dynamic content** from the trigger. Put the `Attachments` token in as the
     bare value of `"attachments"` (no surrounding quotes) so it stays a JSON array.

```json
{
  "subject": "«Subject»",
  "from": "«From»",
  "to": "«To»",
  "cc": "«Cc»",
  "html": "«Body»",
  "message_id": "«Internet Message Id»",
  "date": "«Received Time»",
  "attachments": «Attachments»
}
```

4. **Save.** Use **Test → Manually**, then send an email to the shared mailbox.

### Field mapping reference

| JSON field | Trigger dynamic content | Notes |
| --- | --- | --- |
| `subject` | Subject | |
| `from` | From | Plain SMTP address. |
| `to` / `cc` | To / Cc | Semicolon-separated; stored as-is for display (not split into individual addresses). |
| `html` | Body | HTML body; the function also derives clean plain text from it. |
| `message_id` | Internet Message Id | Drives **dedup** — re-runs on the same email are skipped. |
| `date` | Received Time | Stored as `received_at`. |
| `attachments` | Attachments | Array of `{ Name, ContentBytes, ContentType, Size, IsInline }`. Inserted unquoted. |

The function is tolerant of field-name casing and shape — the Office 365
connector's native PascalCase (`ContentBytes`) and Microsoft Graph's camelCase
(`contentBytes`) both parse correctly.

---

## Attachments

- Requires `email-ingest` **v8+**. Each non-inline attachment's base64
  `ContentBytes` is decoded and stored in the `email-attachments` Storage
  bucket under `<project_id>/<message_id>/<filename>`, with a row in
  `email_attachments`.
- **Inline parts are skipped** (signature logos, embedded images) so the inbox
  shows real documents, not boilerplate.
- **Size:** Power Automate inlines attachment bytes into the flow run, and
  base64 inflates payloads ~33%. Keep total per-email attachments under
  ~20 MB. For very large drawing sets, use the DMS upload or a manual-forward
  path rather than the mailbox connector.

---

## Reducing noise (recommended)

A shared mailbox often receives more than project correspondence. To avoid
ingesting everything:

- Route relevant mail into a **dedicated subfolder** with an Outlook rule and
  point the trigger's **Folder** at that subfolder, **or**
- Add a Power Automate **Condition** before the HTTP action (e.g. only when
  `Subject` or `To` matches the project), so only matching mail is posted.

The function still classifies and stages everything it receives, so filtering
upstream keeps the Email Inbox focused.

---

## What happens after ingest

- **Classification:** subject/body are classified (`rfi`, `submittal`,
  `transmittal`, `change_order`, `action_item`, `general`) with a confidence
  score; key fields (RFI #, drawing refs, due date, priority) are extracted
  when present.
- **Dedup:** a repeat of the same `Internet Message Id` for the same project
  returns `{"status":"duplicate"}` and inserts nothing.
- **Review:** the message lands in the project **Email Inbox** as `pending` for
  a human to link or promote. Nothing is auto-applied.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `401 Unauthorized — invalid or missing webhook secret` | `x-webhook-secret` header value doesn't match `EMAIL_WEBHOOK_SECRET`, or the secret isn't set on the function. |
| `400 Missing project_id in URL path` | URI doesn't end with a project UUID. Check the last path segment. |
| `400 No sender email found in payload` | `from` wasn't mapped, or the trigger returned an empty From. |
| `400 Failed to parse email payload` | Body isn't valid JSON — usually an unescaped quote, or `Attachments` was wrapped in quotes (must be a bare array). |
| Email ingests but no attachments | Function predates v8, **Include Attachments** is off, attachments are inline-only, or they exceeded the size limit. Run the script with `-IncludeAttachment` to confirm v8. |
| Same email ingested twice | `Internet Message Id` wasn't mapped to `message_id`, so dedup can't match. |
| Nothing arrives at all | Confirm the flow ran (Power Automate run history) and that the trigger's mailbox/folder is correct. Check function logs in Supabase → Edge Functions → `email-ingest` → Logs. |

---

## Security notes

- Treat `EMAIL_WEBHOOK_SECRET` like a password. Prefer the `x-webhook-secret`
  **header** over the `?secret=` query param so it isn't captured in flow-run
  URLs or logs. In Power Automate, you can mark the HTTP action's inputs as
  **secure inputs** (action → Settings → Secure Inputs).
- The endpoint runs without a JWT (`verify_jwt=false`) by design — the shared
  secret is the only gate. Rotate it by updating the function secret in Supabase
  and the header value in each flow.
- One shared secret currently covers all projects; the project UUID in the URL
  is the routing key, not an access boundary. Don't expose the URL+secret pair
  beyond the people who manage these flows.
