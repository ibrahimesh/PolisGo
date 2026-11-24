using System.Runtime.CompilerServices;
using PolisGo.Application.Diagnostics;
using PolisGo.Domain.Enums;

namespace PolisGo.Tests.Diagnostics;

public class ErrorFingerprintTests
{
    private const string Endpoint = "POST api/policies/{id}/pay";

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void Explode(string detail) => throw new InvalidOperationException($"Payment {detail} failed");

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static async Task ExplodeAsync(string detail)
    {
        await Task.Yield();
        Explode(detail);
    }

    private static Exception Catch(Action action)
    {
        try { action(); }
        catch (Exception ex) { return ex; }
        throw new InvalidOperationException("did not throw");
    }

    private static async Task<Exception> CatchAsync(Func<Task> action)
    {
        try { await action(); }
        catch (Exception ex) { return ex; }
        throw new InvalidOperationException("did not throw");
    }

    private static string Of(Exception ex, string endpoint = Endpoint) =>
        ErrorFingerprint.Compute(ErrorSource.Backend, ex.GetType().FullName!, ErrorFingerprint.ApplicationFrames(ex), endpoint);

    [Fact]
    public void The_same_bug_with_different_data_is_one_fingerprint()
    {
        var first = Of(Catch(() => Explode("for 3f2a9e1c-0000-4000-8000-000000000001 of 42 AZN")));
        var second = Of(Catch(() => Explode("for someone else entirely")));

        Assert.Equal(first, second);
        Assert.Matches("^[0-9a-f]{64}$", first);
    }

    [Fact]
    public void Another_endpoint_type_or_source_is_another_fingerprint()
    {
        var ex = Catch(() => Explode("x"));
        var frames = ErrorFingerprint.ApplicationFrames(ex);

        Assert.NotEqual(Of(ex), Of(ex, "GET api/claims/{id}"));
        Assert.NotEqual(
            ErrorFingerprint.Compute(ErrorSource.Backend, "A", frames, Endpoint),
            ErrorFingerprint.Compute(ErrorSource.Backend, "B", frames, Endpoint));
        Assert.NotEqual(
            ErrorFingerprint.Compute(ErrorSource.Backend, "A", frames, Endpoint),
            ErrorFingerprint.Compute(ErrorSource.Frontend, "A", frames, Endpoint));
    }

    // Frames by method name: async state machines and lambdas read as the
    // method a person wrote, and nothing depends on line numbers or paths.
    [Fact]
    public async Task Frames_name_the_application_methods_innermost_first()
    {
        var ex = await CatchAsync(() => ExplodeAsync("x"));
        var frames = ErrorFingerprint.ApplicationFrames(ex);

        Assert.Equal($"{typeof(ErrorFingerprintTests).FullName}.Explode", frames[0]);
        Assert.Contains($"{typeof(ErrorFingerprintTests).FullName}.ExplodeAsync", frames);
        Assert.All(frames, f => Assert.StartsWith("PolisGo.", f));
        Assert.DoesNotContain(frames, f => f.Contains("MoveNext") || f.Contains('<') || f.Contains(':'));
        Assert.True(frames.Count <= ErrorFingerprint.FrameCount);
    }

    [Theory]
    [InlineData("Cannot read properties of undefined (reading 'name')", "Cannot read properties of undefined (reading {text})")]
    [InlineData("Claim 3f2a9e1c-0000-4000-8000-000000000001 failed after 3 tries", "Claim {id} failed after {n} tries")]
    [InlineData("Chunk 8f05e497f602 not found", "Chunk {hex} not found")]
    [InlineData("Premium 215,85 vs 215.84", "Premium {n} vs {n}")]
    public void Message_templates_drop_the_values(string message, string template) =>
        Assert.Equal(template, ErrorFingerprint.MessageTemplate(message));
}
