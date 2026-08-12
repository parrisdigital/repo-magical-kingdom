import { afterEach, describe, expect, it, vi } from "vitest";

import { createRequestDeadline, waitWithSignal } from "./request-deadline";

afterEach(() => vi.useRealTimers());

describe("request deadlines", () => {
  it("aborts once at the route deadline and reports timeout provenance", async () => {
    vi.useFakeTimers();
    const deadline = createRequestDeadline(undefined, 1_000);
    const pending = waitWithSignal(new Promise<never>(() => undefined), deadline.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.didTimeOut()).toBe(true);
    await rejection;
    deadline.dispose();
  });

  it("propagates caller cancellation without classifying it as a timeout", () => {
    const caller = new AbortController();
    const deadline = createRequestDeadline(caller.signal, 1_000);
    caller.abort();

    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.didTimeOut()).toBe(false);
    deadline.dispose();
  });
});
