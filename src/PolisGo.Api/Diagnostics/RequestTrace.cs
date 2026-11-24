using System.Diagnostics;
using PolisGo.Application.Diagnostics;

namespace PolisGo.Api.Diagnostics;

// The request's trace id, decided once: the ProblemDetails "traceId" a user
// sees (and quotes as "Reference XXXXXXXX") and the one error tracking stores
// must be the same value. Normally the W3C id of the request's Activity; if
// there is none, a new id in the same format.
public static class RequestTrace
{
    private const string Key = "PolisGo.TraceId";

    public static string Id(HttpContext context)
    {
        if (context.Items.TryGetValue(Key, out var cached) && cached is string known) return known;
        var id = Activity.Current?.Id;
        if (ErrorReference.TraceIdOf(id) is null)
        {
            id = $"00-{ErrorReference.NewTraceId()}-{Guid.NewGuid():N}"[..52] + "-00";
        }
        context.Items[Key] = id;
        return id!;
    }
}
