using PolisGo.Domain.Enums;

namespace PolisGo.Domain.Entities;

// How many errors happened in one UTC hour, per source. Occurrences are
// capped per group and expire, so charts and the health counters read these
// exact totals instead.
public class ErrorHourlyCount
{
    public DateTime HourStartUtc { get; set; }
    public ErrorSource Source { get; set; }
    public long Count { get; set; }
    // Of those, the ones answered with a 5xx.
    public long ServerErrorCount { get; set; }
}
