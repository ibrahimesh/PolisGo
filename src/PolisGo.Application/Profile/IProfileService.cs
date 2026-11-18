using PolisGo.Application.Profile.Dtos;

namespace PolisGo.Application.Profile;

// Always acts on the caller (ICurrentUser): there is no user id parameter, so
// one user can never read or edit another's profile through this service.
public interface IProfileService
{
    Task<ProfileResponse> GetAsync(CancellationToken cancellationToken = default);
    Task<ProfileResponse> UpdateAsync(UpdateProfileRequest request, CancellationToken cancellationToken = default);
    Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken = default);
}
