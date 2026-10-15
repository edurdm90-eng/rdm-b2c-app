export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
) {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abortFromCaller = () => {
    controller.abort(callerSignal?.reason ?? new Error("Request cancelled"));
  };

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
