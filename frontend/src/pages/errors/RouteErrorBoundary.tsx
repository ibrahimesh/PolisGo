import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useLocation } from 'react-router';
import { classifyError } from './errorKind';
import { ErrorPage } from './ErrorPage';

interface BoundaryProps {
  resetKey: string;
  children: ReactNode;
}

interface BoundaryState {
  error: unknown;
  resetKey: string;
}

// Catches anything a route throws while rendering (a bug, a lazy chunk that
// can't load) and shows the designed error page inside the shell, so the
// header, sidebar and the way home survive. Navigating elsewhere resets it.
class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error: error ?? new Error('Unknown error') };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    // Development aid only; production shows the page and nothing else.
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const { kind, traceId } = classifyError(error);
    return (
      <ErrorPage
        kind={kind}
        traceId={traceId}
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
}
