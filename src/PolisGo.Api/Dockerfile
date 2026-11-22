# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:bef136a371963aaa46ec97882845ef6f54dec15728bb4b128b1c2a400ffbc9b4 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

# Copy solution + csproj files FIRST so the restore layer is cache-friendly:
# changing source files won't invalidate the restored NuGet cache below.
COPY PolisGo.slnx ./
COPY src/PolisGo.Domain/PolisGo.Domain.csproj src/PolisGo.Domain/
COPY src/PolisGo.Application/PolisGo.Application.csproj src/PolisGo.Application/
COPY src/PolisGo.Infrastructure/PolisGo.Infrastructure.csproj src/PolisGo.Infrastructure/
COPY src/PolisGo.Api/PolisGo.Api.csproj src/PolisGo.Api/

RUN dotnet restore src/PolisGo.Api/PolisGo.Api.csproj

# Copy only the source we actually need for publishing the API (keeps the
# layer smaller than a blind COPY . .).
COPY src/ src/

RUN dotnet publish src/PolisGo.Api/PolisGo.Api.csproj \
    -c ${BUILD_CONFIGURATION} \
    --no-restore \
    -o /app/publish

# ---- Runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:12b1135f5f8b3c0a214f2a680ff2033dff4f684f445d6c697d9524ceeb303586 AS runtime
WORKDIR /app

# curl so compose/kubelet can invoke a simple healthcheck against /health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

# The aspnet image ships a non-root `app` user; ensure the upload directory
# exists and is owned by it before dropping privileges.
RUN mkdir -p /app/App_Data/claim-documents \
    && chown -R app:app /app

USER app

# HTTP only inside the container — the reverse proxy / ingress handles TLS.
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_gcServer=1

EXPOSE 8080

# No secrets are baked in — connection strings, JWT key, admin seed
# credentials are all supplied via environment at runtime.

ENTRYPOINT ["dotnet", "PolisGo.Api.dll"]
