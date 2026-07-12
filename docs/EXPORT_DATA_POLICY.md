# Export and Customer Data Policy

- Real customer/project exports belong in approved project storage and access-controlled folders, not in this source repository.
- Temporary exports must be written under an ignored location (for example `exports/`) or another ignored folder so they never become tracked source assets.
- Test fixtures must be intentionally synthetic and must not reuse real names, addresses, person names, drawing numbers, RFIs, schedules, dates, amounts, or relationship structures from production.
- Keeping the `"S & H #"` Excel header literal is required for the parser compatibility marker and is intentionally unchanged.
- A literal `S & H #` marker may remain where parsing depends on that exact format until parser-generalization is completed in a separate branding task.
- If production data is accidentally committed:
  - notify app owners and security owners immediately,
  - assess impact and whether any signed URLs/credentials leaked,
  - rotate any potentially exposed credentials or signed URLs,
  - and escalate for a separately approved history-remediation procedure.

## Current status after Batch 7

- Customer exports were removed from the tracked tree in this change set.
- The `.gitignore` now ignores `exports/` and `*.xlsm`.
- Prior repository history still contains the removed files, and no history rewrite was performed.
