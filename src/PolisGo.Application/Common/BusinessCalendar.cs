namespace PolisGo.Application.Common;

// Business dates — cover start and end, incident dates, birth and licence
// dates, "today" — are dates in Azerbaijan, not UTC. Baku is UTC+4 all year,
// so between 00:00 and 04:00 local time the UTC date is still yesterday.
// Timestamps (CreatedAt, PaidAt, history) stay UTC instants.
public static class BusinessCalendar
{
    public const string TimeZoneId = "Asia/Baku";

    // Resolved once. Missing time zone data (a base image without tzdata)
    // fails the API at startup instead of silently falling back to UTC.
    public static TimeZoneInfo Zone { get; } = TimeZoneInfo.FindSystemTimeZoneById(TimeZoneId);

    public static DateOnly Today(TimeProvider clock) => DateOf(clock.GetUtcNow());

    public static DateOnly DateOf(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Zone).DateTime);

    // The UTC instant a Baku day starts at: day filters over timestamps (the
    // audit log, the dashboard) compare against these.
    public static DateTime StartOfDayUtc(DateOnly date) =>
        TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.MinValue), Zone);
}
