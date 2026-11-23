import { screen } from '@testing-library/react';
import { ApiError } from '../../api/errors';
import { renderWithProviders } from '../../test/utils';
import { ErrorNotice } from './ErrorNotice';

const traceId = '00-8f05e497f602ed095d0149881a2e0468-ce9bed5f785d5dd5-00';

describe('ErrorNotice', () => {
  it('shows the friendly message and a short reference, not the raw trace id', () => {
    renderWithProviders(
      <ErrorNotice error={new ApiError('http', 500, { title: 'Server error', traceId })} />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The server ran into a problem.');
    expect(alert).toHaveTextContent('Reference 8F05E497');
    // Only the hidden description holds it (read when the copy button is).
    expect(screen.getByText(`Full reference: ${traceId}`)).not.toBeVisible();
    expect(screen.getByTestId('reference-chip')).toHaveAttribute('title', traceId);
    expect(
      screen.getByRole('button', { name: 'Copy reference 8F05E497' }),
    ).toHaveAccessibleDescription(`Full reference: ${traceId}`);
  });

  it('shows no reference for field validation errors', () => {
    const problem = { title: 'Invalid', traceId, errors: { Email: ['Email is required.'] } };
    renderWithProviders(<ErrorNotice error={new ApiError('http', 400, problem)} />);
    expect(screen.queryByTestId('reference-chip')).not.toBeInTheDocument();
  });

  it('keeps a sign-in failure generic, whatever the server said', () => {
    // A deactivated account answers like a wrong password (no detail leaks).
    const problem = { title: 'Unauthorized', detail: 'Account deactivated', traceId };
    renderWithProviders(
      <ErrorNotice
        error={new ApiError('http', 401, problem)}
        overrides={{ 401: 'errors.invalidCredentials' }}
        shake
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The email or password is incorrect.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('deactivated');
  });
});
