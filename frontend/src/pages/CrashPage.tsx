// Test-only route (VITE_E2E_ROUTES=true): throws while rendering so the e2e
// suite can see the route error boundary. Never registered otherwise.
export function CrashPage(): never {
  throw new Error('Deliberate crash for the error boundary test.');
}
