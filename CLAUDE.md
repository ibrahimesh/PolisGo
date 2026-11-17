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
| POST | `/api/users/staff` | Admin |
| POST | `/api/quotes/calculate` | Anonymous |
| GET | `/api/policy-types` | Anonymous (public cache 5 min) |
| GET, POST | `/api/vehicles` | Signed in; Clients see/create only their own |
| GET | `/api/policies` · `/api/policies/{id}` | Signed in, scoped by `PolicyAccess` |
| POST | `/api/policies` · `/api/policies/{id}/pay` | Client, Agent, Admin |
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
  role sees which workspace section lives in `features/workspace/sections.ts`.
- `src/components/ui` — design-system components; `components/layout` — shell.
- `src/features/<area>` — feature code; `src/pages` — route screens.
- `src/i18n` — setup, `locales/{en,ru,az}.json`, API error mapping, number
  formatting. `src/lib` — dates and hooks. `e2e/` — Playwright suite.
- Routes are lazy-loaded (`React.lazy` in `App.tsx`); add new pages the same way.

### Design

- `frontend/DESIGN.md` is the source of truth ("Midnight Institutional").
- Use tokens only (`bg-bg`, `bg-surface`, `text-muted`, `border-line`,
  `bg-paper`, ...), never raw hex in components. Tokens are CSS variables in
  `src/styles/index.css`, exposed to Tailwind via `@theme`.
- Any new colour pair must meet WCAG AA in both themes; record it in the
  DESIGN.md contrast table.
- No mock or placeholder data in the app — screens show real API data or an
  empty state.

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
  stack on `:8080`; starts the dev server itself). Creates real users with
  `@polisgo.test` emails. Not run in CI yet.
- `npm run e2e:screenshots` — regenerates `frontend/docs/screenshots`.
- First-time e2e setup: `npx playwright install chromium`.
