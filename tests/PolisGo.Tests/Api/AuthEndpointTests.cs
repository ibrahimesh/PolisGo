using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Auth;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

public class AuthEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AuthEndpointTests(ApiFactory factory) => _factory = factory;

    private static object Register(string email, string phone = "+994 50 123 45 67", string password = "Secret123",
        string fullName = "Leyla Məmmədova", string birthDate = "1990-05-01", string licence = "2010-06-01") => new
    {
        email,
        password,
        fullName,
        phone,
        birthDate,
        drivingLicenseDate = licence
    };

    [Fact]
    public async Task Register_with_invalid_fields_is_a_400_problem_with_errors_per_field()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register",
            Register("user@polisgo", phone: "1", password: "password1", fullName: "x", birthDate: "2015-01-01"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var errors = problem.RootElement.GetProperty("errors");
        Assert.Equal(AuthValidation.Messages.EmailInvalid, errors.GetProperty("Email")[0].GetString());
        Assert.Equal(AuthValidation.Messages.PhoneInvalid, errors.GetProperty("Phone")[0].GetString());
        Assert.Equal(AuthValidation.Messages.PasswordPolicy, errors.GetProperty("Password")[0].GetString());
        Assert.Equal(AuthValidation.Messages.FullNameInvalid, errors.GetProperty("FullName")[0].GetString());
        Assert.Equal(AuthValidation.Messages.Underage, errors.GetProperty("BirthDate")[0].GetString());
        Assert.False(string.IsNullOrEmpty(problem.RootElement.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task Register_normalises_the_phone_and_signs_the_user_in()
    {
        var email = $"api.{Guid.NewGuid():N}@polisgo.test";
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register",
            Register(email, phone: "050 123 45 67"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var stored = _factory.WithDb(db => db.Customers.AsNoTracking().Single(c => c.Email == email).Phone);
        Assert.Equal("+994501234567", stored);
    }

    [Fact]
    public async Task Staff_creation_rejects_a_weak_password_with_a_field_error()
    {
        var response = await _factory.ClientAs(UserRole.Admin).PostAsJsonAsync("/api/users/staff", new
        {
            email = $"agent.{Guid.NewGuid():N}@polisgo.test",
            password = "weakpass1",
            fullName = "New Agent",
            role = "Agent"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(AuthValidation.Messages.PasswordPolicy,
            problem.RootElement.GetProperty("errors").GetProperty("Password")[0].GetString());
    }
}
