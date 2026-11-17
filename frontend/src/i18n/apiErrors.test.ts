/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serverMessageKey } from './apiErrors';
import en from './locales/en.json';

// Contract test across the stack: every account-validation message the API
// can return (AuthValidation.Messages in C#) must map to a translated key, so
// a server 400 never reaches the user as untranslated English or a generic error.
// Vitest runs from frontend/, so the API source is one level up.
const csharp = readFileSync(
  resolve(process.cwd(), '../src/PolisGo.Application/Auth/AuthValidation.cs'),
  'utf8',
);
const serverMessages = [...csharp.matchAll(/public const string \w+ =\s*"([^"]+)";/g)].map(
  (m) => m[1] ?? '',
);

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en);
}

describe('server validation messages', () => {
  it('finds the messages in AuthValidation.cs', () => {
    expect(serverMessages.length).toBeGreaterThanOrEqual(13);
  });

  it.each(serverMessages)('maps "%s" to an existing translation', (message) => {
    const key = serverMessageKey(message);
    expect(key, `no mapping for: ${message}`).toBeDefined();
    expect(typeof lookup(key ?? '')).toBe('string');
  });
});
