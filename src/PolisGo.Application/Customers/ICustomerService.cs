using PolisGo.Application.Common;
using PolisGo.Application.Customers.Dtos;

namespace PolisGo.Application.Customers;

// Staff-facing customer directory. Role gating (Admin, Agent, Adjuster) is
// enforced by the controller; this service applies per-role data visibility.
public interface ICustomerService
{
    Task<PagedResult<CustomerListItem>> ListAsync(
        ListCustomersQuery query, CancellationToken cancellationToken = default);

    Task<CustomerDetailResponse> GetByIdAsync(
        Guid id, CancellationToken cancellationToken = default);
}
