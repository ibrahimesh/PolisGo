namespace PolisGo.Tests.Configuration;

// Configuration and deployment files are part of the contract too: tests
// read them from the repository, as the SPA's apiErrors test reads the C#.
internal static class RepoFiles
{
    public static string Root { get; } = FindRoot();

    public static string Read(string relativePath) =>
        File.ReadAllText(Path.Combine(Root, relativePath.Replace('/', Path.DirectorySeparatorChar)));

    private static string FindRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (File.Exists(Path.Combine(dir.FullName, "PolisGo.slnx"))) return dir.FullName;
        }
        throw new InvalidOperationException("PolisGo.slnx not found above the test output.");
    }
}
