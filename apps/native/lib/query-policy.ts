export const LIVE_REFRESH_MS = 30_000;
export const PENDING_REFRESH_MS = 2_000;
export const SETTLEMENT_REFRESH_MS = 15_000;
export const STANDARD_REFRESH_MS = 60_000;

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 1) return false;

  const status = readHttpStatus(error);
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
}

function readHttpStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;

  const directData = error.data;
  if (isRecord(directData) && typeof directData.httpStatus === "number") {
    return directData.httpStatus;
  }

  const shape = error.shape;
  if (isRecord(shape) && isRecord(shape.data) && typeof shape.data.httpStatus === "number") {
    return shape.data.httpStatus;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
