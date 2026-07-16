import { DEFAULT_READ_TIMEOUT_MS } from './api/GraphQLClient';

/**
 * `fetch` with a client-side timeout. Raw `fetch` (unlike GraphQLClient and
 * ApiClient) has no timeout, so a degraded backend leaves a REST read — the
 * `/api/screener`, `/api/curated-presets`, and `/tickers` calls behind the
 * portfolio/market widgets — pending until the browser's own (multi-minute)
 * default, which the UI shows as an indefinite spinner. This aborts the fetch
 * after `timeoutMs` and rejects with a DOMException named `TimeoutError`
 * (which the React Query retry predicate treats as non-retryable, so the
 * failure surfaces immediately instead of re-hanging).
 *
 * An externally-supplied `init.signal` (e.g. React Query's cancellation
 * signal) is honored too: if it aborts first, so does the request.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_READ_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const abortAsTimeout = () =>
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  const timer = setTimeout(abortAsTimeout, timeoutMs);

  // Compose with any caller-provided signal so unmount/cancel still aborts.
  const external = init.signal;
  if (external) {
    if (external.aborted) {
      controller.abort(external.reason);
    } else {
      external.addEventListener('abort', () => controller.abort(external.reason), {
        once: true,
      });
    }
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}
