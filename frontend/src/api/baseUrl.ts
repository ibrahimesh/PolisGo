// The API's origin, from VITE_API_BASE_URL (the compose stack by default).
// Its own module so the error reporter can use it without importing http.ts,
// which reports to the reporter.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(
  /\/+$/,
  '',
);
