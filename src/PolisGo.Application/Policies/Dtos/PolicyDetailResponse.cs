using PolisGo.Application.Pricing;
using PolisGo.Application.Vehicles.Dtos;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Policies.Dtos;

// Everything the policy page and its certificate need, in one response.
public record PolicyDetailResponse(
    PolicyResponse Policy,
    // Name of the insured as recorded on the customer, printed on the certificate.
    string HolderName,
    VehicleResponse Vehicle,
    // The factors the premium was computed with at issue; null for policies
    // issued before pricing was recorded.
    PremiumBreakdown? Pricing,
    IReadOnlyList<PolicyPaymentResponse> Payments,
    // Oldest first.
    IReadOnlyList<PolicyHistoryEntry> History
);

public record PolicyPaymentResponse(
    Guid Id,
    decimal Amount,
    string Currency,
    PaymentMethod Method,
    PaymentStatus Status,
    DateTime PaidAt,
    string? Reference
);

public record PolicyHistoryEntry(
    PolicyStatus? FromStatus,
    PolicyStatus ToStatus,
    DateTime ChangedAt,
    // True for the derived Active -> Expired step, which no one performs.
    bool Automatic
);
