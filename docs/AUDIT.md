# PolisGo audit — Phase 1 (findings only)

- **Commit audited:** `968e13f` (`main` after PR #19, the admin panel), branch `audit/opus`
- **Date:** 2026-11-22
- **Method:** read every controller, service, access rule, entity, configuration,
  migration backfill, the compose/Docker/CI files and the SPA's auth, API and
  state code; then reproduced each candidate finding. A finding is listed only
  if it was reproduced (failing test, HTTP request against SQL Server, browser
  run) or, where marked, is unambiguous from the code.
- **Evidence:** [`docs/audit-evidence/`](audit-evidence/) holds every reproduction:
  `AuditReproTests.cs` (11 xUnit tests that assert the correct behaviour and
  fail today), `audit-cache.spec.ts` and `audit-layout.spec.ts` (Playwright),
  the HTTP probes (`probe.mjs`, `probe-admin-race.mjs`, `jwt-cors.mjs`), their
  logs against SQL Server, the performance scripts and a screenshot. They are
  a record of the audited commit; the permanent regression tests live in the
  test projects. Passwords in the scripts are generated per run (redacted
  before commit); no tokens or secrets were captured.

Severity scale: **High** = money or authorisation is wrong today; **Medium** =
a real defect with a narrower trigger or impact; **Low** = hygiene, edge cases,
docs. Effort: **S** ≤ 2 h, **M** ≤ 1 day, **L** > 1 day.

## Summary

| ID | Sev. | Area | Finding | Reproduced by | Effort |
| -- | ---- | ---- | ------- | ------------- | ------ |
| H-1 | High | Security | Any Adjuster can cancel any customer's policy (and reads every policy) | xUnit + HTTP on SQL Server | S |
| H-2 | High | Money | Concurrent `POST /pay` charges one policy several times (3× on SQL Server) | xUnit + HTTP on SQL Server | M |
| M-1 | Medium | Staff rules | Two admins deactivating each other at once leave **no** active admin | xUnit + HTTP on SQL Server | M |
| M-2 | Medium | Money | Claim payout calls the gateway before the concurrency guard: double payout | xUnit | M |
| M-3 | Medium | Security | An agent keeps write access to a customer moved to another book; the new agent can't see that customer's policies | xUnit (HTTP) | M |
| M-4 | Medium | Security | No throttling or lockout on sign-in; timing and 409 reveal which emails exist | HTTP on SQL Server | M |
| M-5 | Medium | Frontend | After a session expires, the next person to sign in on that tab sees the previous person's data | Playwright + screenshot | S |
| M-6 | Medium | Logic | Cover bought today pays for an incident earlier that day; "today" is UTC for a UTC+4 market | xUnit + HTTP on SQL Server | M |
| M-7 | Medium | Config | Compose publishes SQL Server on all interfaces with the documented `sa` password; API runs Development on all interfaces; placeholders accepted | HTTP + `sqlcmd` via host port | S |
| M-8 | Medium | Performance | Landing page CLS ≈ 0.55 (Lighthouse "poor" > 0.25): the footer jumps when the route chunk lands | Playwright (PerformanceObserver) | S |
| L-1 | Low | Robustness | Crafted `page` / date values give 500 on SQL Server (SQLite hides it) and leak SQL text under compose | HTTP on SQL Server | S |
| L-2 | Low | Logic | `/api/admin/stats` counts expired policies as Active | xUnit | S |
| L-3 | Low | Config | Demo seeder refuses only the exact name `Production`; `Staging`/`prod` seed staff with the documented password | xUnit | S |
| L-4 | Low | Security | Changing the password doesn't end other sessions (roadmap item) | xUnit (HTTP) | S |
| L-5 | Low | Security | The 64-character cap doesn't keep passwords within BCrypt's 72 bytes | xUnit | S |
| L-6 | Low | Money | Frozen factors stored at 4 dp don't reproduce the premium (215.84 vs 215.85) | HTTP on SQL Server | S |
| L-7 | Low | Security | No `nosniff`, `no-store` or CSP headers on API responses and document downloads | HTTP | S |
| L-8 | Low | DX | Hard-coded `container_name` stops a second checkout's stack from starting | README quick start | S |
| L-9 | Low | Supply chain | No npm in Dependabot; CI runs no format or vulnerability check; actions and images not pinned; ESLint 9 out of support | Reading + `npm ci` output | S |
| L-10 | Low | CI | CI's coverage summary shows 31.2%; excluding generated migrations it is 93.3% | Cobertura from the CI step | S |
| L-11 | Low | Docs | README e2e breakdown is stale (78 + 36 vs 94 + 52); CI section omits demo data | `playwright --list` | S |
| L-12 | Low | Performance | All three locales (72 kB gzip) and ~378 kB of fonts load on first paint | Build output + Playwright | S |
| L-13 | Low | Tests | Gaps: migration backfills never run against data; concurrency tested only for claim approvals; "mobile" is desktop Chrome at 390 px; `AuthServiceTests` on EF InMemory | Reading | M |

No Critical findings: nothing lets an anonymous caller in or reads another
customer's data across the API, and the JWT/session layer held up to tampering.

## Baseline: the CI steps, in CI order, on a clean LF clone

Clean clone of `audit/opus` with `core.autocrlf=false` (0 CRLF files) in a
scratch directory. Frontend steps ran in the official `node:22` image
(22.23.5, npm 10.9.9), matching CI; local Node is 26. The e2e step ran on the
host against `docker compose` with `docker-compose.demo.yml` and the CI-only
values from `ci.yml`, as the `e2e` job does.

| # | Step | Result |
| - | ---- | ------ |
| 1 | `dotnet restore PolisGo.slnx` | OK |
| 2 | `dotnet build -c Release -warnaserror` | OK, 0 warnings, 0 errors |
| 3 | `dotnet test --collect:"XPlat Code Coverage"` | **449 / 449 passed** (7 s); line coverage 31.2 %, 93.3 % excluding migrations (L-10) |
| 4 | `npm ci` | OK, **0 vulnerabilities**; warns `eslint@9.39.5` is no longer supported |
| 5 | `npm run lint` | OK |
| 6 | `npm run typecheck` | OK |
| 7 | `npx prettier --check .` (not a CI step; see L-9) | OK, all files formatted |
| 8 | `npm test` (Vitest) | **309 / 309 passed** (26 files) |
| 9 | `npm run build` | OK; warns about chunks > 500 kB (`downloadCertificate` 1,139 kB / 508 kB gzip, loaded on click only) |
| 10 | `docker compose up --build` + `--wait` | Healthy; all migrations applied on SQL Server; demo data seeded |
| 11 | `CI=true npm run e2e -- --workers=4` | **146 / 146 passed** in 1.8 min, 0 retries configured |

Also checked: `dotnet list package --vulnerable --include-transitive`, no
vulnerable packages. README Quick start from the clean clone: works as
written, except where another PolisGo stack already exists on the machine (L-8).

---

## High

### H-1 — Any Adjuster can cancel any customer's policy

- **Where:** [PoliciesController.cs:204-214](../src/PolisGo.Api/Controllers/PoliciesController.cs) (cancel has only the class-level `[Authorize]`), [PolicyAccess.cs:18](../src/PolisGo.Application/Policies/PolicyAccess.cs) (`_ => query // Adjuster and Admin see everything`), [PolicyService.cs:299-314](../src/PolisGo.Application/Policies/PolicyService.cs)
- **What:** `POST /api/policies/{id}/cancel` is open to every signed-in role
  and scoped by `PolicyAccess`, which gives Adjusters every policy in the
  system. A claims adjuster can therefore cancel any customer's paid cover,
  with no refund. Adjusters are already 403 on quote, create and pay, so
  this is an oversight, not a design. The same scope rule lets adjusters list
  and open every policy (holder name, VIN, payments) through
  `GET /api/policies[/{id}]`. CLAUDE.md and the README say adjusters see a
  customer "only through a claim in their reach", which `CustomerAccess`
  enforces but `PolicyAccess` does not.
- **Reproduced:** `AUD_adjuster_cannot_cancel_a_customers_policy` →
  "Adjuster cancel returned 200; stored status now Cancelled". On SQL Server
  (`probe.mjs`): an adjuster created through `POST /api/users/staff` cancelled
  a client's paid policy: `200 -> Cancelled`.
- **Fix:** `[Authorize(Roles = "Client,Agent,Admin")]` on cancel (and a 403
  line in its Swagger docs). Decide the read scope for adjusters: either
  mirror `CustomerAccess` (policies with a claim in reach) or document that
  adjusters see every policy, and update the CLAUDE.md table either way.
- **Effort:** S (M with the read-scope change).

### H-2 — Concurrent payment requests charge one policy several times

- **Where:** [PolicyService.cs:247-297](../src/PolisGo.Application/Policies/PolicyService.cs), [PolicyConfiguration.cs:13-27](../src/PolisGo.Infrastructure/Persistence/Configurations/PolicyConfiguration.cs) (no concurrency token on `Policy`; `Claim` has one), [PaymentConfiguration.cs:19](../src/PolisGo.Infrastructure/Persistence/Configurations/PaymentConfiguration.cs) (no uniqueness)
- **What:** `PayAsync` reads the Draft, calls the gateway, then saves. Two
  requests that both read Draft both charge and both commit, because nothing
  makes the second `UPDATE` fail. The comment "Any non-Draft status means a
  previous Pay already won the race" holds only for sequential requests. The
  SPA's `useExclusive` guard prevents a double click, but not a second tab,
  a retry or another API client.
- **Reproduced:** `AUD_two_concurrent_payments_charge_a_draft_once` →
  "charges=2, payment rows=2, Draft->Active rows=2, results=[ok, ok]". On SQL
  Server, 20 parallel `POST /pay` → `{"200":3,"409":17}`, **3 payment rows,
  3 Draft→Active history rows, 147.48 AZN recorded for a 49.16 AZN premium**
  (`probe-sqlserver.log`). Premium figures on the dashboard count all three.
- **Fix:** give `Policy` the same Guid `RowVersion` concurrency token as
  `Claim` (bumped in `TransitionTo`), so the losing save is a 409 "Concurrent
  update". Also pass the policy id to the gateway as an idempotency key: with
  a real PSP the charge happens before the save. A filtered unique index on
  `Payments(PolicyId) WHERE Status = 'Completed'` is a cheap database backstop
  that works on both SQL Server and SQLite. Migration in the same commit.
- **Effort:** M.

## Medium

### M-1 — Two admins can leave the system with no active admin

- **Where:** [StaffAdminService.cs:116-129, 142-157, 198-203](../src/PolisGo.Application/Admin/StaffAdminService.cs)
- **What:** "never the last active admin" is a read (`AnyAsync`) followed by a
  separate write. When the last two admins deactivate (or demote) each other
  at the same moment, each check sees the *other* still active and both
  commit. Nobody can then sign in as admin, and the dev seeder won't help
  (it does nothing if the seed email exists, active or not). Recovery needs
  direct SQL.
- **Reproduced:** `AUD_two_admins_deactivating_each_other_keep_one_active_admin`
  → "active admins left: 0; results=[ok, ok]". On SQL Server
  (`probe-admin-race.log`): first attempt, "active admins before=2; a->b 200,
  b->a 200; active admins after=0", and sign-in as either → 401.
- **Fix:** run the check and the write in one serializable transaction
  (`BeginTransactionAsync(IsolationLevel.Serializable)`; SQL Server takes
  key-range locks, SQLite serialises writers), or re-count active admins
  after the update inside the transaction and roll back if zero.
- **Effort:** M.

### M-2 — Claim payout calls the gateway before the concurrency guard

- **Where:** [ClaimService.cs:290-312](../src/PolisGo.Application/Claims/ClaimService.cs), [FakePayoutGateway.cs](../src/PolisGo.Infrastructure/Payments/FakePayoutGateway.cs) (its comment says idempotency is the caller's job)
- **What:** `PayAsync` loads an Approved claim, calls `PayoutAsync`, then
  saves. With two concurrent requests both payouts go out; only then does the
  `RowVersion` check reject the second save. The database stays consistent
  (one `Paid` row, the second caller gets a 409), but the money left twice. A
  `rowVersion` in the request doesn't help: both callers send the same,
  current one.
- **Reproduced:** `AUD_two_concurrent_payouts_pay_a_claim_once` → "payout
  gateway called 2 times; results=[DbUpdateConcurrencyException, ok]".
- **Fix:** claim the transition first (save `Approved → Paid` or a
  `PayoutPending` state with the concurrency check), then call the gateway
  with the claim id as idempotency key and store its reference. Roll the
  state back if the gateway fails.
- **Effort:** M.

### M-3 — Agent rights follow the seller, not the book

- **Where:** [PolicyAccess.cs:17](../src/PolisGo.Application/Policies/PolicyAccess.cs), [ClaimAccess.cs:17](../src/PolisGo.Application/Claims/ClaimAccess.cs), [ClaimService.cs:44-56](../src/PolisGo.Application/Claims/ClaimService.cs), [CustomerService.cs:95-99](../src/PolisGo.Application/Customers/CustomerService.cs)
- **What:** customers are scoped by `Customer.AgentId` (the current book),
  policies and claims by `Policy.AgentId` (who sold them). When an admin
  moves a customer from agent A to agent B, A can no longer open the
  customer, but can still file claims on, pay, cancel and upload to that
  customer's policies. B sees the customer with none of the existing cover.
  Reading old sales is documented (`List_Agent_SeesOnlyPoliciesTheyCreated`);
  writing on behalf of someone else's customer is not.
- **Reproduced:** `AUD_agent_loses_write_access_when_the_customer_moves_to_another_book`
  → "A GET customer -> 404; A POST claim -> 201; A POST cancel -> 200;
  B GET customer -> 200, policies listed: 0".
- **Fix (needs your call on the model):** either scope agents' policies and
  claims by the book (`p.Customer.AgentId == me`), which also lets B service
  the customer, or keep read-only history for A and require
  `CustomerAccess` for every write (submit, withdraw, pay, cancel, upload).
- **Effort:** M.

### M-4 — No throttling or lockout on sign-in; accounts can be enumerated

- **Where:** [Program.cs](../src/PolisGo.Api/Program.cs) (no `AddRateLimiter`), [AuthService.cs:79-87](../src/PolisGo.Application/Auth/AuthService.cs) (no hash check for an unknown email), [AuthService.cs:33-36](../src/PolisGo.Application/Auth/AuthService.cs)
- **What:** unlimited password guesses per account and per IP. An unknown
  email skips BCrypt, so response time tells whether an account exists.
  Register also answers 409 "already exists". With BCrypt at work factor 12,
  each anonymous login or register also costs ~180 ms of server CPU, a cheap
  load amplifier.
- **Reproduced (SQL Server):** 30 wrong passwords in a row → 30 × 401, then
  the right one → 200 (no 429, no lockout). Median login time: existing
  email 183 ms, unknown email 2 ms. Duplicate register → 409 with that message.
- **Fix:** ASP.NET Core rate limiter on `login`, `register` and
  `change-password` (partitioned by IP and by email, 429 as ProblemDetails
  with `traceId`); verify against a fixed dummy hash when the email is
  unknown; optionally a short lockout after N failures. The SPA needs a
  translation for the 429.
- **Effort:** M.

### M-5 — The next person on a tab sees the previous person's data

- **Where:** [AuthProvider.tsx:25-31](../frontend/src/auth/AuthProvider.tsx) (on 401 only `['auth','me']` is removed), [tokenStore.ts:57-63](../frontend/src/api/tokenStore.ts) (the expiry timer clears the token, nothing else), [signOut.ts:37-40](../frontend/src/auth/signOut.ts) (cache and pending files are cleared only on an explicit sign-out)
- **What:** when the 60-minute token expires in an open tab, or the API
  answers 401 (deactivation, role change), the guard sends the user to
  `/login` but the React Query cache stays. The next person who signs in on
  that tab gets the previous user's cached lists, details and reminders
  (`staleTime` 5 min for reminders). Photos picked for an unfinished claim
  also stay in IndexedDB.
- **Reproduced:** `audit-cache.spec.ts` (Playwright clock): client A views
  `/app/policies`; the token expires; client B signs in on the same tab →
  "B sees A's policy PG-2026-… on /app/policies". Screenshot:
  [audit-cache-leak.png](audit-evidence/audit-cache-leak.png) ("Signed in
  as …" B, with A's policy and A's unread reminder in the bell). Reproduced
  twice, deterministic.
- **Fix:** in `AuthProvider`, whenever the session becomes `null` for any
  reason (subscribe to `tokenStore`) and in the `onUnauthorized` handler, call
  `queryClient.clear()` and `clearAllPendingFiles()`. The spec above becomes
  the regression test.
- **Effort:** S.

### M-6 — Same-day cover pays for an incident that happened before it was bought

- **Where:** [PolicyService.cs:263-266](../src/PolisGo.Application/Policies/PolicyService.cs) (a Draft starting today can be paid), [ClaimService.cs:467-475](../src/PolisGo.Application/Claims/ClaimService.cs) (the incident check compares dates only), [lib/dates.ts](../frontend/src/lib/dates.ts) `todayIso` and every `DateTime.UtcNow.Date`
- **What:** cover starts at 00:00 of its start date, and start date "today"
  is allowed. A customer who has an accident in the morning can buy and pay
  at noon, then file a claim for that morning, and it is accepted. All
  business dates are UTC while the product is Azerbaijani (UTC+4): between
  00:00 and 04:00 Baku time "today" is still the previous day, so the cover
  can even start on the previous local day. The code comments rule out
  "insurance bought after the event" only for a start date in the past.
- **Reproduced:** `AUD_cover_bought_today_does_not_pay_for_an_incident_earlier_today`
  → "returned 201". SQL Server: same, `claim for an incident on the purchase
  day 201`.
- **Fix (product decision):** earliest start tomorrow; or keep same-day
  sales but store the paid-at time and reject incidents before it. Use the
  `Asia/Baku` business date on both sides (server `TimeZoneInfo`, SPA
  `Intl` with `timeZone: 'Asia/Baku'`) instead of UTC.
- **Effort:** M.

### M-7 — Unsafe defaults in the documented Docker setup

- **Where:** [docker-compose.yml:10-11, 37, 55-56](../docker-compose.yml), [.env.example](../.env.example), [JwtSettingsValidator.cs:10, 22](../src/PolisGo.Infrastructure/Auth/JwtSettingsValidator.cs)
- **What:** SQL Server is published as `1433:1433`, i.e. on every host
  interface (IPv4 and IPv6). The README tells you to copy `.env.example`, and
  if you don't change the `sa` password, anyone on the network can connect
  as `sa`. The API runs as `Development` on `0.0.0.0:8080`, so Swagger and
  raw exception messages in 500 responses (see L-1) are reachable from the
  LAN. The validator rejects only the appsettings placeholder, so the
  47-character `.env.example` JWT placeholder and the example admin password
  are accepted. (The security stamp keeps a known JWT key from being enough
  to forge a session, which is good; it still shouldn't be accepted.)
- **Reproduced:** README quick start with an untouched `.env.example` copy →
  admin sign-in with the example password: 200. `docker port` →
  `0.0.0.0:1433`, `[::]:1433`; `sqlcmd` to `host.docker.internal,1433` with the
  example `sa` password → "connected via host port as sa".
- **Fix:** publish as `127.0.0.1:1433:1433` (or not at all) and
  `127.0.0.1:8080:8080`; leave the secrets in `.env.example` empty so
  `${VAR:?}` fails until they are set, or reject the known example values at
  startup.
- **Effort:** S.

### M-8 — Landing page layout shift ≈ 0.55

- **Where:** [AppShell.tsx:16-30](../frontend/src/components/layout/AppShell.tsx), [PageSkeleton.tsx:7-21](../frontend/src/components/layout/PageSkeleton.tsx)
- **What:** while a route chunk downloads, the public shell shows a short
  skeleton and the footer right under it, inside the first screen. When the
  landing page arrives the footer is pushed off-screen: one shift of 0.549.
  CLS ≈ 0.46 at 1440 px, ≈ 0.55 at 390 px, ≈ 0.20 on `/login`. Lighthouse
  calls > 0.25 "poor", and CLS is 25 % of its performance score. It is the
  first page a reviewer opens.
- **Reproduced:** `perf.mjs` / `cls.mjs` on the production build (`vite
  preview`, Slow 4G-like network, 4× CPU, and unthrottled): the attributed
  source is `footer.border-t.border-line`, also without throttling. Other
  numbers on the landing page: FCP 1.6 s, LCP 2.9 s, 32 requests.
- **Fix:** give the fallback the page's height (`min-h-dvh` on
  `PageSkeleton`'s frame) so the footer starts below the fold; add a
  Playwright check that CLS stays under 0.1.
- **Effort:** S.

## Low

### L-1 — Crafted paging and date values return 500 on SQL Server

- **Where:** `(page - 1) * pageSize` in [ClaimService.cs:181-183](../src/PolisGo.Application/Claims/ClaimService.cs), [PolicyService.cs:183-185](../src/PolisGo.Application/Policies/PolicyService.cs), [CustomerService.cs:56-58](../src/PolisGo.Application/Customers/CustomerService.cs), [StaffAdminService.cs:75-76](../src/PolisGo.Application/Admin/StaffAdminService.cs); `AddMonths`/`AddDays` on unchecked input in [AdminDashboardService.cs:47-50, 68](../src/PolisGo.Application/Admin/AdminDashboardService.cs), [AuditLogService.cs:43](../src/PolisGo.Application/Admin/AuditLogService.cs)
- **What:** `page=2147483647` overflows to a negative offset; SQL Server
  rejects it with a 500 (SQLite accepts a negative offset, so the test suite
  can't see it). `to=9999-12-31` or `to=0001-01-15` throws in date arithmetic.
  Under compose (Development) the 500 body carries the raw message.
- **Reproduced (SQL Server):** `GET /api/claims?page=2147483647` → 500 "The
  offset specified in a OFFSET clause may not be negative." Same for
  policies, customers and staff. `/api/admin/dashboard?to=9999-12-31` and
  `/api/admin/audit?to=9999-12-31` → 500 "Value to add was out of range."
- **Fix:** cap `page` (as `AuditLogService` already does) or compute the
  offset in `long` and return an empty page; validate date filters to a sane
  range → 400 with a message and its translation.
- **Effort:** S.

### L-2 — `/api/admin/stats` counts expired policies as Active

- **Where:** [AdminStatsService.cs:52-55](../src/PolisGo.Application/Statistics/AdminStatsService.cs)
- **What:** groups by the stored status, so `Expired` is always 0, against
  the CLAUDE.md rule "Policy status is effective on read… use them in any new
  policy query". The SPA doesn't call this endpoint (the dashboard uses
  `/api/admin/dashboard`), but it is a documented, Swagger-visible API.
- **Reproduced:** `AUD_admin_stats_count_an_expired_policy_as_expired` →
  "stats: Active=1, Expired=0".
- **Fix:** split Active by `EndDate < startOfToday` in the same GROUP BY (as
  `PolicyStatusFilter` does). If the endpoint isn't needed, retire it.
- **Effort:** S.

### L-3 — The demo-data guard is a deny-list of one name

- **Where:** [DemoDataSeeder.cs:65](../src/PolisGo.Infrastructure/Persistence/DemoDataSeeder.cs)
- **What:** only an environment named exactly `Production` (any case) is
  refused. `Staging`, `prod`, `Prod-EU` and the like get four staff accounts
  (agents, adjusters) with the password printed in the README.
- **Reproduced:** `AUD_demo_data_is_seeded_only_in_development("Staging")`
  and `("prod")` → "Seeded, 4 staff accounts with the documented password".
- **Fix:** allow only `IsDevelopment()` (or an explicit allow-list), and log
  the refusal.
- **Effort:** S.

### L-4 — A password change doesn't end other sessions

- **Where:** [ProfileService.cs:105-106](../src/PolisGo.Application/Profile/ProfileService.cs)
- **What:** listed in the README roadmap, but the security-stamp machinery
  now makes it a one-line fix: someone who changes a password because of a
  stolen session stays exposed for up to 60 minutes.
- **Reproduced:** `AUD_changing_the_password_ends_other_sessions` → "The
  other session still gets 200 after a password change".
- **Fix:** rotate `SecurityStamp` on change and return a fresh token for the
  current tab (the SPA stores it).
- **Effort:** S.

### L-5 — The password cap doesn't fit BCrypt's 72 bytes

- **Where:** [AuthValidation.cs:14-15](../src/PolisGo.Application/Auth/AuthValidation.cs), [validation.ts](../frontend/src/features/auth/validation.ts) `PASSWORD_MAX`
- **What:** the comment says 64 characters "keeps multi-byte input safe". It
  doesn't: Cyrillic and Azerbaijani letters are 2 UTF-8 bytes, so only about
  the first 36 count. Two different valid passwords that share those verify
  as the same.
- **Reproduced:** `AUD_two_different_valid_passwords_do_not_verify_against_each_other`
  → a 41-character Cyrillic password B verifies against the hash of A (77 bytes).
- **Fix:** limit by UTF-8 byte count (≤ 72) on both sides, or pre-hash
  (BCrypt.Net's `EnhancedHashPassword`, with a rehash on next login).
- **Effort:** S.

### L-6 — Frozen pricing factors don't reproduce the premium

- **Where:** [PolicyConfiguration.cs:35-41](../src/PolisGo.Infrastructure/Persistence/Configurations/PolicyConfiguration.cs)
- **What:** the premium is computed at full precision, but the factors are
  stored as `decimal(9,4)`. SQL Server rounds them; SQLite stores decimals as
  text and doesn't, so the existing test that compares quote and detail
  factors passes there but not on SQL Server. The "prices you can explain
  later" promise then shows a breakdown that multiplies to a different
  amount.
- **Reproduced (SQL Server):** CASCO, 5 months, a young driver: quote
  `totalFactor` 0.8633625, stored 0.8634; premium 215.84 vs base 250 ×
  0.8634 = 215.85.
- **Fix:** store factors at `decimal(18,10)` (migration), or present them as
  rounded and label the product as approximate; add the case to the SQL
  Server API spec.
- **Effort:** S.

### L-7 — No security headers on API responses

- **Where:** [Program.cs](../src/PolisGo.Api/Program.cs), [ClaimsController.cs:337](../src/PolisGo.Api/Controllers/ClaimsController.cs)
- **What:** no `X-Content-Type-Options: nosniff`, no `Cache-Control:
  no-store` on personal data (claim photos, profile), no `Content-Security-
  Policy`/`frame-ancestors` on API responses. Uploads are checked by magic
  bytes and served as attachments, so this is defence in depth.
- **Reproduced:** document download → `image/png`, `attachment;
  filename=photo.png`, and all five headers absent (`probe-sqlserver.log`).
- **Fix:** a small middleware setting `nosniff`, `no-store` for
  authenticated responses and `default-src 'none'; frame-ancestors 'none'`.
- **Effort:** S.

### L-8 — Hard-coded container names

- **Where:** [docker-compose.yml:4, 29](../docker-compose.yml)
- **What:** `container_name: polisgo-sqlserver` / `polisgo-api` are global
  per Docker host, so the README quick start fails in a second checkout,
  a worktree or a parallel CI runner while another stack exists, even a
  stopped one.
- **Reproduced:** quick start from a clean clone on this machine → "Conflict.
  The container name "/polisgo-sqlserver" is already in use". The audit then
  ran the stack with a scratch override that only renames the two containers
  (`audit-names.override.yml`).
- **Fix:** drop `container_name` (nothing in the repo refers to it; `ci.yml`
  uses service names).
- **Effort:** S.

### L-9 — Supply-chain and CI hygiene

- **Where:** [dependabot.yml](../.github/dependabot.yml), [ci.yml](../.github/workflows/ci.yml), [Dockerfile](../src/PolisGo.Api/Dockerfile), [docker-compose.yml:3](../docker-compose.yml), [frontend/package.json](../frontend/package.json)
- **What (from reading and tool output):**
  - Dependabot covers NuGet and Actions but **not npm** (or Docker), so the
    frontend's 40 direct dependencies never get update PRs.
  - CI doesn't run `npm run format:check` (it passes today), `npm audit` or
    `dotnet list package --vulnerable`.
  - Actions are pinned to major tags, not commit SHAs. `actions/cache` is
    `@v6` in one job and `@v4` in another.
  - Images float: `mssql/server:2022-latest`, `dotnet/sdk:10.0`,
    `aspnet:10.0` (no digest).
  - `npm ci` warns that ESLint 9.39.5 is no longer supported.
  - `HealthChecks.EntityFrameworkCore` and `Options.ConfigurationExtensions`
    sit at 10.0.0 while the rest of the stack is at 10.0.15.
- **Fix:** add `npm` (directory `/frontend`) and `docker` ecosystems to
  Dependabot; add format and audit steps; pin actions by SHA (Dependabot
  keeps them current); bump the two 10.0.0 packages; plan the ESLint 10
  move.
- **Effort:** S.

### L-10 — CI's coverage summary undersells the tests

- **Where:** [ci.yml:41-45, 66-95](../.github/workflows/ci.yml)
- **What:** the step summary reports the root `line-rate`, which counts
  generated migration code: 31.2 %. Excluding `Migrations/`, coverage is
  **93.3 %** (Application 95.5 %, Infrastructure 92.7 %, Domain 90.4 %,
  Api 80.8 %). A reviewer opening the Actions summary sees 31 %.
- **Reproduced:** parsed the Cobertura file from step 3 per class.
- **Fix:** exclude `**/Migrations/*.cs` in the collector (runsettings
  `ExcludeByFile`).
- **Effort:** S.

### L-11 — README drift

- **Where:** [README.md:341-342, 370-374](../README.md)
- **What:** "146 end-to-end tests … 78 at 1440px, plus the 36 cabinet and
  staff tests again at 390px". The total is right; the split is **94 + 52**.
  The CI section says the e2e job uses a fresh database with the dev admin
  seed, but it also loads the demo data (`COMPOSE_FILE` with
  `docker-compose.demo.yml`). Everything else checked matches: commands,
  endpoint table (every controller route is listed), 449 / 309 counts,
  features.
- **Reproduced:** `npx playwright test --list --grep-invert @screenshots` →
  "Total: 146 tests"; chromium 94, mobile 52.
- **Fix:** update the two sentences.
- **Effort:** S.

### L-12 — Everything for every language loads up front

- **Where:** [i18n/index.ts:3-5, 48](../frontend/src/i18n/index.ts)
- **What:** EN, RU and AZ are imported statically into one 242 kB chunk
  (72 kB gzip) on the critical path, beside the 84 kB gzip entry chunk and
  zod (39 kB gzip). The landing page also downloads ~378 kB of fonts.
- **Reproduced:** build output; Playwright request log on `vite preview`
  (32 requests, 378 kB fonts).
- **Fix:** load the active locale with a dynamic import (i18next backend or
  `import()`); check whether both static and variable Fontsource packages
  are needed (both are dependencies).
- **Effort:** S.

### L-13 — Test gaps

Found by reading; none of these hides a known bug beyond the findings above.

- **Migration backfills** (`PolicyHistoryAndPricing`, `CustomerAgent`,
  `AdminPanel`) only ever run against an empty database in CI. The SQL reads
  correctly, but no test migrates a database with rows in it.
- **Concurrency** is tested only for two claim approvals
  (`Concurrency_TwoApprovalsOnSameClaim…`), not for pay, payout or staff
  changes. H-2, M-1 and M-2 would have been caught. The
  `FileSqliteDb` + barrier helpers in `AuditReproTests.cs` make these
  testable.
- **The "mobile" project** is `devices['Desktop Chrome']` at 390 × 844
  (no touch, no `isMobile`), and **768 px** isn't covered. My sweep of every
  route for every role at 390 and 768 px in RU and AZ found **no horizontal
  overflow** (`audit-layout.spec.ts`, 20/20).
- **`AuthServiceTests`** runs on EF InMemory, not `SqliteTestDb` as CLAUDE.md
  prescribes, so the unique email index isn't exercised there (the HTTP
  tests cover it).
- **Time:** `ClaimService`, `VehicleService` and the entities' history rows
  use `DateTime.UtcNow` directly, not the injected `TimeProvider`, so tests
  around "today" use the real clock and could flake at UTC midnight.

---

## Checked and found clean

- **JWT and sessions:** issuer, audience, lifetime and signing key validated;
  30 s clock skew. A role claim edited to Admin → 401; `alg: none` → 401; an
  expired `exp` → 401. Every request checks the security stamp and the
  active flag; deactivation and role changes rotate the stamp (tested). The
  `AdminPanel` migration backfills a unique stamp per user (`NEWID()`).
- **Mass assignment:** request DTOs are narrow records. A `role` field in the
  register body is ignored (token role Client, verified). Premium and amounts
  are always server-side. Clients' customer id always comes from the token.
- **IDOR:** `PolicyAccess` / `ClaimAccess` / `CustomerAccess` are applied in
  every read and write path, including documents, history, read marks,
  nested customer data and CSV exports. Cross-client access → 404 (existing
  tests plus code reading). Exceptions: H-1 and M-3.
- **Staff management:** self-action and last-admin rules, client ids → 404,
  audit entries written in the same `SaveChanges`, former agents' customers
  released and audited. Exception: the M-1 race.
- **File uploads:** extension allow-list plus magic bytes, a 5 MB service
  limit under a 10 MB request cap, 10 per claim, open claims only. File names
  sanitised for both separators; storage under server-generated GUID names
  outside any web root, on a volume; `Path.GetFileName` again on read;
  orphan cleanup on a failed save; `Content-Disposition` with RFC 5987
  encoding.
- **CORS:** explicit origins, wildcards rejected at startup, no credentials.
  A preflight from `https://evil.example` gets no `Access-Control-Allow-Origin`
  (verified).
- **Passwords:** BCrypt work factor 12, malformed hashes handled, policy
  enforced on both sides, change requires the current password. Except L-5.
- **Errors:** ProblemDetails with `traceId` everywhere; 500 details hidden
  outside Development (unit-tested); unique-violation mapping portable.
- **CSV injection:** `= + - @ \t \r` prefixed with an apostrophe, RFC 4180
  quoting, UTF-8 BOM, numbers in the invariant culture, 5000-row cap,
  filters shared with the list.
- **State machines and history:** every claim and policy transition goes
  through the entity and appends history; illegal transitions → 409;
  approve ≤ claimed with 2 decimals; a reject needs a reason; only the
  assigned adjuster or an admin decides; claim `RowVersion` checked both
  up front and on save.
- **Money and rounding:** single rounding at the end, `AwayFromZero`,
  `decimal(18,2)` money, amount precision validated before SQL Server could
  round it. Except L-6.
- **Expiry:** derived consistently in `StatusOn`, `PolicyStatusFilter`,
  `PolicyRow` and the customer counts. Except L-2.
- **Pagination and sorting:** clamped page size, a unique `Id` tie-breaker
  on every sort, search length limits, LIKE wildcards escaped. Except L-1.
- **Queries:** no N+1 found. Lists project in one statement with correlated
  subqueries; detail pages use a fixed number of queries; dashboard and stats
  aggregate in SQL. Indexes exist for the filtered, sorted and grouped
  columns (FK indexes by convention). Admin stats and dashboard caches are
  keyed correctly and judged against the injected clock.
- **Frontend:** token in memory with a sessionStorage mirror (reasoned in
  `tokenStore.ts`); 401 clears the token; route guards are UX only. Zod rules
  match the server limits (claims, comments, phone, password, names). i18n:
  all 1312 English keys exist in RU and AZ (RU adds plural forms);
  interpolation variables match; the only identical-to-English values are
  names, symbols and words that are the same in Azerbaijani; no hard-coded
  English found in JSX. axe (WCAG 2.2 AA tags, serious and critical) runs on
  every page in both themes, including dialogs, error summaries and the
  calendar, and passes. Keyboard-only claim and decision flows are covered.
  No horizontal overflow at 390 / 768 px in RU and AZ (my sweep) or at
  1440 px (suite).
- **Docker:** multi-stage build, runtime as the non-root `app` user, no
  secrets baked in, health checks on both services, migrations with retry.
  BuildKit sends only the `COPY` paths (16.6 kB context with
  `frontend/node_modules` present). Except M-7 and L-8.
- **CI:** workflow-level `contents: read`, CI-only throwaway secrets clearly
  labelled, artifacts on failure, `forbidOnly`, no retries hiding flakiness.
- **Dependencies:** no vulnerable NuGet or npm packages; everything sits on
  the .NET 10 LTS line.
- **README commands:** quick start, demo override and the local-dev
  `dotnet ef` command (it defaults to the Development environment, so
  user-secrets and the LocalDB connection string load) all work as written.

## What this audit did not cover

- A real Lighthouse run: Lighthouse isn't in the project, and I didn't
  install it. The numbers above are lab measurements with Chrome DevTools
  throttling, not Lighthouse scores.
- Screen readers. Accessibility was checked through the existing axe runs
  and by reading.
- Production hosting of the SPA: the repo has none, so there are no static
  hosting headers or CSP to review.
- Load testing beyond the concurrency races.

## For Phase 2

- The regression tests are ready: each `AUD_*` test and
  `audit-cache.spec.ts` fails today and should pass after its fix.
- Your Phase 2 instructions name the branch `audit/fable`, while this phase
  is on `audit/opus`. Tell me which one to use.
- M-3 and M-6 need a product decision from you before I can fix them
  (which agent model; when cover may start). H-1 needs one for the adjuster
  read scope.
