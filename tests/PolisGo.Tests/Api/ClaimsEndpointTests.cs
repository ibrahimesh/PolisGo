using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using PolisGo.Application.Claims;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

public class ClaimsEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public ClaimsEndpointTests(ApiFactory factory) => _factory = factory;

    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13];
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46];
    private static readonly byte[] Pdf = Encoding.ASCII.GetBytes("%PDF-1.4\n%test\n");
    private static readonly byte[] Exe = [0x4D, 0x5A, 0x90, 0, 3, 0, 0, 0];

    private static string Day(int offset) =>
        TestDates.Today.AddDays(offset).ToString("yyyy-MM-dd");

    private sealed record Seeded(HttpClient Client, Customer Customer, Policy Policy);

    // A signed-in Client with an Active policy that started a month ago.
    private Seeded ClientWithPolicy(DateTime? policyCreatedAt = null)
    {
        var client = _factory.ClientAs(UserRole.Client, out var customerId);
        var (customer, policy) = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var customer = db.Customers.Single(c => c.Id == customerId);
            var policy = data.Policy(customer, data.Vehicle(customer.Id),
                createdAt: policyCreatedAt ?? DateTime.UtcNow.AddMonths(-1));
            return (customer, policy);
        });
        return new Seeded(client, customer, policy);
    }

    private static object Submission(Guid policyId, decimal amount = 850m, string? incidentType = "Collision",
        string? location = "Baku, Nizami street 10", string description = "Rear bumper hit while parked.",
        string? date = null) => new
    {
        policyId,
        incidentDate = date ?? Day(-2),
        incidentType,
        location,
        description,
        claimedAmount = amount
    };

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        await response.Content.LoadIntoBufferAsync();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static async Task<JsonElement> AssertProblem(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await Json(response);
        Assert.Equal((int)status, problem.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
        return problem;
    }

    private static async Task AssertFieldError(HttpResponseMessage response, string field, string message)
    {
        var problem = await AssertProblem(response, HttpStatusCode.BadRequest);
        Assert.Equal(message, problem.GetProperty("errors").GetProperty(field)[0].GetString());
    }

    private static async Task<Guid> Submit(Seeded s, decimal amount = 850m)
    {
        var response = await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id, amount));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await Json(response)).GetProperty("id").GetGuid();
    }

    private static Task<HttpResponseMessage> Upload(HttpClient client, Guid claimId, string fileName, byte[] bytes, string contentType = "application/octet-stream")
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", fileName);
        return client.PostAsync($"/api/claims/{claimId}/documents", form);
    }

    // A claim on someone else's policy, with one stored document.
    private async Task<(Guid ClaimId, Guid DocumentId)> ForeignClaimWithDocument()
    {
        var owner = ClientWithPolicy();
        var claimId = await Submit(owner);
        var upload = await Upload(owner.Client, claimId, "photo.png", Png, "image/png");
        Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
        return (claimId, (await Json(upload)).GetProperty("id").GetGuid());
    }

    // ---------- 401 / 403 ----------

    [Fact]
    public async Task Anonymous_gets_401_on_every_action()
    {
        var client = _factory.CreateClient();
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/claims")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/claims/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/claims/{id}/history")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/claims/{id}/documents/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/claims", Submission(id))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync($"/api/claims/{id}/withdraw", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(client, id, "a.png", Png)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/me/claim-updates")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync($"/api/me/claim-updates/{id}/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/me/claim-updates/read-all", null)).StatusCode);
    }

    [Fact]
    public async Task Adjuster_gets_403_on_submit_and_withdraw()
    {
        var client = _factory.ClientAs(UserRole.Adjuster);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/claims", Submission(id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/claims/{id}/withdraw", new { })).StatusCode);
    }

    [Fact]
    public async Task Client_gets_403_on_adjuster_actions()
    {
        var client = _factory.ClientAs(UserRole.Client);
        var id = Guid.NewGuid();
        foreach (var action in new[] { "review", "approve", "reject", "pay" })
        {
            var response = await client.PostAsJsonAsync($"/api/claims/{id}/{action}",
                new { comment = "x", approvedAmount = 1 });
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
    }

    [Theory]
    [InlineData(UserRole.Agent)]
    [InlineData(UserRole.Adjuster)]
    [InlineData(UserRole.Admin)]
    public async Task Staff_get_403_on_claim_updates(UserRole role)
    {
        var client = _factory.ClientAs(role);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/me/claim-updates")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/me/claim-updates/read-all", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsync($"/api/me/claim-updates/{Guid.NewGuid()}/read", null)).StatusCode);
    }

    // ---------- Submit and read ----------

    [Fact]
    public async Task Client_files_a_claim_and_reads_it_back()
    {
        var s = ClientWithPolicy();
        var response = await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id, 1234.5m));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await Json(response);
        Assert.Equal("Submitted", created.GetProperty("status").GetString());
        Assert.Equal("Collision", created.GetProperty("incidentType").GetString());
        Assert.Equal("MTPL", created.GetProperty("policyTypeCode").GetString());
        var id = created.GetProperty("id").GetGuid();

        var detail = await Json(await s.Client.GetAsync($"/api/claims/{id}"));
        Assert.Equal("Baku, Nizami street 10", detail.GetProperty("claim").GetProperty("location").GetString());
        Assert.Equal(1234.5m, detail.GetProperty("claim").GetProperty("claimedAmount").GetDecimal());
        Assert.Equal(s.Policy.PolicyNumber, detail.GetProperty("policy").GetProperty("policyNumber").GetString());
        Assert.False(string.IsNullOrEmpty(detail.GetProperty("policy").GetProperty("vehicle").GetProperty("plateNumber").GetString()));
        Assert.True(detail.GetProperty("canWithdraw").GetBoolean());
        Assert.True(detail.GetProperty("canAddDocuments").GetBoolean());
        Assert.Equal(10, detail.GetProperty("maxDocuments").GetInt32());

        var first = detail.GetProperty("history")[0];
        Assert.Equal("Submitted", first.GetProperty("toStatus").GetString());
        Assert.Equal("Client", first.GetProperty("changedByRole").GetString());
        Assert.Equal(s.Customer.FullName, first.GetProperty("changedByName").GetString());

        var history = await Json(await s.Client.GetAsync($"/api/claims/{id}/history"));
        Assert.Equal(1, history.GetArrayLength());
    }

    [Fact]
    public async Task Submit_reports_each_invalid_field()
    {
        var s = ClientWithPolicy();
        var response = await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id,
            amount: 100.555m, incidentType: null, location: "  ", description: "short",
            date: Day(-60)));
        var problem = await AssertProblem(response, HttpStatusCode.BadRequest);
        var errors = problem.GetProperty("errors");
        Assert.Equal(ClaimValidation.Messages.IncidentTypeRequired, errors.GetProperty("IncidentType")[0].GetString());
        Assert.Equal(ClaimValidation.Messages.LocationLength, errors.GetProperty("Location")[0].GetString());
        Assert.Equal(ClaimValidation.Messages.DescriptionLength, errors.GetProperty("Description")[0].GetString());
        Assert.Equal(ClaimValidation.Messages.AmountPrecision, errors.GetProperty("ClaimedAmount")[0].GetString());
        Assert.Equal(ClaimValidation.Messages.IncidentDateOutsideCover, errors.GetProperty("IncidentDate")[0].GetString());
    }

    [Fact]
    public async Task Submit_rejects_future_dates_too_long_text_and_amounts_over_the_limit()
    {
        var s = ClientWithPolicy();
        await AssertFieldError(await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id, date: Day(1))),
            "IncidentDate", ClaimValidation.Messages.IncidentDateInFuture);
        await AssertFieldError(await s.Client.PostAsJsonAsync("/api/claims",
                Submission(s.Policy.Id, location: new string('L', ClaimValidation.MaxLocationLength + 1))),
            "Location", ClaimValidation.Messages.LocationLength);
        await AssertFieldError(await s.Client.PostAsJsonAsync("/api/claims",
                Submission(s.Policy.Id, description: new string('D', ClaimValidation.MaxDescriptionLength + 1))),
            "Description", ClaimValidation.Messages.DescriptionLength);
        await AssertFieldError(await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id, amount: 50_000.01m)),
            "ClaimedAmount", ClaimValidation.Messages.AmountTooHigh);
        await AssertFieldError(await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id, amount: 0m)),
            "ClaimedAmount", ClaimValidation.Messages.AmountNotPositive);

        // The longest accepted values are stored as given.
        var longest = await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id, amount: 50_000m,
            location: new string('L', ClaimValidation.MaxLocationLength),
            description: new string('D', ClaimValidation.MaxDescriptionLength)));
        Assert.Equal(HttpStatusCode.Created, longest.StatusCode);
    }

    [Fact]
    public async Task Submit_rejects_an_unknown_incident_type_as_a_400()
    {
        var s = ClientWithPolicy();
        var response = await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id, incidentType: "Meteor"));
        await AssertProblem(response, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task An_expired_policy_cannot_take_a_claim()
    {
        // Stored Active, but its end date passed: it reads as Expired.
        var s = ClientWithPolicy(DateTime.UtcNow.AddYears(-2));
        var response = await s.Client.PostAsJsonAsync("/api/claims",
            Submission(s.Policy.Id, date: s.Policy.StartDate.AddDays(10).ToString("yyyy-MM-dd")));
        await AssertFieldError(response, "PolicyId", ClaimValidation.Messages.PolicyNotActive);
    }

    [Fact]
    public async Task A_duplicate_claim_is_a_409_but_a_withdrawn_one_does_not_block()
    {
        var s = ClientWithPolicy();
        var first = await Submit(s, 640m);
        await AssertProblem(await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id, 640m)), HttpStatusCode.Conflict);

        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/claims/{first}/withdraw", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await s.Client.PostAsJsonAsync("/api/claims", Submission(s.Policy.Id, 640m))).StatusCode);
    }

    [Fact]
    public async Task A_client_cannot_file_on_another_clients_policy()
    {
        var other = ClientWithPolicy();
        var me = _factory.ClientAs(UserRole.Client);
        await AssertProblem(await me.PostAsJsonAsync("/api/claims", Submission(other.Policy.Id)), HttpStatusCode.NotFound);
    }

    // ---------- Another client's claim: always the same 404 ----------

    [Fact]
    public async Task Another_clients_claim_is_404_on_every_route_like_a_missing_one()
    {
        var (claimId, documentId) = await ForeignClaimWithDocument();
        var me = _factory.ClientAs(UserRole.Client);

        foreach (var id in new[] { claimId, Guid.NewGuid() })
        {
            await AssertProblem(await me.GetAsync($"/api/claims/{id}"), HttpStatusCode.NotFound);
            await AssertProblem(await me.GetAsync($"/api/claims/{id}/history"), HttpStatusCode.NotFound);
            await AssertProblem(await me.GetAsync($"/api/claims/{id}/documents/{documentId}"), HttpStatusCode.NotFound);
            await AssertProblem(await Upload(me, id, "mine.png", Png, "image/png"), HttpStatusCode.NotFound);
            await AssertProblem(await me.PostAsJsonAsync($"/api/claims/{id}/withdraw", new { }), HttpStatusCode.NotFound);
            await AssertProblem(await me.PostAsync($"/api/me/claim-updates/{id}/read", null), HttpStatusCode.NotFound);
        }

        // Nothing changed on the owner's claim.
        var stillOpen = _factory.WithDb(db => db.Claims.Single(c => c.Id == claimId));
        Assert.Equal(ClaimStatus.Submitted, stillOpen.Status);
        Assert.Equal(1, _factory.WithDb(db => db.ClaimDocuments.Count(d => d.ClaimId == claimId)));

        var list = await Json(await me.GetAsync("/api/claims"));
        Assert.Equal(0, list.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task A_document_id_from_another_claim_is_404()
    {
        var (_, foreignDocument) = await ForeignClaimWithDocument();
        var s = ClientWithPolicy();
        var mine = await Submit(s);
        await AssertProblem(await s.Client.GetAsync($"/api/claims/{mine}/documents/{foreignDocument}"), HttpStatusCode.NotFound);
    }

    // ---------- Withdraw ----------

    [Fact]
    public async Task Withdraw_closes_the_claim_once_and_keeps_the_reason()
    {
        var s = ClientWithPolicy();
        var id = await Submit(s);

        var response = await s.Client.PostAsJsonAsync($"/api/claims/{id}/withdraw", new { reason = "Settled privately." });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Withdrawn", (await Json(response)).GetProperty("status").GetString());

        var detail = await Json(await s.Client.GetAsync($"/api/claims/{id}"));
        Assert.False(detail.GetProperty("canWithdraw").GetBoolean());
        Assert.False(detail.GetProperty("canAddDocuments").GetBoolean());
        var last = detail.GetProperty("history")[1];
        Assert.Equal("Withdrawn", last.GetProperty("toStatus").GetString());
        Assert.Equal("Settled privately.", last.GetProperty("comment").GetString());

        await AssertProblem(await s.Client.PostAsJsonAsync($"/api/claims/{id}/withdraw", new { }), HttpStatusCode.Conflict);
        var upload = await AssertProblem(await Upload(s.Client, id, "late.png", Png, "image/png"), HttpStatusCode.Conflict);
        Assert.Equal(ClaimValidation.Messages.ClaimClosed, upload.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Withdraw_works_under_review_but_not_after_a_decision()
    {
        var s = ClientWithPolicy();
        var reviewed = await Submit(s, 300m);
        var decided = await Submit(s, 301m);
        var adjuster = _factory.ClientAs(UserRole.Adjuster);
        Assert.Equal(HttpStatusCode.OK, (await adjuster.PostAsJsonAsync($"/api/claims/{reviewed}/review", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await adjuster.PostAsJsonAsync($"/api/claims/{decided}/review", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await adjuster.PostAsJsonAsync($"/api/claims/{decided}/reject",
            new { comment = "Not covered by MTPL." })).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/claims/{reviewed}/withdraw", new { })).StatusCode);
        await AssertProblem(await s.Client.PostAsJsonAsync($"/api/claims/{decided}/withdraw", new { }), HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Withdraw_reason_is_limited()
    {
        var s = ClientWithPolicy();
        var id = await Submit(s);
        await AssertFieldError(
            await s.Client.PostAsJsonAsync($"/api/claims/{id}/withdraw", new { reason = new string('r', 501) }),
            "Reason", ClaimValidation.Messages.ReasonTooLong);
    }

    [Fact]
    public async Task Staff_comments_longer_than_the_column_are_a_400_not_a_500()
    {
        var s = ClientWithPolicy();
        var id = await Submit(s);
        var adjuster = _factory.ClientAs(UserRole.Adjuster);
        await AssertFieldError(
            await adjuster.PostAsJsonAsync($"/api/claims/{id}/review", new { comment = new string('c', 1001) }),
            "comment", ClaimValidation.Messages.CommentTooLong);
    }

    // ---------- Documents ----------

    [Fact]
    public async Task Uploaded_documents_are_listed_and_download_with_their_type()
    {
        var s = ClientWithPolicy();
        var id = await Submit(s);
        Assert.Equal(HttpStatusCode.Created, (await Upload(s.Client, id, "front.jpg", Jpeg, "image/jpeg")).StatusCode);
        var pdf = await Upload(s.Client, id, "estimate.pdf", Pdf, "application/pdf");
        Assert.Equal(HttpStatusCode.Created, pdf.StatusCode);
        var pdfId = (await Json(pdf)).GetProperty("id").GetGuid();

        var documents = (await Json(await s.Client.GetAsync($"/api/claims/{id}"))).GetProperty("documents");
        Assert.Equal(2, documents.GetArrayLength());
        Assert.Equal("image/jpeg", documents[0].GetProperty("contentType").GetString());

        var download = await s.Client.GetAsync($"/api/claims/{id}/documents/{pdfId}");
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal("application/pdf", download.Content.Headers.ContentType?.MediaType);
        Assert.Equal(Pdf, await download.Content.ReadAsByteArrayAsync());
    }

    [Theory]
    [InlineData("photo.gif", "png", "FileType")]
    [InlineData("photo.png", "pdf", "FileContentMismatch")]
    [InlineData("invoice.pdf", "exe", "FileContentMismatch")]
    [InlineData("setup.exe", "exe", "FileType")]
    [InlineData("photo.jpg", "png", "FileContentMismatch")]
    public async Task Uploads_are_checked_by_extension_and_content(string fileName, string content, string messageName)
    {
        var bytes = content switch { "png" => Png, "pdf" => Pdf, _ => Exe };
        var s = ClientWithPolicy();
        var id = await Submit(s);
        var expected = (string)typeof(ClaimValidation.Messages).GetField(messageName)!.GetValue(null)!;
        // The declared content type is the browser's guess; it must not matter.
        await AssertFieldError(await Upload(s.Client, id, fileName, bytes, "image/png"), "file", expected);
    }

    [Theory]
    [InlineData("../../etc/evil.png", "evil.png")]
    [InlineData("..\\..\\windows\\evil.png", "evil.png")]
    [InlineData("C:\\Users\\me\\Desktop\\crash photo.png", "crash photo.png")]
    [InlineData("<script>.png", "script.png")]
    public async Task Path_segments_and_unsafe_characters_are_stripped_from_names(string sent, string stored)
    {
        var s = ClientWithPolicy();
        var id = await Submit(s);
        var response = await Upload(s.Client, id, sent, Png, "image/png");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(stored, (await Json(response)).GetProperty("fileName").GetString());
    }

    [Fact]
    public async Task An_empty_or_missing_file_is_a_400_on_file()
    {
        var s = ClientWithPolicy();
        var id = await Submit(s);
        await AssertFieldError(await Upload(s.Client, id, "empty.png", []), "file", ClaimValidation.Messages.FileRequired);
        var noFile = await s.Client.PostAsync($"/api/claims/{id}/documents",
            new MultipartFormDataContent { { new StringContent("x"), "note" } });
        Assert.Equal(HttpStatusCode.BadRequest, noFile.StatusCode);
    }

    [Fact]
    public async Task A_file_over_5_MB_is_a_400()
    {
        var s = ClientWithPolicy();
        var id = await Submit(s);
        var big = new byte[ClaimValidation.MaxFileSizeBytes + 1];
        Png.CopyTo(big, 0);
        await AssertFieldError(await Upload(s.Client, id, "big.png", big), "file", ClaimValidation.Messages.FileSize);
    }

    [Fact]
    public async Task The_eleventh_document_is_a_409()
    {
        var s = ClientWithPolicy();
        var id = await Submit(s);
        for (var i = 0; i < ClaimValidation.MaxDocumentsPerClaim; i++)
            Assert.Equal(HttpStatusCode.Created, (await Upload(s.Client, id, $"p{i}.png", Png)).StatusCode);

        var detail = await Json(await s.Client.GetAsync($"/api/claims/{id}"));
        Assert.False(detail.GetProperty("canAddDocuments").GetBoolean());
        var problem = await AssertProblem(await Upload(s.Client, id, "p10.png", Png), HttpStatusCode.Conflict);
        Assert.Equal(ClaimValidation.Messages.TooManyDocuments, problem.GetProperty("detail").GetString());
    }

    // ---------- List ----------

    [Fact]
    public async Task List_searches_filters_open_claims_and_sorts()
    {
        var s = ClientWithPolicy();
        var small = await Submit(s, 100m);
        var large = await Submit(s, 900m);
        var withdrawn = await Submit(s, 500m);
        await s.Client.PostAsJsonAsync($"/api/claims/{withdrawn}/withdraw", new { });

        var number = (await Json(await s.Client.GetAsync($"/api/claims/{large}"))).GetProperty("claim").GetProperty("claimNumber").GetString()!;
        var found = await Json(await s.Client.GetAsync($"/api/claims?search={number.ToLowerInvariant()}"));
        Assert.Equal(large, found.GetProperty("items")[0].GetProperty("id").GetGuid());
        Assert.Equal(1, found.GetProperty("totalCount").GetInt32());

        var open = await Json(await s.Client.GetAsync("/api/claims?open=true&sortBy=ClaimedAmount&sortDir=Asc"));
        Assert.Equal(2, open.GetProperty("totalCount").GetInt32());
        Assert.Equal(small, open.GetProperty("items")[0].GetProperty("id").GetGuid());

        var onlyWithdrawn = await Json(await s.Client.GetAsync("/api/claims?status=Withdrawn"));
        Assert.Equal(withdrawn, onlyWithdrawn.GetProperty("items")[0].GetProperty("id").GetGuid());
        Assert.True(onlyWithdrawn.GetProperty("items")[0].GetProperty("updatedAt").GetDateTime()
            >= onlyWithdrawn.GetProperty("items")[0].GetProperty("createdAt").GetDateTime());

        await AssertFieldError(await s.Client.GetAsync($"/api/claims?search={new string('x', 101)}"),
            "search", ClaimValidation.Messages.SearchTooLong);
        await AssertProblem(await s.Client.GetAsync("/api/claims?sortBy=Nope"), HttpStatusCode.BadRequest);
    }

    // ---------- Claim updates ----------

    [Fact]
    public async Task Staff_changes_become_unread_updates_until_marked_read()
    {
        var s = ClientWithPolicy();
        var id = await Submit(s);
        var own = await Submit(s, 222m);
        await s.Client.PostAsJsonAsync($"/api/claims/{own}/withdraw", new { });

        // The client's own steps are not notifications.
        Assert.Equal(0, (await Json(await s.Client.GetAsync("/api/me/claim-updates"))).GetArrayLength());

        var adjuster = _factory.ClientAs(UserRole.Adjuster);
        await adjuster.PostAsJsonAsync($"/api/claims/{id}/review", new { comment = "Looking at the photos." });

        var updates = await Json(await s.Client.GetAsync("/api/me/claim-updates"));
        Assert.Equal(1, updates.GetArrayLength());
        Assert.Equal("UnderReview", updates[0].GetProperty("toStatus").GetString());
        Assert.Equal("Looking at the photos.", updates[0].GetProperty("comment").GetString());
        Assert.Equal(JsonValueKind.Null, updates[0].GetProperty("readAt").ValueKind);
        Assert.Equal(1, (await Json(await s.Client.GetAsync("/api/me/overview"))).GetProperty("unreadClaimUpdates").GetInt32());

        Assert.Equal(HttpStatusCode.NoContent, (await s.Client.PostAsync($"/api/me/claim-updates/{id}/read", null)).StatusCode);
        updates = await Json(await s.Client.GetAsync("/api/me/claim-updates"));
        Assert.NotEqual(JsonValueKind.Null, updates[0].GetProperty("readAt").ValueKind);

        // A later decision is unread again.
        await adjuster.PostAsJsonAsync($"/api/claims/{id}/approve", new { approvedAmount = 800, comment = "Approved in full minus excess." });
        updates = await Json(await s.Client.GetAsync("/api/me/claim-updates"));
        Assert.Equal("Approved", updates[0].GetProperty("toStatus").GetString());
        Assert.Equal(JsonValueKind.Null, updates[0].GetProperty("readAt").ValueKind);

        Assert.Equal(HttpStatusCode.NoContent, (await s.Client.PostAsync("/api/me/claim-updates/read-all", null)).StatusCode);
        var overview = await Json(await s.Client.GetAsync("/api/me/overview"));
        Assert.Equal(0, overview.GetProperty("unreadClaimUpdates").GetInt32());
        // Approved and Withdrawn: neither is open.
        Assert.Equal(0, overview.GetProperty("openClaims").GetInt32());
        Assert.Equal("Approved", overview.GetProperty("latestClaimUpdate").GetProperty("toStatus").GetString());
    }

    [Fact]
    public async Task Overview_counts_open_claims()
    {
        var s = ClientWithPolicy();
        await Submit(s, 10m);
        var withdrawn = await Submit(s, 11m);
        await s.Client.PostAsJsonAsync($"/api/claims/{withdrawn}/withdraw", new { });

        var overview = await Json(await s.Client.GetAsync("/api/me/overview"));
        Assert.Equal(1, overview.GetProperty("openClaims").GetInt32());
        Assert.Equal("Withdrawn", overview.GetProperty("latestClaimUpdate").GetProperty("toStatus").GetString());
    }
}
