import type { PlannedWalkRuntimeInput, PlannedWalkRuntimePlan } from "./planned-walk-runtime-model";

export const PLANNED_WALK_RUNTIME_WORKER_SCHEMA = "repo-walk-runtime-worker/v2" as const;

export type PlannedWalkRuntimeWorkerRequest = Readonly<{
  schema: typeof PLANNED_WALK_RUNTIME_WORKER_SCHEMA;
  requestId: string;
  input: PlannedWalkRuntimeInput;
}>;

export type PlannedWalkRuntimeWorkerResponse =
  | Readonly<{
      schema: typeof PLANNED_WALK_RUNTIME_WORKER_SCHEMA;
      requestId: string;
      ok: true;
      result: PlannedWalkRuntimePlan;
    }>
  | Readonly<{
      schema: typeof PLANNED_WALK_RUNTIME_WORKER_SCHEMA;
      requestId: string;
      ok: false;
      error: string;
    }>;
