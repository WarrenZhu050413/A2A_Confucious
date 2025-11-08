import React, { Component, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, errorInfo: React.ErrorInfo, reset: () => void) => ReactNode);
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * ErrorBoundary component that catches JavaScript errors in child components.
 *
 * Limitations:
 * - Does NOT catch errors in event handlers (use try-catch instead)
 * - Does NOT catch errors in async code (use try-catch or error handling)
 * - Does NOT catch errors in the error boundary itself
 * - Does NOT catch errors during server-side rendering
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * @example With custom fallback
 * ```tsx
 * <ErrorBoundary fallback={(error, errorInfo, reset) => (
 *   <div>
 *     <h1>Error: {error.message}</h1>
 *     <button onClick={reset}>Try again</button>
 *   </div>
 * )}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error details to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Update state with error info for fallback component
    this.setState({
      errorInfo,
    });

    // Here you could also log to an error reporting service
    // logErrorToService(error, errorInfo);
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Render custom fallback if provided
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          // errorInfo might not be available yet on first render after error
          return this.props.fallback(
            this.state.error,
            this.state.errorInfo ?? { componentStack: '', digest: null },
            this.reset
          );
        }
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className={styles.errorBoundary} role="alert">
          <div className={styles.errorContainer}>
            <h2 className={styles.errorTitle}>Something went wrong</h2>
            <details className={styles.errorDetails}>
              <summary>Error details</summary>
              <div className={styles.errorMessage}>
                <strong>Error:</strong> {this.state.error.message}
              </div>
              {this.state.error.stack && (
                <pre className={styles.errorStack}>{this.state.error.stack}</pre>
              )}
              {this.state.errorInfo?.componentStack && (
                <div className={styles.componentStack}>
                  <strong>Component Stack:</strong>
                  <pre>{this.state.errorInfo.componentStack}</pre>
                </div>
              )}
            </details>
            <button onClick={this.reset} className={styles.resetButton}>
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
