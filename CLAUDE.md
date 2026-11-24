# PolisGo — Working Rules

Insurance management API. Junior .NET portfolio project. These rules apply to
every change in this repo.

## Architecture

- **Clean Architecture**. Dependencies point inward only:
  `Api -> Infrastructure -> Application -> Domain`.
  Never introduce a reference that points outward.
- **`PolisGo.Domain` has zero NuGet dependencies.** No EF Core, no ASP.NET, no
  attributes from external packages. Pure C#. This keeps the core business
  model independent of frameworks.
- `PolisGo.Application` defines use cases and interfaces. Infrastructure
  implements them.
- `PolisGo.Infrastructure` owns EF Core, DbContext, external services.
- `PolisGo.Api` is the composition root (DI wiring, controllers, pipeline).

## API

- **Controllers, not Minimal APIs.** Explicit, attribute-routed controllers in
  `PolisGo.Api/Controllers`.
- **`async` everywhere** for I/O. Return `Task<T>` / `Task<IActionResult>`.
- **DTOs for all API input/output.** Never expose domain entities through
  controllers — entities are internal, DTOs are the contract.
- **Authorization has two layers.** `[Authorize(Roles = ...)]` on the
  controller decides who may call an endpoint (wrong role → 403). Inside the
  service, `PolicyAccess` / `ClaimAccess` / `CustomerAccess` decide which
  rows a caller sees; a row outside that scope is a 404, never a 403, so
  existence isn't leaked. Any new endpoint that returns policies, claims or
  customers must go through them. An agent's customers are those with
  `Customer.AgentId` = the agent (an Admin assigns them). An agent *reads*
  the policies they sold (kept after the customer moves on) and every policy
  and claim of a customer now in their book; every *write* (file or
  withdraw a claim, upload, pay, cancel) goes through `PolicyAccess.WritableBy`
  / `ClaimAccess.WritableBy`, which need the customer in the agent's current
  book (a blocked withdraw says `OutsideYourBook`). Adjusters see a customer,
  and a policy, only through a claim in their reach (the open queue or
  their own), and never cancel a policy.
- **Claim decisions take the `rowVersion`** the caller loaded; a stale one is
  a 409 titled "Concurrent update" (`ConcurrencyConflictException`), which
  the SPA tells apart from other 409s. The claim detail's `actions` list says
  what the caller may do and why not (`ClaimActionBlock` codes): add a code
  there and a translation in the same change.
- **Sessions are checked on every request** (`SessionValidator`): the
  token's `stamp` must match the user's `SecurityStamp` and the user must be
  active. Rotate the stamp (`User.Deactivate`, `User.ChangeRole`,
  `User.ChangePassword`, which hands the caller a fresh token) whenever a
  change must end existing sessions; inactive users can't sign in.
- **Staff actions are audited**: any admin change to an account or an
  assignment adds an `AuditEntry` in the same SaveChanges. The audit feed
  (`AuditLogService`) reads only recorded rows: status history and audit
  entries. Never synthesise events.
- **Error tracking** (System section, ADR-002 in `docs/DECISIONS.md`):
  `ExceptionHandlingMiddleware` hands unhandled exceptions and 5xx answers
  to `ErrorCapture` → a bounded queue (`TryEnqueue`: never waits, never
  throws) → `ErrorWriterService` → `ErrorRecorder`. Never capture
  validation, 401, 403, 404 or 409/412 answers. Everything stored, logged or
  returned in a 500 detail goes through `Redaction` first; the actor is a
  role and a user id only; endpoints are route templates, never URLs. The
  ProblemDetails `traceId` comes from `RequestTrace` so the user's
  Reference (`ErrorReference`: first 8 of the 32-hex trace id, upper case) is
  the stored one. Group triage goes through `ErrorGroup` with the caller's
  `rowVersion` and an `AuditEntry`; counting doesn't change the version.
  Caps (per-group rows, queue, new client groups per hour, client report
  limits) are configuration (`ErrorTracking`, `RateLimits:ClientErrors*`).
- **Staff management rules** live in `StaffAdminService`: nobody acts on
  their own account, the last active admin is kept (checked first, inside
  `BeginSerializableTransactionAsync` with the write, so two admins acting on
  each other at once can't both pass; SQL Server's deadlock victim is a 409
  "Concurrent update"), a former agent's customers are released. Messages in
  `AdminValidation` (contract-tested).
- **CSV exports** reuse the list's filter (`Filter(...)` in the service), are
  capped at 5000 rows, and build cells only through `Csv.Text` /
  `Csv.Number` / `Csv.Date` (formula-safe, UTF-8 with BOM).
- **Lists are paged** with `PagedResult<T>`; `pageSize` is clamped to 1–50.
- **Errors** are ProblemDetails with `traceId`, written only by
  `ExceptionHandlingMiddleware` — throw `ValidationException`,
  `NotFoundException`, `ConflictException`; no try/catch in controllers.
- **Security headers** (`SecurityHeadersMiddleware`, outermost): `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a `default-src
  'none'` CSP (not on `/swagger`), and `Cache-Control: no-store` on
  signed-in responses unless the endpoint sets its own cache policy.
- **Brute-force limits** (`RateLimiting.cs`, `[EnableRateLimiting]`): sign-in
  and registration per IP address, password change per account, fixed
  windows from `RateLimits` (strict in `appsettings.json`, relaxed by
  `docker-compose.e2e.yml` and `ApiFactory`). Over the limit the limiter
  throws `TooManyRequestsException`: a 429 with `Retry-After` and
  `AuthValidation.Messages.TooManyAttempts` (translated in the SPA). Behind a
  reverse proxy, configure forwarded headers before trusting the address.
- **Swagger:** XML `<summary>` and `<response>` docs plus
  `[ProducesResponseType]` for every status an endpoint can return.

### Endpoints

| Method | Route | Access |
| ------ | ----- | ------ |
| POST | `/api/auth/register` · `/api/auth/login` | Anonymous |
| GET | `/api/auth/me` | Any signed-in user |
| GET, PUT | `/api/me` · POST `/api/me/change-password` | Any signed-in user (always the caller's own account) |
| GET | `/api/me/overview` · `/api/me/reminders` · `/api/me/claim-updates` | Client |
| POST | `/api/me/reminders/{policyId}/read` · `/read-all` | Client; the policy goes through `PolicyAccess` |
| POST | `/api/me/claim-updates/{claimId}/read` · `/read-all` | Client; the claim goes through `ClaimAccess` |
| GET, POST | `/api/users/staff` (search, role, status, paged) | Admin |
| POST | `/api/users/{id}/deactivate` · `/reactivate` · PUT `/api/users/{id}/role` | Admin; staff accounts only (a client id is a 404) |
| POST | `/api/quotes/calculate` | Anonymous |
| GET | `/api/policy-types` | Anonymous (public cache 5 min) |
| GET | `/api/vehicles` | Signed in; Clients see only their own, staff those of customers in `CustomerAccess` |
| POST | `/api/vehicles` | Client, Agent, Admin (an Agent only for their own customers) |
| GET | `/api/policies` (status, type, search, sort, paged) · `/api/policies/{id}` (detail) | Signed in, scoped by `PolicyAccess` (an Adjuster sees only policies with a claim in reach) |
| POST | `/api/policies/quote` · `/api/policies` · `/api/policies/{id}/pay` | Client, Agent, Admin |
| POST | `/api/policies/{id}/cancel` | Client, Agent, Admin; scoped by `PolicyAccess` |
| GET | `/api/policies/export` (list filters, CSV) | Agent, Admin; scoped by `PolicyAccess` |
| GET | `/api/claims` (status, open, search, sort, paged) · `/{id}` · `/{id}/history` · `/{id}/documents/{docId}` | Signed in, scoped by `ClaimAccess` |
| POST | `/api/claims` · `/api/claims/{id}/withdraw` | Client, Agent, Admin (withdraw scoped by `ClaimAccess`) |
| POST | `/api/claims/{id}/documents` | Signed in, scoped by `ClaimAccess` |
| POST | `/api/claims/{id}/review` · `/approve` · `/reject` · `/pay` (optional `rowVersion`) | Adjuster, Admin |
| GET | `/api/claims/export` (list filters, CSV) | Adjuster, Admin; scoped by `ClaimAccess` |
| GET | `/api/customers` (search, sort, paged) · `/api/customers/{id}` | Admin, Agent, Adjuster; rows by `CustomerAccess`, nested policies/claims scoped as above |
| PUT | `/api/customers/{id}/agent` | Admin |
| GET | `/api/staff/overview` | Agent, Adjuster, Admin (a block per desk) |
| GET | `/api/admin/stats` | Admin (cached 60 s) |
| GET | `/api/admin/dashboard` (from, to; 24 months max) | Admin (cached 60 s per range) |
| GET | `/api/admin/audit` (search, actions, actor, entity type, from, to, paged) | Admin |
| GET | `/api/admin/errors` (source, status, regressed, from, to, httpStatus, endpoint, role, search incl. a Reference, sort, paged) · `/summary` · `/lookup?reference=` · `/{id}` | Admin |
| PATCH | `/api/admin/errors/{id}` (status, note, `rowVersion`) · DELETE `/api/admin/errors/resolved?olderThanDays=` | Admin; audited |
| GET | `/api/admin/system/health` | Admin |
| POST | `/api/diagnostics/client-errors` | Anonymous (actor from the token when sent); 8 KB, closed schema, per-address limit and shared budget |
| POST | `/api/diagnostics/test-failure` | Anonymous; a 404 unless `Diagnostics:TestFailures` outside Production (the e2e override) |
| GET | `/health` | Anonymous |

## Persistence

- **SQL Server + EF Core**. LocalDB in development.
- **Fluent API configurations only** — one `IEntityTypeConfiguration<T>` per
  entity under `PolisGo.Infrastructure/Persistence/Configurations`. No data
  annotations on domain entities (keeps Domain free of EF dependencies).
- **Money is `decimal(18,2)`**, currency is **AZN** (Azerbaijani manat).
- **Primary keys are `Guid`**.
- **Enums stored as strings** in the database for readability in SQL tools.
- **Reads:** `AsNoTracking()`, project to DTOs, aggregate in SQL
  (`GroupBy`/`Count`/`Sum`), a fixed number of queries per request — no N+1.
- **Stay provider-portable:** tests run on SQLite, production on SQL Server.
  Avoid `EF.Functions` that exist on only one provider and `DateTime`
  subtraction in queries (it silently runs client-side); see
  `AdminStatsService` for a portable date-difference pattern.
- **Policy status is effective on read.** Nothing stores `Expired`: an Active
  policy past its inclusive end date reads and filters as Expired
  (`Policy.StatusOn`, `PolicyStatusFilter`). Use them in any new policy query.
- **Business dates are Baku dates.** "Today", start/end, incident, birth and
  licence dates come from `BusinessCalendar.Today(clock)` (`Asia/Baku`, with
  the injected `TimeProvider`), never `DateTime.UtcNow.Date`; the SPA's
  `todayIso()` matches. Timestamps (`CreatedAt`, `PaidAt`, history) stay UTC;
  the admin dashboard and audit day filters are Baku days
  (`BusinessCalendar.StartOfDayUtc`), and the dashboard's monthly buckets
  group by the timestamps' UTC month. The API logs the zone at
  startup and refuses to start without time zone data (the aspnet image
  ships `tzdata`).
- **Cover starts tomorrow at the earliest** (`StartDateTooEarly`), and a
  Draft whose start date has come can't be paid (`DraftStartPassed`): no
  policy pays for the hours before its purchase.
- **Status changes go through the entity** (`RecordIssued`, `Activate`,
  `Cancel`), which append `PolicyStatusHistory`. Pricing factors are frozen
  on the policy at issue (`Policy.Pricing`); quote and create share
  `PolicyService.PriceAsync` so the quoted premium is the charged one.
- **Shared rule classes with stable messages** (`AuthValidation`,
  `VehicleValidation`, `PolicyValidation`, `ClaimValidation`): the SPA's `apiErrors.test.ts`
  reads them and fails on a message without a translation.
- **Claim status changes go through the entity** too (`StartReview`,
  `Approve`, `Reject`, `MarkPaid`, `Withdraw`), each appending
  `ClaimStatusHistory`. Documents can be added only while `Claim.IsOpen`.
- **Money moves once.** A payout is claimed in the database
  (`Claim.StartPayout`, saved) before the payout gateway is called; a policy
  payment is settled by `Policy.RowVersion` and a unique completed payment.
  Both gateways take an idempotency key per claim / per policy, so a retry
  is the same transfer, never a second one.
  Claim updates and renewal reminders are derived on read; only read marks
  (`ClaimUpdateRead`, `PolicyReminderRead`) are stored.
- **Text search folds case in .NET** (`SearchText`), never with SQL's
  `UPPER()`/`LOWER()` on names: SQLite folds ASCII only, and SQL Server's
  `UPPER('İbrahim')` never matches "ibrahim". Users, Customers and
  AuditEntries carry a folded `SearchKey` shadow column, set on every save
  (`SearchKeys`, backfilled after startup); match with
  `EF.Property<string>(x, SearchText.KeyProperty).Contains(SearchText.Fold(term))`.
  ASCII-only values (policy and claim numbers) may use `ToLower()`. The SPA's
  `foldSearch` (`lib/searchText.ts`) folds the same way.
- **Check text lengths in the service, not only in the column.** SQLite
  ignores `HasMaxLength`; SQL Server fails the insert with a 500. Every
  user- or staff-supplied string gets an explicit limit and a 400, and
  `e2e/claims-api.spec.ts` covers the edges against SQL Server.
- **Index what new queries filter, group or sort on**, in the entity's
  configuration, shipped with a migration in the same commit.

## Code style

- Short comments explaining **WHY**, not what. Well-named identifiers already
  describe what the code does.
- **English only** in code, identifiers, and comments.
- Nullable reference types enabled.
- Prefer small, focused commits over large ones. One concern per commit.

## Commits

- Imperative mood, lower-case type prefix: `feat:`, `fix:`, `refactor:`,
  `chore:`, `test:`, `docs:`.
- Keep subject under 72 characters. Body (optional) explains the why.

## Dependency policy

- Dependabot (`.github/dependabot.yml`) checks NuGet, npm (`/frontend`),
  Actions, the API Dockerfile and docker-compose weekly. Minor and patch
  updates come as one grouped PR per ecosystem (`nuget-minor-patch`,
  `npm-minor-patch`, `docker-minor-patch`, `docker-compose-minor-patch`,
  `actions`), majors one PR each, at most 3 open per ecosystem.
- **Majors taken by hand** (ignored there): `Microsoft.*`, `System.*` and
  EF Core (the stack stays on .NET 10 LTS, the Microsoft 10.0.x packages on
  one patch level, see `SupplyChainConfigurationTests`),
  `Swashbuckle.AspNetCore` (9.x until the owner decides), the `dotnet/sdk`
  and `dotnet/aspnet` images (10.0) and `mssql/server` (2022). New digests
  of those tags still come.
- A platform major is one deliberate change: all those packages, both
  images, `<TargetFramework>` and CI's `dotnet-version` together, lifting the
  ignore rule in the same commit. CI's SQL Server service image (`ci.yml`)
  isn't watched by Dependabot; keep its digest equal to docker-compose's.
- Ignore rules use `update-types`, never `versions`, each with a comment
  saying why: security updates (a repository setting; keep it on) skip
  update-type rules, so a vulnerability is still fixed across a major,
  while a `versions` range would block that fix too.

## Demo data

- `DemoDataSeeder` (Infrastructure) runs when `Demo:SeedData=true`
  (`docker-compose.demo.yml`), only in Development, once per database (the
  `demo.agent1@demo.polisgo.az` marker). Demo accounts share `Demo:Password`
  (required, no built-in value: `MissingPassword` otherwise), never the admin
  secret. Keep its history
  consistent with the entities' rules (dates inside cover, a row per
  transition) and extend `DemoDataSeederTests` with it.

## Migrations

- Startup project: `PolisGo.Api`. Migrations project: `PolisGo.Infrastructure`.
- Command pattern (Development supplies the connection string; `-o` keeps
  migrations next to the existing ones):
  `ASPNETCORE_ENVIRONMENT=Development dotnet ef migrations add <Name> -p src/PolisGo.Infrastructure -s src/PolisGo.Api -o Persistence/Migrations`
- Docker applies pending migrations on startup
  (`Database__ApplyMigrationsOnStartup`); check the API log for
  `Applying migration` after `docker compose up --build`.

## Testing (backend)

- `dotnet test PolisGo.slnx` — everything runs in-process; no SQL Server needed.
- **Service tests** use `SqliteTestDb` (real SQL semantics) and `TestData`
  builders; pass a `FakeClock` to anything time-dependent.
- **HTTP tests** use `ApiFactory` (`WebApplicationFactory` + SQLite) and
  `ClientAs(role)` for a real JWT. Every endpoint gets one: anonymous → 401,
  each wrong role → 403, happy path and 404 as ProblemDetails.
- **Concurrency and SQL Server tests:** two requests at once run on
  `FileSqliteDb` (one connection per context) with `ArrivalGate`/`SaveGate`
  lining them up, and again on SQL Server as `[SqlServerFact]` with
  `SqlServerTestDb` (a fresh database built by the migrations). Those run
  when `POLISGO_TEST_SQLSERVER` holds a connection string (CI job "SQL Server
  integration tests"; locally e.g. `Server=127.0.0.1,1433;User Id=sa;...`)
  and are skipped otherwise. Anything that depends on locking, decimal
  rounding or migration SQL gets one.
- CI builds with `-warnaserror`; keep the build warning-free.

## Frontend

SPA in `/frontend`: Vite + React 19 + TypeScript (strict), Tailwind v4,
React Router, TanStack Query, React Hook Form + Zod, react-i18next.

### Run

- Start the API first: `docker compose up -d` (API on `:8080`), or
  `dotnet run --project src/PolisGo.Api` (`:5058` — then set
  `VITE_API_BASE_URL=http://localhost:5058`, see `frontend/.env.example`).
- `cd frontend && npm install && npm run dev` → http://localhost:5173.
  The port is strict because the API's CORS list (`Cors:AllowedOrigins`)
  only allows `:5173` and `:3000`.

### Structure

- `src/api` — the only way to call the API. `types.ts` mirrors the C# DTOs
  by hand: **update it in the same change as any DTO change.** Calls go
  through `endpoints.ts`; anonymous endpoints pass `anonymous: true`.
- `src/auth` — session (`AuthProvider`), route guard (`RequireAuth`). Guards
  are UX only; the API's `[Authorize(Roles = ...)]` is the real check. Which
  role sees which workspace section lives in `features/workspace/sections.ts`
  — the router guards, sidebar, bottom bar and palette all read it.
- Sign-out: `useRequestSignOut()` navigates to `/` with state; the public
  layout finishes it (`useCompleteSignOut`). Don't call `logout()` from a
  protected page, or its guard bounces the user to `/login` first.
- `src/components/ui` — design-system components; `components/layout` — shell.
  `src/settings` — the Settings dialog (`SettingsProvider`, `useSettings()`)
  and the Reduce motion store; `src/motion` — page transitions
  (`MotionRouter`), `CountUp`, `SuccessCheck`; `src/pages/errors` —
  `ErrorPage`, `RouteErrorBoundary`, `classifyError`.
- `src/features/<area>` — feature code; `src/pages` — route screens. The
  client cabinet: `cabinet` (shell, sidebar, bottom bar, user menu, private
  queries under the `['cabinet']` key prefix), `overview`, `policies`,
  `wizard` (purchase), `claims` (list, `wizard/`, detail, `upload/`),
  `reminders` (bell: reminders and claim updates), `profile`, `help`,
  `vehicles`, `certificate` (PDF). Staff desks: `staff` (overview,
  `queue/`, `review/` with the decision panel, `customers/`, `sales/`
  with selling on a customer's behalf, CSV `ExportButton`); queries under
  `staffKeys.all`, inside the same `['cabinet']` prefix. `/app`,
  `/app/claims` and `/app/claims/:id` pick the client or staff page by role
  (an Admin's `/app` is the dashboard). Admin panel: `admin` (`dashboard/`
  with `BarChart`, `staff/`, `audit/`, `customers/AssignAgent`,
  `PolicyTypesPage`, `StaffPicker`, `system/`: the System section's
  layout, overview, errors list, detail, lookup), queries under
  `adminKeys.all` (`systemKeys` inside it).
- `src/diagnostics/reporter.ts` sends browser errors to the API: throttled,
  deduplicated, offline-queued, never reporting its own failures; route
  templates only, no form values or full URLs. Off in Vitest, and in e2e
  unless a test sets `localStorage['polisgo.e2e.reporter']='on'`. A 5xx with
  a server trace id is not reported again (the API has it).
- API timestamps are UTC without a "Z" (EF reads them back without a kind):
  parse them with `parseApiTime` (`lib/dates`), never `new Date(iso)`.
- The audit log's Actor filter is `ActorCombobox` (an editable combobox
  over the server staff search), kept visibly different from the page's
  one free-text search. List pages that sync filters to the URL build each
  change on the last one written (a ref), not on React Router's functional
  update, which hands over the params of the render that created it.
- Choosing a staff member: `StaffPicker` (server search + select), never a
  plain list of the first page of accounts.
- Every private query lives under `cabinetKeys.all`; a write invalidates
  that prefix (`useInvalidateCabinet`). Any end of a session — sign-out, the
  token's expiry timer, a 401 — clears the whole cache and the pending claim
  photos (`AuthProvider` watches `tokenStore`), so the next person on the tab
  starts empty.
- `src/i18n` — setup, `locales/{en,ru,az}.json`, API error mapping, number
  formatting. `src/lib` — dates and hooks. `e2e/` — Playwright suite.
- Routes are lazy-loaded (`React.lazy` in `App.tsx`); add new pages the same way.

### Design (v2)

- `frontend/DESIGN.md` is the source of truth ("Midnight Institutional" v2).
- Use tokens only (`bg-bg`, `bg-surface`, `text-muted`, `border-line`,
  `bg-paper`, ...), never raw hex in components. Tokens are CSS variables in
  `src/styles/index.css`, exposed to Tailwind via `@theme`.
- **Type scale is enforced:** only `text-sm` (14) … `text-4xl` (96) exist;
  Tailwind's defaults are cleared, so don't reach for `text-xs` or arbitrary
  `text-[..px]`. Labels are sentence case, `text-sm font-medium` (`<Label>`);
  no uppercase mono labels, no numbered eyebrows.
- Source Serif 4 for headlines and the price, Inter Tight for everything
  else, `tabular` for numbers. No third typeface.
- **Light theme is warm stone; no pure white anywhere** (the data card is
  ivory `bg-paper` in both themes). Any new colour pair must meet WCAG AA in
  both themes and go in the DESIGN.md contrast table.
- 2px radii, 1px hairlines, 1.5px icon strokes, 8pt spacing; the accent is
  for the primary action and key data only. No gradients, glows, emoji or
  icon-in-circle grids.
- **Motion** (DESIGN.md, Motion): transform and opacity only, 150–400ms,
  the shared tokens in `index.css` (`ease-institutional`, `--ease-spring`,
  `--duration-fast|base|slow`), no animation library. Reuse the utilities
  (`stagger`, `bar-in`, `dialog-in`, `animate-pop-in`, `skeleton`,
  `focus-ring`, `CountUp`, `SuccessCheck`) rather than new keyframes.
  `prefers-reduced-motion` and Settings → Reduce motion (`data-motion` on
  `<html>`) stop everything: use the `motion-reduce:` variant (it covers
  both) and `usePrefersReducedMotion()` / `motionReduced()` in JS. Page
  transitions run on pathname changes only (`motion/viewTransitions.ts`).
  Content must stay visible by default; keep the CLS e2e check under 0.1 and
  the landing JavaScript budget (report gzip growth against main).
- Signed-in pages use `PageHeader` (40px serif h1, 28px on phones), not the
  landing's 64–96px headings. Data cards are `Card variant="paper"`; status
  badges on paper use `onPaper`.
- Landing sections are listed once in `components/layout/navigation.ts`;
  header, mobile menu, command palette (Ctrl/⌘+K) and footer read it.
- **Header items never wrap**: the public header holds only the logo (to
  `/`, in every shell), the sections (`PRIMARY_SECTIONS` from lg, the rest
  under "More" until xl), the compact search button and the account area,
  with short names (`nav.short.*`) where a language needs them.
  `header-layout.spec.ts` checks one line per item at 1024–1440px in all
  three languages (and 390px); run it after adding anything to a header.
- **The phone menu is modal while open** (`Header`): the rest of the shell
  is `inert`, Tab wraps inside the header, Escape returns focus to the
  toggle, and reaching lg closes it. Dialogs mount outside the shell.
- **No language or theme controls in headers.** They live in the Settings
  dialog (user menu, palette, footer, mobile menu) and on the profile page,
  all through `SettingsFields`; a first visit takes the browser's language.
- **Command palette** (`CommandPalette`, loaded on first use): commands are
  grouped (Recent, Pages, Actions, Language, Theme), fuzzy-matched
  (`fuzzy.ts`), role-aware via `sectionsFor`; keep it a combobox with
  `aria-activedescendant`, the active option scrolled into view and Esc
  handled on the input.
- **Errors**: inline API errors go through `ErrorNotice` (icon, message,
  `ReferenceChip` with the first 8 characters of the trace id; none for field
  validation). Whole-page failures use `ErrorPage` (404, 403, 500, session
  ended, offline, unreachable, maintenance); both shells wrap routes in
  `RouteErrorBoundary`. Never render stack traces or error text in
  production.
- Keep the factor-axes diagram (`features/quote/FactorDiagram.tsx`) and its
  animations — the owner asked for them to stay.
- Wrap scrolling tables in a positioned container (`relative overflow-x-auto`):
  `sr-only` text is absolutely positioned and otherwise widens the page on
  phones.
- No mock or placeholder data in the app — screens show real API data or an
  empty state. Product data comes from `/api/policy-types`.

### Forms and validation

- Zod schemas with i18n-key messages; React Hook Form in `onTouched` mode;
  `FormErrorSummary` plus inline errors (`aria-invalid`, `aria-describedby`);
  focus moves to the first invalid field, including server 400s
  (`applyServerFieldErrors`).
- Account rules live twice on purpose: `features/auth/validation.ts` +
  `authSchemas.ts` (instant feedback) and `AuthValidation.cs` (authority).
  Change both together. `i18n/apiErrors.test.ts` reads the C# file and fails
  if a server message has no translation mapping.
- Phones: `PhoneInput` masks `+994 XX XXX XX XX`; the form submits E.164.
- Don't use RHF `deps` for linked fields (it shows errors on fields the user
  hasn't reached); use `useLinkedValidation`. Don't put `abort: true` on Zod
  checks — it skips every object-level refinement in the form.
- Sign-in and register never render the form over an existing session; they
  show `SessionNotice` (checking / already signed in) instead.
- Guard async submits with `useExclusive()` (lib/hooks) as well as the
  button's `loading`: it drops a second submit before the re-render.
- A radio group's empty value is `null`: give its zod type an `error`
  message, or zod's English text reaches the user. RHF can't focus radios;
  set `shouldFocusError: false` and focus in field order yourself.
- The purchase wizard keeps its state in sessionStorage per user
  (`wizardState.ts`); going back to edit cancels the unpaid draft.
- Claim wizard state: answers in sessionStorage per user (`claimWizardState.ts`),
  picked files in IndexedDB (`upload/pendingFiles.ts`, writes serialised,
  cleared on submit and sign-out). Files are uploaded after the claim is
  created, one at a time over XHR for progress (`api/upload.ts`). A 400 on
  submit sends the user to the step that owns the field.
- Steppers use `components/ui/StepNav` (five steps at most).
- **Dates: never `<input type="date">`.** Use `DateField` (`FormDateField`
  in RHF forms, `DateFilterField` for list filters): DD.MM.YYYY in every
  language, the form value stays ISO. Controlled fields register after the
  others, so forms with one set `shouldFocusError: false` and focus the first
  invalid field in order themselves. Give min/max and a hint that says why.
- Charts: one series per chart in the accent, no dual axes; each chart has a
  data table and keyboard values (`admin/dashboard/BarChart`). Few
  categories with numbers are labelled bars, not a chart.
- PDF certificates: `features/certificate` (pdf-lib + fontkit, MIT; static
  Fontsource WOFF files, OFL). Fontsource splits fonts by Unicode subset, so
  text is drawn in runs per file (`textRuns.ts`); add a character range to
  `subsetsFor` if a new string needs another file. The chunk loads on click.

### i18n

- Never hard-code user-facing text. Add every key to `en`, `ru` and `az`
  together (a test fails if the files drift).
- Zod and form error messages are i18n keys, translated at render.
- New API validation messages get a mapping in `i18n/apiErrors.ts`; errors
  are shown through `ErrorNotice`, whose Reference chip carries the server
  `traceId` (short code shown, full id in the tooltip and copied).
- Format numbers with `useFormatters()`, not raw `Intl` — Chromium's ICU
  lacks Azerbaijani separators and the helper fixes that.
- Check long RU/AZ strings on mobile (390px) before calling UI done.

### Testing

Run from `frontend/`:

- `npm audit --audit-level=high` · `npm run lint` · `npm run typecheck` ·
  `npm run format:check` · `npm test` (Vitest) · `npm run build` — CI runs
  exactly these, in this order.
- **Pinning:** GitHub Actions by commit SHA (`# vN` comment), base images by
  digest (`tag@sha256:...`), both kept current by Dependabot (NuGet, npm,
  Docker, docker-compose, Actions); `SupplyChainConfigurationTests` checks it.
- `npm run e2e` — Playwright + axe against the real API (needs the Docker
  stack on `:8080`, rebuilt from the current branch; starts the dev server
  itself). Covers happy paths, negative form cases, server-400 mapping,
  the command palette, the mobile menu and axe in both themes, and the client
  cabinet (`cabinet-*.spec.ts`: purchase, certificate, renewal, account,
  notifications, forbidden access, axe and 390px width) and the staff desks
  (`staff-*.spec.ts`: decisions, conflicts, exports, the agent's book,
  forbidden pages, axe). The `mobile` project reruns `cabinet-*` and
  `staff-*` at 390×844. Staff accounts come from `adminApi(page).createStaff`.
  Run locally with `--workers=4` or fewer: more Chromium workers than that
  crash on a laptop. Arrange data through the API
  (`registerSession`, `openSession`, `cabinetApi` in `e2e/helpers.ts`;
  the API sells cover from tomorrow only, so `activePolicy()` moves a paid
  policy back with `startCoverEarlier` — `sqlcmd` in the stack's `sqlserver`
  container, run from the repo root; a renamed compose project needs
  `COMPOSE_PROJECT_NAME`;
  no `use…` names there: ESLint's hooks rules cover `e2e/` too);
  test through the UI only what the test is about. Creates real users with
  `@polisgo.test` emails. Runs in CI (the `e2e` job) against a fresh
  `docker compose` stack. Adjuster steps use the dev seed admin
  (`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`, or `SEED_ADMIN_*` from `../.env`).
  `claims-api.spec.ts` and `api-staff.spec.ts` check length limits, uploads,
  decisions, concurrency and scoping against SQL Server. `staff-admin.spec.ts`
  covers the admin panel and reads the demo data; `cabinet-datefield.spec.ts`
  the date field. CI starts the stack with `docker-compose.demo.yml` and
  `docker-compose.e2e.yml` (`COMPOSE_FILE`; the e2e file relaxes the
  brute-force limits, which one address registering hundreds of users would
  otherwise hit); locally use `docker compose -f docker-compose.yml -f
  docker-compose.demo.yml -f docker-compose.e2e.yml up --build` before
  `npm run e2e`.
- `npm run e2e:screenshots` — regenerates `frontend/docs/screenshots`
  (first screen of the landing, auth, cabinet, staff and admin pages, dark and
  light, desktop and mobile; admin pages need the demo data).
- First-time e2e setup: `npx playwright install chromium`.
- The e2e dev server runs with `VITE_E2E_ROUTES=true` (test-only routes such
  as `/__e2e/crash` and `/app/__e2e/server-error`, a real 500 from
  `POST /api/diagnostics/test-failure`, which `docker-compose.e2e.yml`
  enables; never in a production build). `staff-system.spec.ts` covers the
  System section. If your own `npm run
  dev` holds :5173, run the suite on its own server with
  `E2E_BASE_URL=http://localhost:3000` (the API's other CORS origin).
  Helpers: `chooseSetting` (Settings dialog), `expectNoAxeViolations` and
  `waitForSettled` (axe waits for skeletons, view transitions and finite animations),
  `openMobileMenu` / `openUserMenu` (return the settled panel). Scope clicks to
  that panel or a landmark: Settings, Sign out and Help exist in more than one
  place (menu, footer, palette), and a page-wide name matches whichever is
  rendered at that moment.
