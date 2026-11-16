using PolisGo.Application.Abstractions;
using PolisGo.Domain.Enums;

namespace PolisGo.Tests.Infrastructure;

internal sealed class FakeCurrentUser : ICurrentUser
{
    public required Guid UserId { get; init; }
    public required UserRole Role { get; init; }
    public Guid? CustomerId { get; init; }
}
