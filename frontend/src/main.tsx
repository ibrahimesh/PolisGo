import './i18n';
import './styles/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isApiError } from './api/errors';
import { App } from './App';
import { installGlobalErrorReporting } from './diagnostics/reporter';
import { AuthProvider } from './auth/AuthProvider';
import { MotionRouter } from './motion/MotionRouter';
import { ToastProvider } from './components/ui/ToastProvider';
import { SettingsProvider } from './settings/SettingsProvider';
import { ThemeProvider } from './theme/ThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry transient network failures once; an HTTP error is an answer, not a blip.
      retry: (failureCount, error) =>
        failureCount < 1 && isApiError(error) && error.kind === 'network',
      refetchOnWindowFocus: false,
    },
  },
});

// Uncaught errors and rejections go to the System section (see reporter).
installGlobalErrorReporting();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MotionRouter>
          <SettingsProvider>
            <ToastProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ToastProvider>
          </SettingsProvider>
        </MotionRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
