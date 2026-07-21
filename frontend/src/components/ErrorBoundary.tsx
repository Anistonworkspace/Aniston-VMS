import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="bg-card shadow-soft p-8 max-w-md text-center">
          <h1 className="text-2xl font-heading text-ink mb-2">Something went wrong</h1>
          <p className="text-sm text-secondary mb-4">{this.state.error?.message ?? 'Unknown error'}</p>
          <button onClick={() => location.reload()} className="bg-sage text-white hover:bg-sage-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage">Reload</button>
        </div>
      </div>
    );
  }
}
