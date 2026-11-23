namespace PolisGo.Tests.Configuration;

// Generated migration code is two thirds of the line count and never
// "covered": counted, it put CI's summary at 31% for ~93% real coverage.
public class CoverageConfigurationTests
{
    [Fact]
    public void Ci_coverage_excludes_generated_migrations()
    {
        var workflow = RepoFiles.Read(".github/workflows/ci.yml");
        Assert.Contains("--settings coverage.runsettings", workflow);

        var settings = RepoFiles.Read("coverage.runsettings");
        Assert.Contains("<ExcludeByFile>**/Migrations/*.cs</ExcludeByFile>", settings);
        Assert.Contains("XPlat Code Coverage", settings);
    }
}
