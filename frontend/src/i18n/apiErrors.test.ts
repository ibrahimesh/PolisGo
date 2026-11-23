/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiError } from '../api/errors';
import { describeError, serverMessageKey } from './apiErrors';
import en from './locales/en.json';

// Contract test across the stack: every validation message the API can return
// from the shared rule classes (AuthValidation.Messages, VehicleValidation.Messages,
// PolicyValidation.Messages in C#) must map to a translated key, so a server
// 400 never reaches the user as untranslated English or a generic error.
// Vitest runs from frontend/, so the API source is one level up.
const SOURCES = [
  'Auth/AuthValidation.cs',
  'Vehicles/VehicleValidation.cs',
  'Policies/PolicyValidation.cs',
  'Claims/ClaimValidation.cs',
  'Admin/AdminValidation.cs',
];

function messagesIn(file: string): string[] {
  const csharp = readFileSync(resolve(process.cwd(), '../src/PolisGo.Application', file), 'utf8');
  return [...csharp.matchAll(/public const string \w+ =\s*"([^"]+)";/g)].map((m) => m[1] ?? '');
}

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en);
}

describe.each(SOURCES)('server validation messages in %s', (file) => {
  const serverMessages = messagesIn(file);

  it('finds the messages', () => {
    expect(serverMessages.length).toBeGreaterThanOrEqual(5);
  });

  it.each(serverMessages)('maps "%s" to an existing translation', (message) => {
    const key = serverMessageKey(message);
    expect(key, `no mapping for: ${message}`).toBeDefined();
    expect(typeof lookup(key ?? '')).toBe('string');
  });
});

// The brute-force limits answer 429 (RateLimiting.cs). On the sign-in form,
// whose 401 means "wrong password", the user must read "too many attempts",
// in their language, with the trace id.
describe('a 429 from the rate limits', () => {
  const tooMany = new ApiError('http', 429, {
    status: 429,
    title: 'Too many requests',
    detail: 'Too many attempts. Wait a few minutes and try again.',
    traceId: '00-abc-def-00',
  });

  it('shows the translated "too many attempts" message, even on the sign-in form', () => {
    const described = describeError(tooMany, { 401: 'errors.invalidCredentials' });
    expect(described.messageKey).toBe('errors.tooManyAttempts');
    expect(described.traceId).toBe('00-abc-def-00');
    expect(lookup('errors.tooManyAttempts')).toBe(
      'Too many attempts. Wait a few minutes and try again.',
    );
  });
});
