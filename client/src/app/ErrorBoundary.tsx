import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Last line of defence: a render error shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="notfound">
        <h1>Something went wrong</h1>
        <p className="muted">An unexpected error occurred. Your data is safe.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.assign('/')}>
          Back to home
        </button>
      </div>
    );
  }
}
