# Commercial PostgreSQL concurrency acceptance

The `commercial-postgres` CI job provisions the official PostgreSQL 17 service image and runs this harness against a disposable synthetic database. It uses pinned `pg` 8.23.1 and the same captured schema, guards and lifecycle functions used by the local PGlite checks. No hosted database credentials are used.

Run with `COMMERCIAL_POSTGRES_TEST=1` and `COMMERCIAL_POSTGRES_URL` pointing to an **empty** loopback PostgreSQL database named `steelbuild_commercial_test`, after `npm ci` in this directory. The harness refuses other hosts, database names, URL overrides and populated databases. It does not drop or reset any database.

Each contender checks out its own connection and uses a transaction-local authenticated role and synthetic JWT. Tests first hold an advisory or row lock, start all requests, prove every distinct PostgreSQL backend is actively waiting on a database lock, then release it. This proves overlap rather than depending on timing or `Promise.all` alone.

Coverage includes all five numbered create kinds with eight cross-user retries, one official number/receipt, atomic backcharge notice events, conflicting payloads, membership revocation during an advisory wait, independent approvals and the project aggregate, shared SOV credit/deduct adjustments, competing deducts with complete rollback, simultaneous approvals of one reviewed revision, stale SOV editors waiting on a CO adjustment, and two SOV editors sharing a reviewed revision.

The local PGlite suites must pass before push. **The real multi-session result remains unverified until this CI job passes.** PGlite itself cannot prove database lock contention. These fixtures use a minimal project-member RLS policy and controlled synthetic schema dependencies; they do not replace complete deployed policy review or staged acceptance. Production, preview and staging publish jobs depend on this additional gate while retaining all their existing dependencies.

Service configuration follows the [GitHub PostgreSQL service guide](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers) and [official PostgreSQL image](https://hub.docker.com/_/postgres). Dedicated clients follow the [node-postgres pool contract](https://node-postgres.com/apis/pool).
