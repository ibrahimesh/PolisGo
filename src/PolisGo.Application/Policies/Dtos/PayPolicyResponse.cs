namespace PolisGo.Application.Policies.Dtos;

public record PayPolicyResponse(
    PolicyResponse Policy,
    Guid PaymentId,
    decimal Amount,
    string Currency,
    string Reference,
    DateTime PaidAt
);
