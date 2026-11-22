using System.Text.RegularExpressions;

namespace PolisGo.Tests.Configuration;

// The documented Docker setup: nothing reachable from the network, and no
// secret that works without being set (compose refuses to start instead).
public class ComposeConfigurationTests
{
    private static readonly string[] ComposeFiles = ["docker-compose.yml", "docker-compose.demo.yml", "docker-compose.e2e.yml"];
    private static readonly string[] Secrets = ["SQL_SA_PASSWORD", "JWT_SECRET_KEY", "SEED_ADMIN_PASSWORD", "DEMO_PASSWORD"];

    // "- "127.0.0.1:8080:8080"" entries under a ports: key.
    private static IEnumerable<string> PublishedPorts(string yaml)
    {
        var lines = yaml.Replace("\r", "").Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            if (lines[i].Trim() != "ports:") continue;
            var indent = lines[i].Length - lines[i].TrimStart().Length;
            for (var j = i + 1; j < lines.Length && lines[j].Trim().StartsWith('-')
                 && lines[j].Length - lines[j].TrimStart().Length > indent; j++)
            {
                yield return lines[j].Trim().TrimStart('-').Trim().Trim('"');
            }
        }
    }

    [Fact]
    public void Published_ports_listen_on_localhost_only()
    {
        var ports = ComposeFiles.SelectMany(f => PublishedPorts(RepoFiles.Read(f))).ToList();

        Assert.NotEmpty(ports);
        Assert.All(ports, port => Assert.StartsWith("127.0.0.1:", port));
    }

    // A fixed container_name is global per Docker host: a second checkout,
    // a worktree or a parallel CI runner can't start its stack while another
    // one (even stopped) holds the name. Compose's project-scoped names don't clash.
    [Fact]
    public void No_service_has_a_fixed_container_name()
    {
        foreach (var file in ComposeFiles)
        {
            Assert.DoesNotContain("container_name:", RepoFiles.Read(file));
        }
    }

    [Fact]
    public void Secrets_have_no_usable_default()
    {
        var example = RepoFiles.Read(".env.example").Replace("\r", "");
        var compose = string.Join('\n', ComposeFiles.Select(RepoFiles.Read));

        foreach (var secret in Secrets)
        {
            // Present and empty in the example, so "${X:?...}" stops compose until it is set.
            Assert.Matches(new Regex($"^{secret}=$", RegexOptions.Multiline), example);
            Assert.DoesNotMatch(new Regex($@"\$\{{{secret}:-"), compose);
            Assert.Matches(new Regex($@"\$\{{{secret}:\?"), compose);
        }
    }
}
