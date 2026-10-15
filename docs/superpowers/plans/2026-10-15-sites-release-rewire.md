# Sites Release Rewire Implementation Plan

1. Add failing tests for the five-gate Sites handoff, archive attestation,
   tamper rejection, and post-promotion verification ordering.
2. Add the release manifest creator/verifier and package commands.
3. Replace the production Wrangler job with `prepare-sites-release`; preserve
   the existing staging and PR preview jobs.
4. Move production domain and optional authenticated smoke checks into a
   manual post-promotion workflow that consumes the gated artifact.
5. Update the contributor, deployment, rollback, and recovery contracts.
6. Run focused tests, lint/typechecks, workflow parsing, production build, and
   the complete Vitest suite before commit and push.

