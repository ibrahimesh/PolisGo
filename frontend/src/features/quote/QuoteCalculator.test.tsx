import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PremiumBreakdown } from '../../api/types';
import { jsonResponse, renderWithProviders } from '../../test/utils';
import { QuoteCalculator } from './QuoteCalculator';

const breakdown: PremiumBreakdown = {
  baseRate: 50,
  engineFactor: 1.15,
  driverAgeFactor: 1,
  experienceFactor: 0.95,
  vehicleAgeFactor: 1,
  bonusMalusFactor: 0.9,
  termFactor: 1,
  totalFactor: 0.98325,
  premium: 49.16,
  currency: 'AZN',
};

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(breakdown)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestBodies(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(init?.body as string) as Record<string, unknown>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('QuoteCalculator', () => {
  it('prices the default form against the anonymous quote endpoint', async () => {
    const fetchMock = mockFetch(jsonResponse(breakdown));
    renderWithProviders(<QuoteCalculator />);

    expect(await screen.findByText('Indicative premium: 49.16 AZN')).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url as string).toMatch(/\/api\/quotes\/calculate$/);
    expect(init?.method).toBe('POST');
    // Anonymous endpoint: never send a token, even if one exists.
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    expect(requestBodies(fetchMock)[0]).toMatchObject({
      policyTypeCode: 'MTPL',
      engineCapacityCc: 1800,
      termMonths: 12,
    });
    expect(screen.getByRole('table', { name: /premium breakdown/i })).toBeInTheDocument();
  });

  it('debounces edits and sends the updated values', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(breakdown));
    renderWithProviders(<QuoteCalculator />);
    await screen.findByText('Indicative premium: 49.16 AZN');

    const engine = screen.getByLabelText('Engine capacity');
    await user.clear(engine);
    await user.type(engine, '2500');

    await waitFor(() =>
      expect(requestBodies(fetchMock).at(-1)).toMatchObject({ engineCapacityCc: 2500 }),
    );
    // Typing "2500" must not fire a request per keystroke.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('shows a translated client-side error and does not send invalid input', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(breakdown));
    renderWithProviders(<QuoteCalculator />);
    await screen.findByText('Indicative premium: 49.16 AZN');

    const year = screen.getByLabelText('Vehicle model year');
    await user.clear(year);
    await user.type(year, '2099');

    expect(await screen.findByText("Model year can't be in the future.")).toBeInTheDocument();
    expect(year).toHaveAttribute('aria-invalid', 'true');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(requestBodies(fetchMock).some((body) => body.vehicleYear === 2099)).toBe(false);
  });

  it('maps API validation errors onto the matching field, translated', async () => {
    mockFetch(
      jsonResponse(
        {
          title: 'Validation failed',
          status: 400,
          errors: {
            DrivingLicenseDate: ['Driving licence date must be after the driver turns 18.'],
          },
          traceId: '00-abc-01',
        },
        400,
        'application/problem+json',
      ),
    );
    renderWithProviders(<QuoteCalculator />);

    expect(
      await screen.findByText('The licence must be issued after the driver turned 18.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Licence issued on')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a server failure with its traceId', async () => {
    mockFetch(
      jsonResponse(
        { title: 'Server error', status: 500, traceId: '00-deadbeef-01' },
        500,
        'application/problem+json',
      ),
    );
    renderWithProviders(<QuoteCalculator />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("The premium couldn't be calculated");
    expect(alert).toHaveTextContent('00-deadbeef-01');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
