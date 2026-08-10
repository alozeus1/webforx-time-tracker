export type ErrorContext = {
  source: 'error-boundary' | 'window-error' | 'unhandled-rejection';
  componentStack?: string;
};

export type WebVitalName = 'CLS' | 'INP' | 'LCP';

export type WebVital = {
  name: WebVitalName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
};

export interface ObservabilitySink {
  captureError(error: Error, context: ErrorContext): void;
  captureWebVital(metric: WebVital): void;
}

let sink: ObservabilitySink | null = null;

export const configureObservability = (nextSink: ObservabilitySink | null): void => {
  sink = nextSink;
};

export const captureError = (error: Error, context: ErrorContext): void => {
  try {
    sink?.captureError(error, context);
  } catch (reportingError) {
    console.warn('[Observability] Error reporting failed:', reportingError);
  }
};

const emitWebVital = (metric: WebVital): void => {
  try {
    sink?.captureWebVital(metric);
  } catch (reportingError) {
    console.warn('[Observability] Web-vital reporting failed:', reportingError);
  }
};

export const startObservability = (): (() => void) => {
  // No provider is enabled by default. This prevents observer/listener work, network
  // traffic, and accidental PII capture until an operator deliberately configures a sink.
  if (!sink) return () => undefined;

  let active = true;
  const onError = (event: ErrorEvent) => {
    captureError(event.error instanceof Error ? event.error : new Error('Runtime error'), { source: 'window-error' });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    captureError(event.reason instanceof Error ? event.reason : new Error('Unhandled promise rejection'), { source: 'unhandled-rejection' });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  void import('web-vitals').then(({ onCLS, onINP, onLCP }) => {
    if (!active) return;
    const report = (metric: { name: string; value: number; rating: WebVital['rating'] }) => {
      if (!active) return;
      if (metric.name === 'CLS' || metric.name === 'INP' || metric.name === 'LCP') {
        emitWebVital({ name: metric.name, value: metric.value, rating: metric.rating });
      }
    };
    onCLS(report);
    onINP(report);
    onLCP(report);
  }).catch((error) => {
    console.warn('[Observability] Web-vitals collector could not start:', error);
  });

  return () => {
    active = false;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
};
