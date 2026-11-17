import type { ProblemDetails } from './types';

export type ApiErrorKind = 'http' | 'network';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly problem: ProblemDetails | undefined;

  constructor(kind: ApiErrorKind, status: number, problem?: ProblemDetails, cause?: unknown) {
    super(problem?.detail ?? problem?.title ?? `Request failed (${kind} ${status})`, { cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.problem = problem;
  }

  get traceId(): string | undefined {
    return this.problem?.traceId;
  }

  // ASP.NET keys validation errors by the C# property name ("EngineCapacityCc");
  // normalise to the camelCase the client uses so they can be bound to fields.
  get fieldErrors(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [key, messages] of Object.entries(this.problem?.errors ?? {})) {
      const field = key.replace(/^\$\./, '');
      result[field.charAt(0).toLowerCase() + field.slice(1)] = messages;
    }
    return result;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export async function parseProblem(response: Response): Promise<ProblemDetails | undefined> {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('json')) return undefined;
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null ? body : undefined;
  } catch {
    return undefined;
  }
}
