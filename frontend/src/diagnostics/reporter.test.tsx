import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { RouteErrorBoundary } from '../pages/errors/RouteErrorBoundary';
import {
  newTraceId,
  reportApiFailure,
  reportError,
  routeTemplate,
  scrub,
  setReporterEnabledForTests,
} from './reporter';

function stubFetch(
  impl: () => Promise<Response> = () => Promise.resolve(new Response(null, { status: 202 })),
) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sentBodies = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map(
    (call) =>
      JSON.parse((call as unknown as [string, RequestInit])[1].body as string) as Record<
        string,
        unknown
      >,
  );

afterEach(() => {
  setReporterEnabledForTests(null);
  vi.unstubAllGlobals();
});

describe('reporter', () => {
  it('sends nothing in unit tests unless switched on', () => {
    const fetchMock = stubFetch();
    setReporterEnabledForTests(null);
    reportError(new Error('boom'), 'error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a closed, scrubbed payload with a route template and keepalive', () => {
    const fetchMock = stubFetch();
    setReporterEnabledForTests(true);
    window.history.pushState({}, '', '/app/claims/3f2a9e1c-0000-4000-8000-000000000001?token=abc');
    const error = new TypeError(
      'Failed for leyla@polisgo.az with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
    );
    error.stack = 'TypeError: x\n    at Claim (http://localhost:5173/src/Claim.tsx?t=1:10:5)';

    const traceId = reportError(error, 'error');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/diagnostics\/client-errors$/);
    expect(init.keepalive).toBe(true);
    const body = sentBodies(fetchMock)[0] ?? {};
    expect(Object.keys(body).sort()).toEqual(
      ['appVersion', 'kind', 'message', 'name', 'route', 'stack', 'traceId'].sort(),
    );
    expect(body.route).toBe('/app/claims/:id');
    expect(body.traceId).toBe(traceId);
    expect(body.message).not.toMatch(/leyla|eyJ/);
    expect(body.stack).not.toMatch(/localhost|\?t=/);
    expect(JSON.stringify(body)).not.toContain('token=abc');
    window.history.pushState({}, '', '/');
  });

  it('deduplicates the same error and returns the first trace id', () => {
    const fetchMock = stubFetch();
    setReporterEnabledForTests(true);
    const first = reportError(new Error('Same thing 1'), 'boundary');
    const second = reportError(new Error('Same thing 2'), 'boundary', { traceId: newTraceId() });
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends at most ten a minute', () => {
    const fetchMock = stubFetch();
    setReporterEnabledForTests(true);
    for (let i = 0; i < 25; i++)
      reportError(new Error(`Distinct ${String.fromCharCode(97 + i)}`), 'error');
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('keeps a few reports while offline and sends them when back online', () => {
    const fetchMock = stubFetch();
    setReporterEnabledForTests(true);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    for (let i = 0; i < 8; i++)
      reportError(new Error(`Offline ${String.fromCharCode(97 + i)}`), 'error');
    expect(fetchMock).not.toHaveBeenCalled();

    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('never loops or throws when its own request fails', async () => {
    const fetchMock = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    setReporterEnabledForTests(true);
    expect(() => reportError(new Error('first'), 'error')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    reportApiFailure({ method: 'POST', path: '/api/diagnostics/client-errors', status: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports API failures by template and status', () => {
    const fetchMock = stubFetch();
    setReporterEnabledForTests(true);
    reportApiFailure({
      method: 'GET',
      path: '/api/policies/3f2a9e1c-0000-4000-8000-000000000001?x=1',
      status: 502,
    });
    const body = sentBodies(fetchMock)[0] ?? {};
    expect(body).toMatchObject({
      kind: 'http',
      httpStatus: 502,
      message: 'GET /api/policies/:id answered 502',
    });
  });
});

describe('helpers', () => {
  it.each([
    ['/app/claims/3f2a9e1c-0000-4000-8000-000000000001', '/app/claims/:id'],
    ['/app/admin/system/lookup/8F05E497', '/app/admin/system/lookup/:id'],
    ['/app/policies', '/app/policies'],
    ['/app/__e2e/crash', '/app/__e2e/crash'],
    ['/app/customers/42/sell', '/app/customers/:id/sell'],
    ['/app/ыы', '/app/:param'],
    ['/', '/'],
  ])('routeTemplate(%s) → %s', (path, template) => {
    expect(routeTemplate(path)).toBe(template);
  });

  it('mints W3C trace ids', () => {
    expect(newTraceId()).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('scrubs emails, tokens, origins, queries and long numbers', () => {
    expect(scrub('a@b.az https://x.test/p?q=1 4111 1111 1111 1111')).toBe('[email] /p [number]');
  });
});

describe('the route error boundary', () => {
  function Crash(): never {
    throw new Error('Deliberate render crash');
  }

  it('shows the Reference of the trace id it reported', () => {
    const fetchMock = stubFetch();
    setReporterEnabledForTests(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Crash />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );
    const body = sentBodies(fetchMock)[0] ?? {};
    expect(body.kind).toBe('boundary');
    const traceId = String(body.traceId);
    const code = traceId.slice(3, 11).toUpperCase();
    expect(screen.getByTestId('reference-chip')).toHaveTextContent(code);
  });
});
