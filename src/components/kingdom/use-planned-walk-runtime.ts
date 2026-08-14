"use client";

import { useEffect, useMemo, useState } from "react";

import {
  plannedWalkRuntimeKey,
  type PlannedWalkRuntimeInput,
  type PlannedWalkRuntimePlan,
} from "./planned-walk-runtime-model";
import {
  PLANNED_WALK_RUNTIME_WORKER_SCHEMA,
  type PlannedWalkRuntimeWorkerRequest,
  type PlannedWalkRuntimeWorkerResponse,
} from "./planned-walk-runtime-protocol";

const MAX_RESOLVED_WALK_RUNTIME_ENTRIES = 6;
const WALK_RUNTIME_WORKER_TIMEOUT_MS = 20_000;

type WalkRuntimeWorker = Readonly<{
  postMessage: (message: PlannedWalkRuntimeWorkerRequest) => void;
  terminate: () => void;
}> & {
  onmessage: ((event: MessageEvent<PlannedWalkRuntimeWorkerResponse>) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

export type WalkRuntimeWorkerFactory = () => WalkRuntimeWorker;

export type PreparedWalkRuntimeState =
  | Readonly<{ key: string; status: "preparing"; result: null; error: null }>
  | Readonly<{ key: string; status: "ready"; result: PlannedWalkRuntimePlan; error: null }>
  | Readonly<{ key: string; status: "error"; result: null; error: string }>;

const resolvedRuntimeCache = new Map<string, PlannedWalkRuntimePlan>();
const pendingRuntimeCache = new Map<string, Promise<PlannedWalkRuntimePlan>>();
let workerRequestSequence = 0;

function defaultWorkerFactory(): WalkRuntimeWorker {
  return new Worker(new URL("./planned-walk-runtime.worker.ts", import.meta.url), {
    type: "module",
    name: "repository-walk-runtime",
  });
}

function rememberRuntime(key: string, result: PlannedWalkRuntimePlan): void {
  resolvedRuntimeCache.delete(key);
  resolvedRuntimeCache.set(key, result);
  while (resolvedRuntimeCache.size > MAX_RESOLVED_WALK_RUNTIME_ENTRIES) {
    const oldestKey = resolvedRuntimeCache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    resolvedRuntimeCache.delete(oldestKey);
  }
}

export function getCachedPlannedWalkRuntime(key: string): PlannedWalkRuntimePlan | undefined {
  return resolvedRuntimeCache.get(key);
}

/** Clears only the local browser cache; intended for deterministic unit tests. */
export function clearPlannedWalkRuntimeCacheForTests(): void {
  resolvedRuntimeCache.clear();
  pendingRuntimeCache.clear();
  workerRequestSequence = 0;
}

/**
 * Starts one worker request per canonical runtime key. Repeated callers share
 * the promise and completed result, so Orbit prewarming and later Walk toggles
 * never repeat the expensive preparation.
 */
export function preparePlannedWalkRuntime(
  input: PlannedWalkRuntimeInput,
  workerFactory: WalkRuntimeWorkerFactory = defaultWorkerFactory,
): Promise<PlannedWalkRuntimePlan> {
  const key = plannedWalkRuntimeKey(input);
  const cached = getCachedPlannedWalkRuntime(key);
  if (cached) return Promise.resolve(cached);
  const pending = pendingRuntimeCache.get(key);
  if (pending) return pending;

  const requestId = `${key}:${workerRequestSequence}`;
  workerRequestSequence += 1;
  let worker: WalkRuntimeWorker;
  try {
    worker = workerFactory();
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("Walk preparation worker is unavailable."),
    );
  }
  const promise = new Promise<PlannedWalkRuntimePlan>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      worker.terminate();
      action();
    };
    worker.onmessage = ({ data }) => {
      if (data.schema !== PLANNED_WALK_RUNTIME_WORKER_SCHEMA || data.requestId !== requestId) {
        finish(() => reject(new Error("Walk preparation returned an invalid response.")));
        return;
      }
      if (!data.ok) {
        finish(() => reject(new Error(data.error)));
        return;
      }
      if (data.result.key !== key) {
        finish(() => reject(new Error("Walk preparation returned a stale world.")));
        return;
      }
      finish(() => {
        rememberRuntime(key, data.result);
        resolve(data.result);
      });
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new Error(event.message || "Walk preparation worker failed.")));
    };
    worker.onmessageerror = () => {
      finish(() => reject(new Error("Walk preparation data could not be decoded.")));
    };
    timeout = setTimeout(() => {
      finish(() => reject(new Error("Walk preparation timed out.")));
    }, WALK_RUNTIME_WORKER_TIMEOUT_MS);
    try {
      worker.postMessage({
        schema: PLANNED_WALK_RUNTIME_WORKER_SCHEMA,
        requestId,
        input,
      });
    } catch (error) {
      finish(() =>
        reject(
          error instanceof Error ? error : new Error("Walk preparation could not be started."),
        ),
      );
    }
  }).finally(() => {
    pendingRuntimeCache.delete(key);
  });
  pendingRuntimeCache.set(key, promise);
  return promise;
}

/** Prewarms during Orbit and exposes an immutable result when Walk needs it. */
export function usePreparedPlannedWalkRuntime(
  input: PlannedWalkRuntimeInput,
): PreparedWalkRuntimeState {
  const key = useMemo(() => plannedWalkRuntimeKey(input), [input]);
  const cached = getCachedPlannedWalkRuntime(key);
  const [state, setState] = useState<PreparedWalkRuntimeState>(() =>
    cached
      ? { key, status: "ready", result: cached, error: null }
      : { key, status: "preparing", result: null, error: null },
  );

  useEffect(() => {
    let active = true;
    const current = getCachedPlannedWalkRuntime(key);
    if (current) {
      queueMicrotask(() => {
        if (active) setState({ key, status: "ready", result: current, error: null });
      });
      return () => {
        active = false;
      };
    }
    void preparePlannedWalkRuntime(input).then(
      (result) => {
        if (active) setState({ key, status: "ready", result, error: null });
      },
      (error: unknown) => {
        if (!active) return;
        setState({
          key,
          status: "error",
          result: null,
          error: error instanceof Error ? error.message : "Walk preparation failed.",
        });
      },
    );
    return () => {
      active = false;
    };
  }, [input, key]);

  if (cached) return { key, status: "ready", result: cached, error: null };
  if (state.key === key) return state;
  return { key, status: "preparing", result: null, error: null };
}
