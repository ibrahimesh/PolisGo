import { jsonResponse } from '../test/utils';
import { ApiError } from './errors';
import { onUnauthorized, request } from './http';
import { tokenStore } from './tokenStore';

afterEach(() => {
  vi.unstubAllGlobals();
  tokenStore.clear();
});

const future = () => new Date(Date.now() + 60 * 60_000).toISOString();

describe('request', () => {
  it('parses ProblemDetails into an ApiError with traceId and camelCase field errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            title: 'Validation failed',
            status: 400,
            errors: { EngineCapacityCc: ['Engine capacity must be greater than zero.'] },
            traceId: '00-trace-01',
          },
          400,
          'application/problem+json',
        ),
      ),
    );

    const error = await request('/api/x', { method: 'POST', body: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.traceId).toBe('00-trace-01');
    expect(apiError.fieldErrors).toEqual({
      engineCapacityCc: ['Engine capacity must be greater than zero.'],
    });
  });

  it('sends the bearer token and drops the session when the API answers 401', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ title: 'Unauthorized', status: 401 }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    tokenStore.set({ token: 'jwt-123', expiresAt: future() });

    await expect(request('/api/auth/me')).rejects.toMatchObject({ status: 401 });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer jwt-123');
    expect(tokenStore.get()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('reports an unreachable API as a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(request('/api/x')).rejects.toMatchObject({ kind: 'network', status: 0 });
  });
});
