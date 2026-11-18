using PolisGo.Application.Policies.Dtos;

namespace PolisGo.Application.Cabinet.Dtos;

// A renewal reminder: an Active policy that ends within the reminder window
// and has no follow-on policy yet. Computed on read, never stored.
public record ReminderResponse(
    Guid PolicyId,
    string PolicyNumber,
    string PolicyTypeCode,
    PolicyVehicleSummary Vehicle,
    DateOnly EndDate,
    // 0 on the last covered day.
    int DaysLeft,
    // Null until the user marks it read.
    DateTime? ReadAt
);

public record ClientOverviewResponse(
    // Effective Active (end date not passed).
    int ActivePolicies,
    // Drafts that can still be paid (start date not passed).
    int AwaitingPayment,
    // The soonest-ending active policy, whatever the window; null if none.
    NextRenewalResponse? NextRenewal,
    // Distinct vehicles with active cover, out of all registered vehicles.
    int InsuredVehicles,
    int Vehicles,
    // Completed payments in the last 12 months.
    decimal PaidLast12Months,
    string Currency,
    int UnreadReminders,
    // Newest first.
    IReadOnlyList<ActivityEntry> RecentActivity
);

public record NextRenewalResponse(
    Guid PolicyId,
    string PolicyNumber,
    string PolicyTypeCode,
    DateOnly EndDate,
    int DaysLeft
);

public enum ActivityKind
{
    Policy,
    Claim
}

// One status change on the customer's policies or claims. Statuses are the
// enum names of PolicyStatus or ClaimStatus, depending on Kind.
public record ActivityEntry(
    ActivityKind Kind,
    Guid SubjectId,
    string Reference,
    string? FromStatus,
    string ToStatus,
    DateTime At
);
