namespace PolisGo.Application.Common;

// One bucket of a "count by status" breakdown. Lists of these are zero-filled
// in enum order so clients can render a stable set of rows.
public record StatusCount<TStatus>(TStatus Status, int Count) where TStatus : struct, Enum;
