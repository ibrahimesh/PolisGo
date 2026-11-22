using PolisGo.Application.Auth;

namespace PolisGo.Application.Common.Exceptions;

// A rate limit refused the request (sign-in, registration, password change).
// Thrown from the limiter so ExceptionHandlingMiddleware writes the 429 like
// every other error: ProblemDetails with a traceId, plus Retry-After.
public class TooManyRequestsException(TimeSpan? retryAfter)
    : Exception(AuthValidation.Messages.TooManyAttempts)
{
    public TimeSpan? RetryAfter { get; } = retryAfter;
}
