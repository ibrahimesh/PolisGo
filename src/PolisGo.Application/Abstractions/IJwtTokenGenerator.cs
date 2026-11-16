using PolisGo.Domain.Entities;

namespace PolisGo.Application.Abstractions;

public interface IJwtTokenGenerator
{
    // Returns the serialized token and the exact UTC time it expires at. The
    // optional customerId is embedded as a claim so request handlers can scope
    // Client access without hitting the database on every request.
    (string Token, DateTime ExpiresAt) GenerateToken(User user, Guid? customerId = null);
}
