import { useEffect, useState } from 'react';
import { request } from '../api/http';
import { ErrorNotice } from '../components/ui/ErrorNotice';

// Test-only route (VITE_E2E_ROUTES=true): calls the API's deliberate 500
// (POST /api/diagnostics/test-failure, enabled by the e2e compose override)
// and shows the error as any page would, Reference chip included.
export function ServerErrorPage() {
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    request('/api/diagnostics/test-failure', { method: 'POST' }).catch(setError);
  }, []);
  return (
    <div className="py-12">
      <h1 className="sr-only">Server error test</h1>
      {error !== null && <ErrorNotice error={error} />}
    </div>
  );
}
