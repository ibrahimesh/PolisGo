using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Admin;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Auth;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Admin;

// The last two active admins act on each other at the same moment: one of
// them must stay an active admin, on SQLite and on SQL Server.
[Trait("Category", "SqlServer")]
public class StaffAdminConcurrencyTests
{
    [Fact]
    public Task Admins_deactivating_each_other_at_once_keep_one_active_admin_on_sqlite() =>
        LastTwoAdminsActAtOnce(new FileSqliteDb(), (service, other) => service.DeactivateAsync(other));

    [Fact]
    public Task Admins_demoting_each_other_at_once_keep_one_active_admin_on_sqlite() =>
        LastTwoAdminsActAtOnce(new FileSqliteDb(),
            (service, other) => service.ChangeRoleAsync(other, new ChangeRoleRequest(UserRole.Agent)));

    [SqlServerFact]
    public Task Admins_deactivating_each_other_at_once_keep_one_active_admin_on_sql_server() =>
        LastTwoAdminsActAtOnce(new SqlServerTestDb(), (service, other) => service.DeactivateAsync(other));

    [SqlServerFact]
    public Task Admins_demoting_each_other_at_once_keep_one_active_admin_on_sql_server() =>
        LastTwoAdminsActAtOnce(new SqlServerTestDb(),
            (service, other) => service.ChangeRoleAsync(other, new ChangeRoleRequest(UserRole.Agent)));

    private static async Task LastTwoAdminsActAtOnce(
        ITestDatabase database, Func<StaffAdminService, Guid, Task<StaffMemberResponse>> act)
    {
        using var db = database;
        User a, b;
        using (var seed = db.NewContext())
        {
            var data = new TestData(seed);
            (a, b) = (data.User(UserRole.Admin), data.User(UserRole.Admin));
        }
        var gate = new SaveGate(parties: 2);
        StaffAdminService As(User me) => new(db.NewContext(gate),
            new FakeCurrentUser { UserId = me.Id, Role = UserRole.Admin }, new BcryptPasswordHasher(), TimeProvider.System);

        var outcomes = await Task.WhenAll(
            Outcome.Of(() => act(As(a), b.Id)),
            Outcome.Of(() => act(As(b), a.Id)));

        using var check = db.NewContext();
        var activeAdmins = await check.Users.CountAsync(u => u.Role == UserRole.Admin && u.IsActive);
        Assert.True(activeAdmins == 1, $"active admins: {activeAdmins}; outcomes=[{string.Join(", ", outcomes)}]");
        Assert.Equal(1, outcomes.Count(o => o == "ok"));
        // The other is refused as a conflict (last admin, or the deadlock
        // victim on SQL Server: both 409), never a 500.
        Assert.All(outcomes.Where(o => o != "ok"), o =>
            Assert.True(o is "ConflictException" or Outcome.Deadlock, o));
    }
}
