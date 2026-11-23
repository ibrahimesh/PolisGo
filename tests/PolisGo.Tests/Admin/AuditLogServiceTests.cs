using PolisGo.Application.Admin;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Admin;

public class AuditLogServiceTests
{
    // The filter's days are Baku days, as the SPA's "today" is: an event at
    // 21:00 UTC on 1 March happened on 2 March in Baku.
    [Fact]
    public async Task Day_filters_are_baku_days()
    {
        using var fixture = new SqliteTestDb();
        var admin = new TestData(fixture.Db).User(UserRole.Admin);
        fixture.Db.AuditEntries.Add(new AuditEntry
        {
            Id = Guid.NewGuid(), OccurredAt = new DateTime(2026, 3, 1, 21, 0, 0), ActorUserId = admin.Id,
            Action = AuditAction.StaffCreated, SubjectId = admin.Id, SubjectLabel = admin.Email
        });
        fixture.Db.SaveChanges();
        var sut = new AuditLogService(fixture.NewContext());

        var second = await sut.ListAsync(new AuditLogQuery(From: new DateOnly(2026, 3, 2), To: new DateOnly(2026, 3, 2)));
        var first = await sut.ListAsync(new AuditLogQuery(From: new DateOnly(2026, 3, 1), To: new DateOnly(2026, 3, 1)));

        Assert.Equal(1, second.TotalCount);
        Assert.Equal(0, first.TotalCount);
    }

    // Search reaches every source: a staff action's subject and values, a
    // policy's number and actor, and status/action codes (by name or sent
    // by the SPA from its translated labels). Case doesn't matter.
    [Fact]
    public async Task Search_matches_subjects_values_numbers_actors_and_codes()
    {
        using var fixture = new SqliteTestDb();
        var data = new TestData(fixture.Db);
        var admin = data.User(UserRole.Admin, email: "searching.admin@polisgo.test");
        var target = data.User(UserRole.Adjuster, email: "role.target@polisgo.test");
        fixture.Db.AuditEntries.Add(new AuditEntry
        {
            Id = Guid.NewGuid(), OccurredAt = new DateTime(2026, 3, 1, 9, 0, 0), ActorUserId = admin.Id,
            Action = AuditAction.RoleChanged, SubjectId = target.Id, SubjectLabel = target.Email,
            FromValue = "Agent", ToValue = "Adjuster"
        });
        var customer = data.Customer();
        var policy = data.Policy(customer, data.Vehicle(customer.Id));
        fixture.Db.PolicyStatusHistory.Add(new PolicyStatusHistory
        {
            Id = Guid.NewGuid(), PolicyId = policy.Id, FromStatus = PolicyStatus.Active,
            ToStatus = PolicyStatus.Cancelled, ChangedByUserId = admin.Id,
            ChangedAt = new DateTime(2026, 3, 2, 9, 0, 0)
        });
        fixture.Db.SaveChanges();
        var sut = new AuditLogService(fixture.NewContext());

        async Task<int> Count(string? search, params string[] actions) =>
            (await sut.ListAsync(new AuditLogQuery(Search: search, Actions: actions))).TotalCount;

        Assert.Equal(1, await Count("ROLE.target@"));
        Assert.Equal(1, await Count("adjuster"));
        Assert.Equal(1, await Count(policy.PolicyNumber.ToLowerInvariant()));
        Assert.Equal(1, await Count("cancelled"));
        Assert.Equal(2, await Count("searching.admin"));
        Assert.Equal(1, await Count(null, "RoleChanged"));
        Assert.Equal(2, await Count(null, "RoleChanged", "Cancelled", "NotACode"));
        Assert.Equal(0, await Count("nothing like this"));
        var all = await sut.ListAsync(new AuditLogQuery(Search: "  "));
        Assert.True(all.TotalCount >= 2);
    }

    [Fact]
    public async Task A_search_over_100_characters_is_a_field_error()
    {
        using var fixture = new SqliteTestDb();
        var sut = new AuditLogService(fixture.NewContext());

        var error = await Assert.ThrowsAsync<PolisGo.Application.Common.Exceptions.ValidationException>(
            () => sut.ListAsync(new AuditLogQuery(Search: new string('a', 101))));

        Assert.Contains("search", error.Errors.Keys);
    }
}
