namespace PolisGo.Application.Diagnostics;

// "ErrorTracking" in configuration. The caps keep the tables bounded
// whatever happens: a loop that throws 10,000 times is one group with a
// count of 10,000 and at most MaxOccurrencesPerGroup stored rows.
public sealed class ErrorTrackingOptions
{
    public const string SectionName = "ErrorTracking";

    public int MaxOccurrencesPerGroup { get; set; } = 20;
    public int QueueCapacity { get; set; } = 1000;
    public int BatchSize { get; set; } = 100;
    public int OccurrenceRetentionDays { get; set; } = 30;
    public int CounterRetentionDays { get; set; } = 90;
    // Distinct client-error fingerprints are cheap to invent; beyond this
    // many new frontend groups an hour, reports fold into one overflow group.
    public int MaxNewClientGroupsPerHour { get; set; } = 50;
}
