using System.Text.Json;
using PolisGo.Api;
using PolisGo.Application.Auth.Dtos;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Domain.Enums;
using Xunit;

namespace PolisGo.Tests.Api;

public class JsonConfigurationTests
{
    private static JsonSerializerOptions Options()
    {
        // Use the exact same configuration the API wires into MVC — no divergence
        // between what controllers accept and what these tests verify.
        var options = new JsonSerializerOptions();
        JsonConfiguration.Configure(options);
        return options;
    }

    [Fact]
    public void Serialize_PolicyResponse_UsesEnumName()
    {
        var policy = new PolicyResponse(
            Id: Guid.NewGuid(),
            PolicyNumber: "PG-2026-ABCDEFGH",
            CustomerId: Guid.NewGuid(),
            VehicleId: Guid.NewGuid(),
            PolicyTypeId: Guid.NewGuid(),
            PolicyTypeCode: "MTPL",
            AgentId: null,
            StartDate: new DateOnly(2026, 1, 1),
            EndDate: new DateOnly(2026, 12, 31),
            Premium: 100.00m,
            Currency: "AZN",
            Status: PolicyStatus.Draft,
            CreatedAt: DateTime.UtcNow);

        var json = JsonSerializer.Serialize(policy, Options());

        // "Draft" by name, not 0 — matches how the DB persists the enum.
        Assert.Contains("\"Draft\"", json);
        Assert.DoesNotContain("\"status\":0", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Deserialize_RoleAsName_IsAccepted()
    {
        const string body = """
            {
              "email": "staff@example.com",
              "password": "Secret1234",
              "fullName": "Staff Account",
              "role": "Adjuster"
            }
            """;

        var request = JsonSerializer.Deserialize<CreateStaffUserRequest>(body, Options());

        Assert.NotNull(request);
        Assert.Equal(UserRole.Adjuster, request!.Role);
    }

    [Fact]
    public void Deserialize_RoleAsName_IsCaseInsensitive()
    {
        const string body = """
            {
              "email": "staff@example.com",
              "password": "Secret1234",
              "fullName": "Staff Account",
              "role": "adjuster"
            }
            """;

        var request = JsonSerializer.Deserialize<CreateStaffUserRequest>(body, Options());

        Assert.Equal(UserRole.Adjuster, request!.Role);
    }

    [Fact]
    public void Deserialize_RoleAsInteger_IsRejected()
    {
        const string body = """
            {
              "email": "staff@example.com",
              "password": "Secret1234",
              "fullName": "Staff Account",
              "role": 2
            }
            """;

        // JsonException maps to HTTP 400 through ASP.NET's model binder — the
        // controller never sees a request with an integer role, so no runtime
        // guard needs to repeat this check downstream.
        Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<CreateStaffUserRequest>(body, Options()));
    }

    [Fact]
    public void Deserialize_UnknownRoleName_IsRejected()
    {
        const string body = """
            {
              "email": "staff@example.com",
              "password": "Secret1234",
              "fullName": "Staff Account",
              "role": "Overlord"
            }
            """;

        Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<CreateStaffUserRequest>(body, Options()));
    }
}
