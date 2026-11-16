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
