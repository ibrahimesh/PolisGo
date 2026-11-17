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

## Persistence

- **SQL Server + EF Core**. LocalDB in development.
- **Fluent API configurations only** — one `IEntityTypeConfiguration<T>` per
  entity under `PolisGo.Infrastructure/Persistence/Configurations`. No data
  annotations on domain entities (keeps Domain free of EF dependencies).
- **Money is `decimal(18,2)`**, currency is **AZN** (Azerbaijani manat).
- **Primary keys are `Guid`**.
- **Enums stored as strings** in the database for readability in SQL tools.

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
- Command pattern:
  `dotnet ef migrations add <Name> -p src/PolisGo.Infrastructure -s src/PolisGo.Api`

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
