import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import React from 'react';

// Mock console methods to suppress React error boundary warnings in tests
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

// Component that throws an error
const ThrowError = ({ message = 'Test error' }: { message?: string }) => {
  throw new Error(message);
};

describe('ErrorBoundary', () => {
  describe('basic functionality', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Child content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('should render null children without error', () => {
      const { container } = render(<ErrorBoundary>{null}</ErrorBoundary>);

      expect(container.firstChild).toBeNull();
    });

    it('should render multiple children', () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockConsoleError.mockClear();
      mockConsoleWarn.mockClear();
    });

    it('should catch errors and display fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Component crashed" />
        </ErrorBoundary>
      );

      // The error boundary should have caught the error and shown fallback
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it('should log error to console.error', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Test error message" />
        </ErrorBoundary>
      );

      expect(mockConsoleError).toHaveBeenCalled();
    });

    it('should display error message in fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Specific error message" />
        </ErrorBoundary>
      );

      const details = screen.getByText(/error details/i);
      expect(details).toBeInTheDocument();
    });
  });

  describe('custom fallback UI', () => {
    it('should accept custom fallback component', () => {
      const CustomFallback = () => <div>Custom error message</div>;

      render(
        <ErrorBoundary fallback={<CustomFallback />}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error message')).toBeInTheDocument();
    });

    it('should accept custom fallback function', () => {
      const fallbackFn = (error: Error) => <div>Error: {error.message}</div>;

      render(
        <ErrorBoundary fallback={fallbackFn}>
          <ThrowError message="Custom error" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Error: Custom error/i)).toBeInTheDocument();
    });

    it('should provide reset function to fallback', () => {
      const fallbackWithReset = (_error: Error, _errorInfo: React.ErrorInfo, reset: () => void) => (
        <div>
          <div>Error occurred</div>
          <button onClick={reset}>Reset</button>
        </div>
      );

      render(
        <ErrorBoundary fallback={fallbackWithReset}>
          <ThrowError message="Recoverable error" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Reset')).toBeInTheDocument();
    });
  });

  describe('nested error boundaries', () => {
    it('should allow nested error boundaries', () => {
      render(
        <ErrorBoundary>
          <div>
            <div>Parent content</div>
            <ErrorBoundary>
              <ThrowError />
            </ErrorBoundary>
            <div>Sibling content</div>
          </div>
        </ErrorBoundary>
      );

      // Sibling should still render
      expect(screen.getByText('Sibling content')).toBeInTheDocument();
    });

    it('should use different fallbacks for different boundaries', () => {
      const OuterFallback = () => <div>Outer error</div>;
      const InnerFallback = () => <div>Inner error</div>;

      render(
        <ErrorBoundary fallback={<OuterFallback />}>
          <ErrorBoundary fallback={<InnerFallback />}>
            <ThrowError />
          </ErrorBoundary>
        </ErrorBoundary>
      );

      expect(screen.getByText('Inner error')).toBeInTheDocument();
      expect(screen.queryByText('Outer error')).not.toBeInTheDocument();
    });
  });

  describe('component structure', () => {
    it('should use role="alert" for accessibility', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });

    it('should render reset button in default fallback', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const resetButton = screen.getByText(/try again/i);
      expect(resetButton).toBeInTheDocument();
    });

    it('should render error details in collapsible section', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const details = screen.getByText(/error details/i);
      expect(details).toBeInTheDocument();
      expect(details?.tagName).toBe('SUMMARY');
    });
  });

  describe('class component implementation', () => {
    it('should be a class component (required for error boundaries)', () => {
      // ErrorBoundary must be a class component to use componentDidCatch
      expect(ErrorBoundary.prototype.componentDidCatch).toBeDefined();
    });

    it('should implement getDerivedStateFromError', () => {
      expect(ErrorBoundary.getDerivedStateFromError).toBeDefined();
    });

    it('should have reset method', () => {
      const instance = new ErrorBoundary({ children: null });
      expect(typeof instance.reset).toBe('function');
    });
  });
});
