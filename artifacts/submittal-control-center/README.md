# Submittal Control Center (published Artifact)

Standalone, single-file submittal tracker published as a claude.ai Artifact. **Not part of the
Vite app** — nothing here is imported, built, linted, or tested by the SteelBuild Pro build. It
lives in the repo only so the source survives outside the published page.

**Live page:** https://claude.ai/code/artifact/742de131-82be-4d05-ab4d-485311a9f8fe

## What it does
Multi-project submittal log at the **drawing-set** level (not individual sheets):

- Portfolio rollup — open packages, with-reviewer count, overdue, avg turnaround, released-for-fab %, held/blocked
- Review-aging chart (0–7 / 8–14 / 15–21 / 22+ days out) and a "needs action" queue
- **Ball-in-court scorecard** — who is holding work, how many of theirs are overdue, and their real average
  turnaround metered against the job's contract review days
- **Return forecast** — what comes back overdue / today / this week / next week, with sheet counts
- Editable log grid — job, spec section, internal status, GC return code (NET / MCN / R&R / REJ / FRO),
  ball-in-court, dates. Sortable columns, quick-filter chips, per-row severity stripe
- Due-back auto-derived from each job's contract review days, overridable per package
- Fab release flag plus holds / open RFIs blocking release
- Revision history — each submit→return cycle logged with its return code and turnaround
- Drawing sets by external link (Procore / SharePoint / Dropbox / …) plus small in-tracker attachments
- **Transmittal generator** — a formatted, printable submittal transmittal per package
- **Chase note generator** — a ready-to-paste follow-up for every overdue return, grouped by job
- CSV export of the filtered log

## Layout notes that are load-bearing
The log grid scrolls inside itself (`.table-wrap` with a JS-measured `--grid-h`) so its header pins to the
grid. `position: sticky` resolves against the nearest scrolling ancestor, and `.table-wrap` is one — a
header offset from the *page* renders below the first rows instead of above them.

## Runtime capabilities
Declared at publish time, not in this file:

- `db` — shared realtime store, `projects` / `packages` / `files` collections.
  Rule: `{ path: "", read: "interact", write: "admin" }` — anyone the page is shared with can read;
  only "can edit" collaborators write. Declaring `db` makes the artifact organization-internal
  (it cannot be shared publicly).
- `downloads` — CSV export and handing attachments back to the viewer.

Store limits that shape the design: a document is capped at 256 KiB, the database at 5,000
documents. That is why full drawing-set PDFs are links and in-tracker attachments are capped at
160 KB (`FILE_CAP`), and why the `files` collection is read one document at a time on download
rather than subscribed.

## Updating
Edit `index.html`, then republish **to the same URL** so the link and its data survive:

```
Artifact(file_path: "…/index.html", url: "https://claude.ai/code/artifact/742de131-82be-4d05-ab4d-485311a9f8fe")
```

Publishing without `url` creates a *separate* artifact with an empty database.

`seed-sample-data.json` is the two demo jobs written to the store via `write_db` at first publish.
The page ships no hardcoded rows; "Remove sample data" in the UI deletes anything flagged `demo`.
