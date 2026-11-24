using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Diagnostics;

// What the SPA's reporter may send, and nothing else: an unknown field is a
// 400, like a value out of its shape. Everything is redacted again by the
// writer; the shape checks only keep junk and floods out of the queue.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ClientErrorReport(
    // error | unhandledrejection | boundary | network | http
    string Kind,
    string Message,
    // The error's name ("TypeError"); the kind stands in when absent.
    string? Name,
    string? Stack,
    // The route template the error happened on ("/app/claims/:id").
    string Route,
    string? AppVersion,
    string? UserAgent,
    // A W3C trace id: the server's for a failed call, or one the reporter
    // minted for a crash (the Reference the user was shown).
    string? TraceId,
    int? HttpStatus);

public static partial class ClientErrorIntake
{
    public const int MaxBodyBytes = 8 * 1024;
    public const int MaxMessageLength = 1000;
    public const int MaxStackLength = 4000;

    public static class Messages
    {
        // Deliberately unspecific: the endpoint is anonymous.
        public const string Invalid = "The error report was not accepted.";
        public const string TooLarge = "The error report is too large.";
    }

    private static readonly HashSet<string> Kinds = ["error", "unhandledrejection", "boundary", "network", "http"];

    // The actor comes from the caller's token (role, id), never the body.
    public static ErrorReport ToReport(ClientErrorReport? body, DateTime receivedAt, UserRole? role, Guid? userId,
        string? headerUserAgent)
    {
        if (body is null
            // Omitted fields arrive as null whatever the record says.
            || body.Kind is null || !Kinds.Contains(body.Kind)
            || string.IsNullOrWhiteSpace(body.Message) || body.Message.Length > MaxMessageLength
            || body.Name is { } name && (name.Length > 100 || !ErrorName().IsMatch(name))
            || body.Stack is { Length: > MaxStackLength }
            || body.Route is null || body.Route.Length > 200 || !RouteTemplate().IsMatch(body.Route)
            || body.AppVersion is { } version && (version.Length > 50 || !Version().IsMatch(version))
            || body.UserAgent is { Length: > 400 }
            || body.TraceId is { } trace && ErrorReference.TraceIdOf(trace) is null
            || body.HttpStatus is < 100 or > 599)
        {
            throw new ValidationException("report", Messages.Invalid);
        }

        var type = body.Name ?? body.Kind;
        return new ErrorReport(
            ErrorSource.Frontend,
            // The server's clock: a client's can be anything.
            receivedAt,
            ErrorReference.TraceIdOf(body.TraceId) ?? ErrorReference.NewTraceId(),
            type,
            body.Message,
            body.Stack is null ? null : Origin().Replace(body.Stack, ""),
            [ErrorFingerprint.MessageTemplate(body.Message)],
            body.Route,
            body.HttpStatus,
            ClientRoute: body.Route,
            ActorRole: role,
            ActorUserId: userId,
            UserAgent: string.IsNullOrWhiteSpace(headerUserAgent) ? body.UserAgent : headerUserAgent,
            AppVersion: body.AppVersion);
    }

    [GeneratedRegex(@"^[A-Za-z][\w.$]*$")]
    private static partial Regex ErrorName();

    // Path segments and ":param" placeholders only: no query, no hash.
    [GeneratedRegex(@"^/[A-Za-z0-9/_:.\-]*$")]
    private static partial Regex RouteTemplate();

    [GeneratedRegex(@"^[\w.+\-]+$")]
    private static partial Regex Version();

    // "http://localhost:5173/src/x.tsx:10:5" → "/src/x.tsx:10:5": the
    // script's origin says nothing about the bug.
    [GeneratedRegex(@"\b[a-z][a-z0-9+.-]*://[^/\s)]+", RegexOptions.IgnoreCase)]
    private static partial Regex Origin();
}
