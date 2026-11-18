using PolisGo.Domain.Enums;

namespace PolisGo.Domain.Entities;

public class Payment
{
    public Guid Id { get; set; }

    public Guid PolicyId { get; set; }
    public Policy Policy { get; set; } = null!;

    public decimal Amount { get; set; }
    public DateTime PaidAt { get; set; }
    public PaymentMethod Method { get; set; }
    public PaymentStatus Status { get; set; }

    // The payment provider's reference, printed on the certificate so the
    // customer can trace the charge. Null on rows that predate it.
    public string? Reference { get; set; }
}
