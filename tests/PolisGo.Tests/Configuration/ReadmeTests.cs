using System.Text.RegularExpressions;

namespace PolisGo.Tests.Configuration;

// The README's CI section is what a reviewer reads instead of the workflow:
// every job in ci.yml has its bullet there.
public class ReadmeTests
{
    [Fact]
    public void The_ci_section_describes_every_ci_job()
    {
        var readme = RepoFiles.Read("README.md").Replace("\r", "");
        var ci = readme[readme.IndexOf("## CI", StringComparison.Ordinal)..];
        ci = ci[..ci.IndexOf("\n## ", 5, StringComparison.Ordinal)];
        // Job display names, e.g. "Frontend (lint, typecheck, test, build)" -> "Frontend".
        var jobs = Regex.Matches(RepoFiles.Read(".github/workflows/ci.yml"), @"^    name: (.+)$", RegexOptions.Multiline)
            .Select(m => m.Groups[1].Value.Split(" (")[0].Trim())
            .ToList();

        Assert.True(jobs.Count >= 5, string.Join(", ", jobs));
        Assert.All(jobs, job => Assert.Contains($"**{job}**", ci));
    }
}
