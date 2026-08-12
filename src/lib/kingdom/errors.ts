export const KINGDOM_ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "PRIVATE_REPOSITORY",
  "EMPTY_REPOSITORY",
  "GITHUB_RATE_LIMITED",
  "GITHUB_TIMEOUT",
  "GITHUB_UNAVAILABLE",
  "GITHUB_RESPONSE_INVALID",
  "SOURCE_TOO_LARGE",
  "ABORTED",
  "WORLD_INVALID",
  "INTERNAL_ERROR",
] as const;

export type KingdomErrorCode = (typeof KINGDOM_ERROR_CODES)[number];

type KingdomErrorOptions = Readonly<{
  status?: number;
  retryable?: boolean;
  cause?: unknown;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}>;

const DEFAULT_STATUS: Readonly<Record<KingdomErrorCode, number>> = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  PRIVATE_REPOSITORY: 403,
  EMPTY_REPOSITORY: 409,
  GITHUB_RATE_LIMITED: 429,
  GITHUB_TIMEOUT: 504,
  GITHUB_UNAVAILABLE: 502,
  GITHUB_RESPONSE_INVALID: 502,
  SOURCE_TOO_LARGE: 422,
  ABORTED: 499,
  WORLD_INVALID: 500,
  INTERNAL_ERROR: 500,
};

export class KingdomError extends Error {
  readonly code: KingdomErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;

  constructor(code: KingdomErrorCode, message: string, options: KingdomErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "KingdomError";
    this.code = code;
    this.status = options.status ?? DEFAULT_STATUS[code];
    this.retryable = options.retryable ?? code.startsWith("GITHUB_");
    this.details = options.details;
  }
}

export function toKingdomError(error: unknown): KingdomError {
  if (error instanceof KingdomError) return error;

  return new KingdomError("INTERNAL_ERROR", "The kingdom could not be forged.", {
    cause: error,
    retryable: false,
  });
}
