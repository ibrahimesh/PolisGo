namespace PolisGo.Domain.Enums;

// An error group's triage state. New also covers a group reopened by hand
// or by a regression (ErrorGroup.IsRegressed tells the two apart).
public enum ErrorStatus
{
    New,
    Resolved,
    Ignored
}
