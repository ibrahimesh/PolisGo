import { ApiError } from '../../api/errors';
import { classifyError } from './errorKind';

const traceId = '00-8f05e497f602ed095d0149881a2e0468-ce9bed5f785d5dd5-00';
const http = (status: number) => new ApiError('http', status, { title: 'x', traceId });

describe('classifyError', () => {
  it('maps API answers to the page that explains them, keeping the reference', () => {
    expect(classifyError(http(503))).toEqual({ kind: 'maintenance', traceId });
    expect(classifyError(http(401)).kind).toBe('sessionExpired');
    expect(classifyError(http(403)).kind).toBe('forbidden');
    expect(classifyError(http(404)).kind).toBe('notFound');
    expect(classifyError(http(500))).toEqual({ kind: 'server', traceId });
    expect(classifyError(http(409)).kind).toBe('server');
  });

  it('tells offline from an unreachable API', () => {
    const network = new ApiError('network', 0);
    expect(classifyError(network, false).kind).toBe('offline');
    expect(classifyError(network, true).kind).toBe('unreachable');
  });

  it('treats a lazy chunk that failed to load as a connection problem', () => {
    const chunk = new TypeError('Failed to fetch dynamically imported module: /src/pages/X.tsx');
    expect(classifyError(chunk, false).kind).toBe('offline');
    expect(classifyError(chunk, true).kind).toBe('unreachable');
  });

  it('calls anything else a server-side problem with no reference', () => {
    expect(classifyError(new Error('boom'))).toEqual({ kind: 'server', traceId: undefined });
    expect(classifyError('a string').kind).toBe('server');
  });
});
