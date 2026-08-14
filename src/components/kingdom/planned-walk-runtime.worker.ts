import { createPlannedWalkRuntimePlan } from "./planned-walk-runtime-model";
import {
  PLANNED_WALK_RUNTIME_WORKER_SCHEMA,
  type PlannedWalkRuntimeWorkerRequest,
  type PlannedWalkRuntimeWorkerResponse,
} from "./planned-walk-runtime-protocol";

type PlannedWalkRuntimeWorkerHost = Readonly<{
  postMessage: (message: PlannedWalkRuntimeWorkerResponse, transfer?: Transferable[]) => void;
}> & {
  onmessage: ((event: MessageEvent<PlannedWalkRuntimeWorkerRequest>) => void) | null;
};

const workerHost = globalThis as unknown as PlannedWalkRuntimeWorkerHost;

workerHost.onmessage = ({ data }) => {
  if (data.schema !== PLANNED_WALK_RUNTIME_WORKER_SCHEMA) return;
  try {
    const result = createPlannedWalkRuntimePlan(data.input);
    workerHost.postMessage(
      {
        schema: PLANNED_WALK_RUNTIME_WORKER_SCHEMA,
        requestId: data.requestId,
        ok: true,
        result,
      },
      [
        result.navigationGrid.allowed.buffer as ArrayBuffer,
        result.navigationGrid.heights.buffer as ArrayBuffer,
      ],
    );
  } catch (error) {
    workerHost.postMessage({
      schema: PLANNED_WALK_RUNTIME_WORKER_SCHEMA,
      requestId: data.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Walk preparation failed.",
    });
  }
};

export {};
