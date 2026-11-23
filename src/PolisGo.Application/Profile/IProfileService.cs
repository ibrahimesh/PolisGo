using PolisGo.Application.Auth.Dtos;
using PolisGo.Application.Profile.Dtos;

namespace PolisGo.Application.Profile;

// Always acts on the caller (ICurrentUser): there is no user id parameter, so
// one user can never read or edit another's profile through this service.
public interface IProfileService
{
    Task<ProfileResponse> GetAsync(CancellationToken cancellationToken = default);
    Task<ProfileResponse> UpdateAsync(UpdateProfileRequest request, CancellationToken cancellationToken = default);
    // Returns a fresh session: the change ends every token issued before it.
    Task<AuthResponse> ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken = default);
}
