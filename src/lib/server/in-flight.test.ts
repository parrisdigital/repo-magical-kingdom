import { describe, expect, it, vi } from "vitest";

import { InFlightRegistry } from "./in-flight";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("InFlightRegistry", () => {
  it("coalesces concurrent work by canonical key and removes settled entries", async () => {
    const registry = new InFlightRegistry<string>();
    const work = deferred<string>();
    const operation = vi.fn(() => work.promise);

    const first = registry.run("owner/repo@sha", operation);
    const second = registry.run("owner/repo@sha", operation);
    await Promise.resolve();

    expect(first).toBe(second);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(1);

    work.resolve("world");
    await expect(first).resolves.toBe("world");
    await Promise.resolve();
    expect(registry.size).toBe(0);
  });

  it("does not retain more than its configured number of unique operations", async () => {
    const registry = new InFlightRegistry<string>(1);
    const firstWork = deferred<string>();
    const secondWork = deferred<string>();

    const first = registry.run("first", () => firstWork.promise);
    const second = registry.run("second", () => secondWork.promise);
    expect(registry.size).toBe(1);

    firstWork.resolve("one");
    secondWork.resolve("two");
    await expect(Promise.all([first, second])).resolves.toEqual(["one", "two"]);
  });
});
