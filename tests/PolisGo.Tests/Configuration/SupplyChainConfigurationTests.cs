using System.Text.RegularExpressions;

namespace PolisGo.Tests.Configuration;

// What CI runs and what the build pulls in is pinned and watched.
public class SupplyChainConfigurationTests
{
    private static string Workflow => RepoFiles.Read(".github/workflows/ci.yml");

    // A tag can be moved to other code; a commit SHA can't. Dependabot keeps
    // the SHAs (and their "# vN" comments) current.
    [Fact]
    public void Every_action_is_pinned_to_a_commit()
    {
        var uses = Regex.Matches(Workflow, @"uses:\s*(\S+)").Select(m => m.Groups[1].Value).ToList();

        Assert.NotEmpty(uses);
        Assert.All(uses, action => Assert.Matches(@"^[\w.-]+/[\w.-]+@[0-9a-f]{40}$", action));
    }

    // Base images by digest as well as tag, in the Dockerfile, compose and CI.
    [Fact]
    public void Every_image_is_pinned_to_a_digest()
    {
        var images = Regex.Matches(RepoFiles.Read("src/PolisGo.Api/Dockerfile"), @"^FROM\s+(\S+)", RegexOptions.Multiline)
            .Concat(Regex.Matches(RepoFiles.Read("docker-compose.yml"), @"image:\s*(\S+)"))
            .Concat(Regex.Matches(Workflow, @"image:\s*(\S+)"))
            .Select(m => m.Groups[1].Value)
            .ToList();

        Assert.True(images.Count >= 4, string.Join(", ", images));
        Assert.All(images, image => Assert.Matches(@"^[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}$", image));
    }

    [Fact]
    public void Dependabot_watches_every_ecosystem()
    {
        var dependabot = RepoFiles.Read(".github/dependabot.yml");
        foreach (var ecosystem in new[] { "nuget", "github-actions", "npm", "docker", "docker-compose" })
        {
            Assert.Contains($"package-ecosystem: \"{ecosystem}\"", dependabot);
        }
    }

    [Fact]
    public void Ci_checks_formatting_and_known_vulnerabilities()
    {
        Assert.Contains("npm run format:check", Workflow);
        Assert.Contains("npm audit --audit-level=high", Workflow);
        Assert.Contains("package --vulnerable --include-transitive", Workflow);
    }

    // One servicing level for the .NET 10 packages: a 10.0.0 left behind the
    // others misses their fixes.
    [Fact]
    public void Microsoft_10_0_packages_share_one_patch_level()
    {
        var versions = Directory.GetFiles(Path.Combine(RepoFiles.Root, "src"), "*.csproj", SearchOption.AllDirectories)
            .Concat(Directory.GetFiles(Path.Combine(RepoFiles.Root, "tests"), "*.csproj", SearchOption.AllDirectories))
            .SelectMany(f => Regex.Matches(File.ReadAllText(f), @"Include=""(Microsoft\.[^""]+)"" Version=""(10\.0\.\d+)"""))
            .Select(m => (Package: m.Groups[1].Value, Version: m.Groups[2].Value))
            .ToList();

        Assert.Single(versions.Select(v => v.Version).Distinct());
    }
}
