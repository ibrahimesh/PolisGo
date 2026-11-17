using PolisGo.Application.PolicyTypes;
using PolisGo.Domain.Entities;
using PolisGo.Infrastructure.Persistence.Configurations;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.PolicyTypes;

public class PolicyTypeServiceTests : IDisposable
{
    private readonly SqliteTestDb _testDb = new();

    public void Dispose() => _testDb.Dispose();

    [Fact]
    public async Task Lists_the_seeded_catalogue_ordered_by_code()
    {
        var types = await new PolicyTypeService(_testDb.NewContext()).ListAsync();

        Assert.Equal(new[] { "CASCO", "MTPL" }, types.Select(t => t.Code));
        var mtpl = types.Single(t => t.Code == "MTPL");
        Assert.Equal(PolicyTypeConfiguration.MtplId, mtpl.Id);
        Assert.Equal("Mandatory Third-Party Liability", mtpl.Name);
        Assert.False(string.IsNullOrWhiteSpace(mtpl.Description));
        Assert.Equal(50.00m, mtpl.BaseRate);
        Assert.All(types, t => Assert.Equal("AZN", t.Currency));
    }

    [Fact]
    public async Task Reflects_the_table_with_no_hard_coded_list()
    {
        _testDb.Db.PolicyTypes.Add(new PolicyType
        {
            Id = Guid.NewGuid(),
            Code = "GREEN",
            Name = "Green Card",
            Description = "Cross-border motor liability.",
            BaseRate = 80m
        });
        await _testDb.Db.SaveChangesAsync();

        var types = await new PolicyTypeService(_testDb.NewContext()).ListAsync();

        Assert.Equal(new[] { "CASCO", "GREEN", "MTPL" }, types.Select(t => t.Code));
    }
}
