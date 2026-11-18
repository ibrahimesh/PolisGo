namespace PolisGo.Application.Common;

// A CSV export is built in memory in one response; past this many rows the
// caller narrows the filters instead of the server streaming a huge file.
public static class ExportLimits
{
    public const int MaxRows = 5000;

    public const string TooManyRows = "Too many rows to export; narrow the filters to at most 5000.";
}
