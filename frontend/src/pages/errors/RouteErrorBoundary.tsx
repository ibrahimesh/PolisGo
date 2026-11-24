import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useLocation } from 'react-router';
import { newTraceId, reportError } from '../../diagnostics/reporter';
import { classifyError } from './errorKind';
import { ErrorPage } from './ErrorPage';

interface BoundaryProps {
  resetKey: string;
  children: ReactNode;
}

interface BoundaryState {
  error: unknown;
  resetKey: string;
  // For a crash with no server trace id: the id reported to the API, whose
  // Reference the page shows (the same value is stored).
  clientTraceId: string | null;
}

// Catches anything a route throws while rendering (a bug, a lazy chunk that
// can't load) and shows the designed error page inside the shell, so the
// header, sidebar and the way home survive. Navigating elsewhere resets it.
class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
    clientTraceId: null,
  };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error: error ?? new Error('Unknown error'), clientTraceId: newTraceId() };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) {
    return props.resetKey !== state.resetKey
      ? { error: null, resetKey: props.resetKey, clientTraceId: null }
      : null;
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    // Development aid only; production shows the page and nothing else.
    if (import.meta.env.DEV) console.error(error, info.componentStack);
    // A server error already has its trace id (and the API its record); a
    // network failure isn't a bug. Anything else is reported under the id
    // the page shows; a repeat of the same crash keeps the first one's id.
    const { kind, traceId } = classifyError(error);
    if (traceId || kind !== 'server' || !this.state.clientTraceId) return;
    const shown = this.state.clientTraceId;
    void reportError(error, 'boundary', { traceId: shown }).then((reported) => {
      // Still the same crash on screen (no navigation since)?
      if (reported !== shown && this.state.clientTraceId === shown) {
        this.setState({ clientTraceId: reported });
      }
    });
  }

  override render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const { kind, traceId } = classifyError(error);
    return (
      <ErrorPage
        kind={kind}
        traceId={
          traceId ?? (kind === 'server' ? (this.state.clientTraceId ?? undefined) : undefined)
        }
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
}
