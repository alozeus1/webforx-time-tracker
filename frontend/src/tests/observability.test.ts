import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureError, configureObservability, startObservability, type ObservabilitySink } from '../services/observability';

afterEach(() => configureObservability(null));

describe('provider-neutral observability', () => {
  it('is a no-op when no sink is configured', () => {
    const listener = vi.spyOn(window, 'addEventListener');
    expect(() => captureError(new Error('safe'), { source: 'error-boundary' })).not.toThrow();
    startObservability()();
    expect(listener).not.toHaveBeenCalled();
    listener.mockRestore();
  });

  it('captures runtime errors without requiring credentials', () => {
    const sink: ObservabilitySink = { captureError: vi.fn(), captureWebVital: vi.fn() };
    configureObservability(sink);
    const stop = startObservability();
    const error = new Error('runtime failure');
    window.dispatchEvent(new ErrorEvent('error', { error }));
    expect(sink.captureError).toHaveBeenCalledWith(error, { source: 'window-error' });
    stop();
  });

  it('cannot break the app when a configured sink throws', () => {
    configureObservability({
      captureError: () => { throw new Error('vendor unavailable'); },
      captureWebVital: () => { throw new Error('vendor unavailable'); },
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => captureError(new Error('app error'), { source: 'error-boundary' })).not.toThrow();
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });
});
