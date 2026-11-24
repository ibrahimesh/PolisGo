using PolisGo.Application.Diagnostics;

namespace PolisGo.Tests.Diagnostics;

// Realistic leaks, as exceptions actually phrase them. The assertions check
// both sides: the secret is gone and the useful part of the text stays.
public class RedactionTests
{
    private const string Jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJsZXlsYUBwb2xpc2dvLmF6In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    [Fact]
    public void A_message_with_an_email_and_a_token_keeps_neither()
    {
        var text = Redaction.Message(
            $"Could not refresh the session for leyla.mammadova@polisgo.az with token {Jwt} (Authorization: Bearer {Jwt})");

        Assert.DoesNotContain("leyla.mammadova", text);
        Assert.DoesNotContain("@polisgo.az", text);
        Assert.DoesNotContain("eyJ", text);
        Assert.Contains("Could not refresh the session for [email]", text);
        Assert.Contains("[redacted]", text);
    }

    [Fact]
    public void A_sql_error_quoting_its_connection_string_loses_it()
    {
        var text = Redaction.Message(
            "A network-related error occurred while connecting to 'Server=sqlserver,1433;Database=PolisGo;User Id=sa;Password=Sup3r-Secret!;TrustServerCertificate=True;Encrypt=False'. Login failed for user 'sa'.");

        Assert.DoesNotContain("Sup3r-Secret", text);
        Assert.DoesNotContain("User Id=sa", text);
        Assert.Contains("[connection string]", text);
        Assert.Contains("A network-related error occurred", text);
    }

    [Theory]
    [InlineData("password=hunter2&next=/app", "hunter2")]
    [InlineData("{\"email\":\"a@b.az\",\"password\":\"Qwerty-123\"}", "Qwerty-123")]
    [InlineData("api_key: sk_live_51Habc", "sk_live_51Habc")]
    [InlineData("client_secret='s3cr3t-value'", "s3cr3t-value")]
    [InlineData("Set-Cookie: session=abcdef0123456789", "abcdef0123456789")]
    public void Secret_pairs_keep_their_name_and_lose_their_value(string input, string secret)
    {
        var text = Redaction.Scrub(input);
        Assert.DoesNotContain(secret, text);
        Assert.Contains("[redacted]", text);
    }

    [Fact]
    public void Urls_lose_their_query_fragment_and_credentials()
    {
        var text = Redaction.Scrub(
            "GET https://admin:pa55@api.polisgo.az/api/claims/7?access=xyz123&page=2#top failed; then /api/me?token=abc");

        Assert.Contains("https://api.polisgo.az/api/claims/7", text);
        Assert.DoesNotContain("pa55", text);
        Assert.DoesNotContain("xyz123", text);
        Assert.DoesNotContain("token=abc", text);
        Assert.Contains("/api/me", text);
    }

    [Theory]
    [InlineData("Card 4111 1111 1111 1111 declined", "4111")]
    [InlineData("Card 4111-1111-1111-1111 declined", "4111")]
    [InlineData("Call +994501234567 back", "994501234567")]
    [InlineData("Account 1234567890123 locked", "1234567890123")]
    public void Long_digit_runs_are_removed(string input, string leaked)
    {
        var text = Redaction.Scrub(input);
        Assert.DoesNotContain(leaked, text);
        Assert.Contains("[number]", text);
    }

    [Fact]
    public void Ids_times_and_short_numbers_stay_readable()
    {
        const string text = "Claim 3f2a9e1c-0000-4000-8000-000000000001 failed at 12:30:45 after 3 tries (HTTP 500)";
        Assert.Equal(text, Redaction.Scrub(text));
    }

    [Theory]
    [InlineData("from 192.168.10.24 port 5000", "192.168.10.24")]
    [InlineData("from 2001:db8:85a3::8a2e:370:7334 refused", "2001:db8")]
    [InlineData("connect to ::1 failed", "::1")]
    public void Ip_addresses_are_removed(string input, string leaked)
    {
        var text = Redaction.Scrub(input);
        Assert.DoesNotContain(leaked, text);
        Assert.Contains("[ip]", text);
    }

    [Fact]
    public void Stacks_keep_frames_and_file_names_but_not_machine_paths()
    {
        var stack = Redaction.Stack("""
            System.InvalidOperationException: Payment for leyla@polisgo.az failed
               at PolisGo.Application.Policies.PolicyService.PayAsync(Guid id) in /src/src/PolisGo.Application/Policies/PolicyService.cs:line 270
               at PolisGo.Api.Controllers.PoliciesController.Pay(Guid id) in C:\Users\ibrahim\source\repos\PolisGo\src\PolisGo.Api\Controllers\PoliciesController.cs:line 190
            """);

        Assert.NotNull(stack);
        Assert.Contains("PolisGo.Application.Policies.PolicyService.PayAsync", stack);
        Assert.Contains("PolicyService.cs:line 270", stack);
        Assert.Contains("PoliciesController.cs:line 190", stack);
        Assert.DoesNotContain("/src/src", stack);
        Assert.DoesNotContain(@"C:\Users", stack);
        Assert.DoesNotContain("ibrahim", stack);
        Assert.DoesNotContain("leyla@", stack);
    }

    [Fact]
    public void Long_text_is_cut_to_the_column()
    {
        Assert.Equal(Redaction.MessageMaxLength, Redaction.Message(new string('x', 5000)).Length);
        Assert.Equal(Redaction.StackMaxLength, Redaction.Stack(new string('y', 20000))!.Length);
        Assert.Null(Redaction.Stack("  "));
        Assert.Equal("", Redaction.Message(null));
    }

    [Theory]
    [InlineData("8F05E497", "8F05E497", null)]
    [InlineData("8f05-e497", "8F05E497", null)]
    [InlineData(" 8F05 E497 ", "8F05E497", null)]
    [InlineData("00-8f05e497f602ed095d0149881a2e0468-ce9bed5f785d5dd5-01", "8F05E497", "8f05e497f602ed095d0149881a2e0468")]
    [InlineData("8F05E497F602ED095D0149881A2E0468", "8F05E497", "8f05e497f602ed095d0149881a2e0468")]
    [InlineData("not a ref", null, null)]
    [InlineData("8F05E49Z", null, null)]
    public void References_parse_with_or_without_separators(string input, string? code, string? traceId) =>
        Assert.Equal((code, traceId), ErrorReference.Parse(input));

    [Theory]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Chrome")]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "Safari (mobile)")]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0", "Edge")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0", "Firefox")]
    [InlineData("curl/8.5.0", "curl")]
    [InlineData(null, null)]
    public void Browser_families_not_user_agents(string? ua, string? family) =>
        Assert.Equal(family, UserAgentFamily.Of(ua));
}
