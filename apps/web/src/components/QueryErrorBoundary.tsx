import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { Component, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";

interface InnerProps {
  message: string;
  onReset: () => void;
  children: ReactNode;
}

interface InnerState {
  hasError: boolean;
}

class ErrorBoundaryInner extends Component<InnerProps, InnerState> {
  override state: InnerState = { hasError: false };

  static getDerivedStateFromError(): InnerState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          message={this.props.message}
          onRetry={() => {
            this.props.onReset();
            this.setState({ hasError: false });
          }}
        />
      );
    }
    return this.props.children;
  }
}

interface QueryErrorBoundaryProps {
  message: string;
  children: ReactNode;
}

/** Catches errors thrown by `useSuspenseQuery` (network/RLS failures) and
 * renders the page's `ErrorState` in their place, with Retry wired to
 * TanStack Query's own reset boundary — `reset()` clears the cached error so
 * the query re-suspends and refetches on remount, rather than immediately
 * re-throwing the same failure (REFACTOR_PLAN.md Phase 8: useSuspenseQuery
 * migration replaces each page's manual `isError` + `.refetch()` wiring). */
export function QueryErrorBoundary({ message, children }: QueryErrorBoundaryProps) {
  const { reset } = useQueryErrorResetBoundary();
  return (
    <ErrorBoundaryInner message={message} onReset={reset}>
      {children}
    </ErrorBoundaryInner>
  );
}
