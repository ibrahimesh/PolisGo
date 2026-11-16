using PolisGo.Application.Common;
using Xunit;

namespace PolisGo.Tests.Common;

// Platform-independent: the sanitiser must produce the same leaf on Windows and Linux.
// Path.GetFileName alone does not — that's the whole point.
public class FileNamesTests
{
    [Fact]
    public void Sanitize_WindowsTraversal_ReturnsLeaf()
    {
        Assert.Equal("passwd.pdf", FileNames.Sanitize(@"..\..\etc\passwd.pdf"));
    }

    [Fact]
    public void Sanitize_PosixTraversal_ReturnsLeaf()
    {
        Assert.Equal("passwd.pdf", FileNames.Sanitize("../../etc/passwd.pdf"));
    }

    [Fact]
    public void Sanitize_WindowsDriveAbsolutePath_ReturnsLeaf()
    {
        Assert.Equal("a.pdf", FileNames.Sanitize(@"C:\temp\a.pdf"));
    }

    [Fact]
    public void Sanitize_MixedSeparators_ReturnsLeaf()
    {
        Assert.Equal("c.pdf", FileNames.Sanitize(@"a/b\c.pdf"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public void Sanitize_EmptyOrWhitespace_ReturnsFallback(string? input)
    {
        Assert.Equal(FileNames.Fallback, FileNames.Sanitize(input));
    }

    [Fact]
    public void Sanitize_OnlySeparators_ReturnsFallback()
    {
        Assert.Equal(FileNames.Fallback, FileNames.Sanitize(@"\\\///"));
    }

    [Fact]
    public void Sanitize_VeryLongName_TruncatesAndPreservesExtension()
    {
        var stem = new string('a', 500);
        var result = FileNames.Sanitize(stem + ".pdf");

        Assert.True(result.Length <= FileNames.MaxLength);
        Assert.EndsWith(".pdf", result);
    }

    [Fact]
    public void Sanitize_VeryLongNameWithoutExtension_TruncatedToLimit()
    {
        var result = FileNames.Sanitize(new string('x', 1000));
        Assert.Equal(FileNames.MaxLength, result.Length);
    }

    [Fact]
    public void Sanitize_StripsControlChars()
    {
        Assert.Equal("ab.pdf", FileNames.Sanitize("a\u0001b\u0000.pdf"));
    }

    [Fact]
    public void Sanitize_StripsInvalidWindowsChars()
    {
        // The <, >, :, ", |, ?, * characters are illegal on Windows — strip them
        // everywhere so names round-trip cleanly across OSes.
        Assert.Equal("ab.pdf", FileNames.Sanitize("a<>:\"|?*b.pdf"));
    }

    [Fact]
    public void Sanitize_TrimsTrailingDotsAndSpaces()
    {
        // Windows silently strips trailing dots/spaces; do it up front so DB/storage agree.
        Assert.Equal("a.pdf", FileNames.Sanitize("  a.pdf. .  "));
    }

    [Fact]
    public void Sanitize_PlainName_IsUnchanged()
    {
        Assert.Equal("evidence.pdf", FileNames.Sanitize("evidence.pdf"));
    }
}
