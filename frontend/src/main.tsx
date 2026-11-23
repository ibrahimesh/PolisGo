import './i18n';
import './styles/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { isApiError } from './api/errors';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
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

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <SettingsProvider>
            <ToastProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ToastProvider>
          </SettingsProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
