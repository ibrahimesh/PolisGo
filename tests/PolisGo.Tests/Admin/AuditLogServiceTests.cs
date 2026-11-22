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
}
