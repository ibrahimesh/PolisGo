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
  service, `PolicyAccess` / `ClaimAccess` decide which rows a caller sees; a
  row outside that scope is a 404, never a 403, so existence isn't leaked.
  Any new endpoint that returns policies or claims must go through them.
- **Lists are paged** with `PagedResult<T>`; `pageSize` is clamped to 1–50.
- **Errors** are ProblemDetails with `traceId`, written only by
  `ExceptionHandlingMiddleware` — throw `ValidationException`,
  `NotFoundException`, `ConflictException`; no try/catch in controllers.
- **Swagger:** XML `<summary>` and `<response>` docs plus
  `[ProducesResponseType]` for every status an endpoint can return.

### Endpoints

| Method | Route | Access |
| ------ | ----- | ------ |
| POST | `/api/auth/register` · `/api/auth/login` | Anonymous |
| GET | `/api/auth/me` | Any signed-in user |
| GET, PUT | `/api/me` · POST `/api/me/change-password` | Any signed-in user (always the caller's own account) |
| GET | `/api/me/overview` · `/api/me/reminders` | Client |
| POST | `/api/me/reminders/{policyId}/read` · `/read-all` | Client; the policy goes through `PolicyAccess` |
| POST | `/api/users/staff` | Admin |
| POST | `/api/quotes/calculate` | Anonymous |
| GET | `/api/policy-types` | Anonymous (public cache 5 min) |
| GET, POST | `/api/vehicles` | Signed in; Clients see/create only their own |
| GET | `/api/policies` (status, type, search, sort, paged) · `/api/policies/{id}` (detail) | Signed in, scoped by `PolicyAccess` |
| POST | `/api/policies/quote` · `/api/policies` · `/api/policies/{id}/pay` | Client, Agent, Admin |
| POST | `/api/policies/{id}/cancel` | Signed in, scoped by `PolicyAccess` |
| GET | `/api/claims` · `/{id}` · `/{id}/history` · `/{id}/documents/{docId}` | Signed in, scoped by `ClaimAccess` |
| POST | `/api/claims` | Client, Agent, Admin |
| POST | `/api/claims/{id}/documents` | Signed in, scoped by `ClaimAccess` |
| POST | `/api/claims/{id}/review` · `/approve` · `/reject` · `/pay` | Adjuster, Admin |
| GET | `/api/customers` (search, sort, paged) · `/api/customers/{id}` | Admin, Agent, Adjuster; nested policies/claims scoped as above |
| GET | `/api/admin/stats` | Admin (cached 60 s) |
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
- **Status changes go through the entity** (`RecordIssued`, `Activate`,
  `Cancel`), which append `PolicyStatusHistory`. Pricing factors are frozen
  on the policy at issue (`Policy.Pricing`); quote and create share
  `PolicyService.PriceAsync` so the quoted premium is the charged one.
- **Shared rule classes with stable messages** (`AuthValidation`,
  `VehicleValidation`, `PolicyValidation`): the SPA's `apiErrors.test.ts`
  reads them and fails on a message without a translation.
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
- `src/features/<area>` — feature code; `src/pages` — route screens. The
  client cabinet: `cabinet` (shell, sidebar, bottom bar, user menu, private
  queries under the `['cabinet']` key prefix), `overview`, `policies`,
  `wizard` (purchase), `reminders`, `profile`, `help`, `vehicles`,
  `certificate` (PDF).
- Every private query lives under `cabinetKeys.all`; a write invalidates
  that prefix (`useInvalidateCabinet`), and sign-out clears the cache.
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
- Motion only via `<Reveal>` (scroll), hover and focus; content must stay
  visible by default and respect `prefers-reduced-motion`.
- Signed-in pages use `PageHeader` (40px serif h1, 28px on phones), not the
  landing's 64–96px headings. Data cards are `Card variant="paper"`; status
  badges on paper use `onPaper`.
- Landing sections are listed once in `components/layout/navigation.ts`;
  header, mobile menu, command palette (Ctrl/⌘+K) and footer read it.
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
- PDF certificates: `features/certificate` (pdf-lib + fontkit, MIT; static
  Fontsource WOFF files, OFL). Fontsource splits fonts by Unicode subset, so
  text is drawn in runs per file (`textRuns.ts`); add a character range to
  `subsetsFor` if a new string needs another file. The chunk loads on click.

### i18n

- Never hard-code user-facing text. Add every key to `en`, `ru` and `az`
  together (a test fails if the files drift).
- Zod and form error messages are i18n keys, translated at render.
- New API validation messages get a mapping in `i18n/apiErrors.ts`; errors
  are shown through `ErrorNotice`, which includes the server `traceId`.
- Format numbers with `useFormatters()`, not raw `Intl` — Chromium's ICU
  lacks Azerbaijani separators and the helper fixes that.
- Check long RU/AZ strings on mobile (390px) before calling UI done.

### Testing

Run from `frontend/`:

- `npm run lint` · `npm run typecheck` · `npm test` (Vitest) · `npm run build`
  — CI runs exactly these.
- `npm run e2e` — Playwright + axe against the real API (needs the Docker
  stack on `:8080`, rebuilt from the current branch; starts the dev server
  itself). Covers happy paths, negative form cases, server-400 mapping,
  the command palette, the mobile menu and axe in both themes, and the client
  cabinet (`cabinet-*.spec.ts`: purchase, certificate, renewal, account,
  notifications, forbidden access, axe and 390px width). The `mobile`
  project reruns the cabinet specs at 390×844. Arrange data through the API
  (`registerSession`, `useSession`, `cabinetApi` in `e2e/helpers.ts`);
  test through the UI only what the test is about. Creates real users with
  `@polisgo.test` emails. Not run in CI yet.
- `npm run e2e:screenshots` — regenerates `frontend/docs/screenshots`
  (landing full page; cabinet pages first screen, dark and light, desktop and
  mobile).
- First-time e2e setup: `npx playwright install chromium`.
