# Decisions

Short architecture decision records (context, decision, consequences). Newest
last. Earlier decisions live in the commit history and `docs/AUDIT.md`.

---

## ADR-001 — Audit search folds text in .NET, not in SQL

**Context.** The audit log's search compared `UPPER(column)` with an
upper-cased needle. SQLite's `upper()` folds ASCII only, so Cyrillic and
Azerbaijani names never matched in the test suite; SQL Server's
`UPPER(N'İbrahim')` is `İBRAHIM`, so "ibrahim" never found "İbrahim" in
production. The owner's report ("ibrahim" still listing all 2,452 events)
was caused by an API container built before the search existed, but the
case bug was real underneath it.

**Decision.** One fold rule (`SearchText.Fold`: lower case, every I/İ/ı as
`i`, `ё` as `е`, NFC) applied in .NET. Users, Customers and AuditEntries
carry a folded `SearchKey` shadow column, set by `AppDbContext` on every
save and backfilled after startup for older rows; queries compare folded to
folded with a plain `Contains`. The SPA mirrors the rule in `foldSearch`.

**Consequences.** Identical behaviour on SQLite and SQL Server, tested on
both with a 2,640-event data set. Three extra columns, kept in step
automatically; bulk SQL updates of names (none exist) would have to refresh
the key. A leading-wildcard `LIKE` can't use an index, as before.

---

## ADR-002 — Error tracking inside the API ("System" section)

**Context.** Users see "Reference 8F05E497" on an error, but nobody can
look that reference up: 500s are only in the container log, client crashes
nowhere. The admin needs to paste a Reference and see where and what
happened, without a third-party service (portfolio project, no accounts, no
data leaving the deployment).

**Decision.**

- **Storage.** `ErrorGroups` (one row per bug: fingerprint, source, title,
  type, endpoint, first/last seen, count, status New/Resolved/Ignored,
  regressed flag, who resolved it, note, `RowVersion`) and
  `ErrorOccurrences` (one row per stored event: trace id, Reference, status,
  method and route template, role and user id, version, environment,
  redacted message and stack, browser family, client route). A third,
  small table, `ErrorHourlyCounts` (hour, source, count, 5xx count), keeps
  the 24-hour and 7-day charts and the health counters exact even though
  occurrences are capped and expire.
- **Fingerprint.** SHA-256 of source, exception type, the top three
  application stack frames (method names only: no line numbers, file paths
  or bundle hashes, which change per build) and the endpoint template. A
  client error uses its message template (numbers, ids and quoted text
  replaced) when it has no usable frames. One bug is one group.
- **Capture off the request path.** `ExceptionHandlingMiddleware` (unhandled
  exceptions) and a 5xx check after the pipeline hand a report to a bounded
  channel (`TryWrite`, never awaits, never throws). A background writer
  drains it in batches, redacts, fingerprints, counts every event on its
  group and stores at most N recent occurrences per group (configurable).
  When the channel is full the report is dropped and counted ("dropped" on
  the health page). Validation errors, 401, 403, 404 and the 409/412
  conflicts are not errors and are never captured.
- **Redaction before storage** (`Redaction`, unit-tested): emails, JWTs and
  bearer tokens, password/secret/key=value pairs, connection strings, query
  strings, URLs' credentials, long digit runs (cards, ids), IPv4/IPv6
  addresses; messages and stacks truncated; local paths shortened to the
  file name. Request bodies and headers are never read.
- **Client errors.** `POST /api/diagnostics/client-errors`, anonymous (a
  signed-out or expired session can crash too), with its own strict rate
  limit per address and a global one, an 8 KB body cap, a closed schema
  (unknown fields rejected), the same redaction, and a 202 with no body
  whatever happens to the report. The actor's role and id come from the
  token when one is sent, never from the body. New frontend groups per hour
  are capped; beyond the cap events fold into one overflow group, so a
  flood can't fill the table with distinct fingerprints.
- **One Reference everywhere.** Reference = the first 8 characters of the
  32-hex W3C trace id, upper-cased, computed the same way on both sides
  (`ErrorReference`, `shortReference`). A client-side crash has no server
  trace id, so the reporter mints one in the same format; the error page
  shows its Reference and the ingestion stores that id, so the lookup works
  for client crashes too. A 5xx answer that carries a server trace id is
  not reported again by the client (the server already has it).
- **Lifecycle.** Resolve, Ignore and Reopen go through the entity, with the
  caller's `rowVersion` (stale → 409 "Concurrent update") and an
  `AuditEntry` in the same SaveChanges. A Resolved group that occurs again
  reopens itself and is marked Regressed; an Ignored group keeps counting
  silently. A daily retention service deletes occurrences after 30 days
  (configurable); groups and hourly counts stay. Admins can purge resolved
  groups older than N days.
- **Health** is read live: version, environment, uptime, Baku time, a
  database round trip, applied and pending migrations, the writer's queue
  depth and drops, error and 5xx counts, rate-limit rejections (an
  in-memory 24-hour window, reset on restart) and the audit log size. No
  connection strings, secrets or environment variable values.

**Consequences.** No external dependency, and the data stays in the
product's own database under its own access rules (Admin only, scoped like
every other admin endpoint). The cost is a writer and a retention service
in the API process and three tables to keep bounded; the caps (per group,
per hour for new client groups, queue size, rate limits) are configuration.
It is not an APM: no traces across services, no alerting. If the product
outgrows it, the capture points (middleware, reporter) are where an
OpenTelemetry exporter or a hosted service would plug in.
