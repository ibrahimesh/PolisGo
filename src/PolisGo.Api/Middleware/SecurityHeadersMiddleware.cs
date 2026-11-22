using Microsoft.Net.Http.Headers;

namespace PolisGo.Api.Middleware;

// Defence in depth for an API that serves personal data and uploaded files
// (already checked by their first bytes and sent as attachments). Set when
// the response starts, so error responses — which ExceptionHandlingMiddleware
// clears and rewrites — carry them too.
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next) => _next = next;

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers.XContentTypeOptions = "nosniff";
            headers.XFrameOptions = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            // The API answers JSON and files, never pages; Swagger UI
            // (Development only) needs its own scripts and styles.
            if (!context.Request.Path.StartsWithSegments("/swagger"))
            {
                headers.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";
            }
            // A signed-in response is someone's data: no browser or proxy may
            // keep it, unless the endpoint chose a cache policy itself.
            if (context.Request.Headers.ContainsKey(HeaderNames.Authorization)
                && !headers.ContainsKey(HeaderNames.CacheControl))
            {
                headers.CacheControl = "no-store";
            }
            return Task.CompletedTask;
        });
        return _next(context);
    }
}
