using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Auth;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

public class MeEndpointTests : IClassFixture<ApiFactory>
{
    private const string Password = "Secret123";
    private readonly ApiFactory _factory;

    public MeEndpointTests(ApiFactory factory) => _factory = factory;

    // A real registration, so the password hash is real and the token carries
    // the linked customer id exactly as in production.
    private async Task<(HttpClient Client, string Email)> RegisterClientAsync()
    {
        var email = $"me.{Guid.NewGuid():N}@polisgo.test";
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = Password,
            fullName = "Leyla Məmmədova",
            phone = "+994501234567",
            birthDate = "1990-05-01",
            drivingLicenseDate = "2010-06-01"
        });
        response.EnsureSuccessStatusCode();
        var token = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (client, email);
    }

    private static async Task<JsonElement> ProblemErrors(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
        return problem.GetProperty("errors");
    }

    [Fact]
    public async Task Anonymous_gets_401_on_every_action()
    {
        var client = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PutAsJsonAsync("/api/me", new { fullName = "A B", phone = "+994501234567" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/me/change-password", new { currentPassword = "x", newPassword = "y" })).StatusCode);
    }

    [Fact]
    public async Task Client_reads_their_own_profile_with_customer_fields()
    {
        var (client, email) = await RegisterClientAsync();

        var profile = await client.GetFromJsonAsync<JsonElement>("/api/me");

        Assert.Equal(email, profile.GetProperty("email").GetString());
        Assert.Equal("Client", profile.GetProperty("role").GetString());
        Assert.Equal("+994501234567", profile.GetProperty("phone").GetString());
        Assert.Equal("1990-05-01", profile.GetProperty("birthDate").GetString());
        Assert.Equal("2010-06-01", profile.GetProperty("drivingLicenseDate").GetString());
    }

    [Fact]
    public async Task Staff_profile_has_no_customer_fields()
    {
        var profile = await _factory.ClientAs(UserRole.Agent).GetFromJsonAsync<JsonElement>("/api/me");

        Assert.Equal("Agent", profile.GetProperty("role").GetString());
        Assert.Equal(JsonValueKind.Null, profile.GetProperty("phone").ValueKind);
    }

    [Fact]
    public async Task Update_normalises_the_phone_and_renames_user_and_customer()
    {
        var (client, email) = await RegisterClientAsync();

        var response = await client.PutAsJsonAsync("/api/me", new { fullName = "  Nigar Əliyeva ", phone = "055 987 65 43" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Nigar Əliyeva", body.GetProperty("fullName").GetString());
        Assert.Equal("+994559876543", body.GetProperty("phone").GetString());

        var (userName, customerName, phone) = _factory.WithDb(db =>
        {
            var user = db.Users.AsNoTracking().Single(u => u.Email == email);
            var customer = db.Customers.AsNoTracking().Single(c => c.UserId == user.Id);
            return (user.FullName, customer.FullName, customer.Phone);
        });
        Assert.Equal("Nigar Əliyeva", userName);
        Assert.Equal("Nigar Əliyeva", customerName);
        Assert.Equal("+994559876543", phone);
    }

    [Fact]
    public async Task Update_with_invalid_fields_reports_each_with_the_registration_messages()
    {
        var (client, _) = await RegisterClientAsync();

        var errors = await ProblemErrors(await client.PutAsJsonAsync("/api/me", new { fullName = "x1", phone = "123" }));

        Assert.Equal(AuthValidation.Messages.FullNameInvalid, errors.GetProperty("FullName")[0].GetString());
        Assert.Equal(AuthValidation.Messages.PhoneInvalid, errors.GetProperty("Phone")[0].GetString());
    }

    [Fact]
    public async Task Client_must_keep_a_phone()
    {
        var (client, _) = await RegisterClientAsync();

        var errors = await ProblemErrors(await client.PutAsJsonAsync("/api/me", new { fullName = "Nigar Əliyeva", phone = "" }));

        Assert.Equal(AuthValidation.Messages.PhoneRequired, errors.GetProperty("Phone")[0].GetString());
    }

    [Fact]
    public async Task Staff_cannot_set_a_phone()
    {
        var errors = await ProblemErrors(await _factory.ClientAs(UserRole.Admin)
            .PutAsJsonAsync("/api/me", new { fullName = "Admin Person", phone = "+994501234567" }));

        Assert.Equal(AuthValidation.Messages.PhoneNotApplicable, errors.GetProperty("Phone")[0].GetString());
    }

    [Fact]
    public async Task Change_password_then_sign_in_with_the_new_one()
    {
        var (client, email) = await RegisterClientAsync();

        var response = await client.PostAsJsonAsync("/api/me/change-password",
            new { currentPassword = Password, newPassword = "Better456x" });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsJsonAsync("/api/auth/login", new { email, password = Password })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await anonymous.PostAsJsonAsync("/api/auth/login", new { email, password = "Better456x" })).StatusCode);
    }

    [Fact]
    public async Task Wrong_current_password_is_a_400_field_error_not_a_401()
    {
        var (client, _) = await RegisterClientAsync();

        var errors = await ProblemErrors(await client.PostAsJsonAsync("/api/me/change-password",
            new { currentPassword = "Nope12345", newPassword = "Better456x" }));

        Assert.Equal(AuthValidation.Messages.CurrentPasswordIncorrect, errors.GetProperty("CurrentPassword")[0].GetString());
    }

    [Fact]
    public async Task New_password_follows_the_policy_and_must_change()
    {
        var (client, _) = await RegisterClientAsync();

        var weak = await ProblemErrors(await client.PostAsJsonAsync("/api/me/change-password",
            new { currentPassword = Password, newPassword = "short" }));
        Assert.Equal(AuthValidation.Messages.PasswordPolicy, weak.GetProperty("NewPassword")[0].GetString());

        var same = await ProblemErrors(await client.PostAsJsonAsync("/api/me/change-password",
            new { currentPassword = Password, newPassword = Password }));
        Assert.Equal(AuthValidation.Messages.PasswordUnchanged, same.GetProperty("NewPassword")[0].GetString());
    }
}
