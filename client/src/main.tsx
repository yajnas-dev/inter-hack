import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { HttpError } from './shared/api/http';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AuthProvider } from './features/auth/AuthContext';
import { ToastProvider } from './shared/ui/toast';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/cobalt.css';
import './styles/anim-auth.css';

// Server state is cached and de-duplicated: repeat views cost nothing, and a mutation invalidates only
// what it changed. Client errors (4xx) are not retried; network/5xx failures retry twice with backoff.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) => !(error instanceof HttpError && error.status > 0 && error.status < 500) && failures < 2
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
