using PolisGo.Domain.Entities;

namespace PolisGo.Application.Abstractions;

public interface IJwtTokenGenerator
{
    // Returns the serialized token and the exact UTC time it expires at — the
    // Api hands both back to the caller so clients can schedule refresh.
    (string Token, DateTime ExpiresAt) GenerateToken(User user);
}
