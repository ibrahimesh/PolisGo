/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  // 'true' only for the e2e dev server: adds test-only routes (/__e2e/crash).
  readonly VITE_E2E_ROUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
