export type RequestDeadline = Readonly<{
  signal: AbortSignal;
  didTimeOut(): boolean;
  dispose(): void;
}>;

export function createRequestDeadline(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): RequestDeadline {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("The request deadline must be positive.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => {
    controller.abort(
      parentSignal?.reason ?? new DOMException("The request was cancelled.", "AbortError"),
    );
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("The route deadline was exceeded.", "TimeoutError"));
  }, timeoutMs);

  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

export async function waitWithSignal<Value>(
  promise: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("The request was cancelled.", "AbortError");
  }

  return await new Promise<Value>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("The request was cancelled.", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
