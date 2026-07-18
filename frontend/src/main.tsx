import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store } from './app/store';
import { AppRouter } from './router/AppRouter';
import { AuthBoot } from './features/auth/AuthBoot';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <AuthBoot>
          <AppRouter />
        </AuthBoot>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      </Provider>
    </ErrorBoundary>
  </StrictMode>
);
