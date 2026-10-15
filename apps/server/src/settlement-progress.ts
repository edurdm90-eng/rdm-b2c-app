export type SettlementBatchResult = {
  failed: number;
  failedIds?: string[];
  nextCursor?: string;
  processed: number;
  recordIds?: string[];
};

export const MAX_SETTLEMENT_FAILURE_ATTEMPTS = 5;

type SettlementSweepDependencies = {
  beforeAdvance?(result: SettlementBatchResult): Promise<void>;
  loadCursor(name: string): Promise<string | undefined>;
  runBatch(cursor?: string): Promise<SettlementBatchResult>;
  saveCursor(name: string, cursor?: string): Promise<void>;
};

export async function advancePersistedSettlementSweep(
  name: string,
  dependencies: SettlementSweepDependencies,
) {
  const cursor = await dependencies.loadCursor(name);
  const result = await dependencies.runBatch(cursor);
  await dependencies.beforeAdvance?.(result);
  await dependencies.saveCursor(name, result.nextCursor);
  return {
    ...result,
    complete: !result.nextCursor,
  };
}

export function nextSettlementFailureState(attempts: number) {
  const nextAttempts = attempts + 1;
  return {
    attempts: nextAttempts,
    status: nextAttempts >= MAX_SETTLEMENT_FAILURE_ATTEMPTS
      ? "quarantined" as const
      : "pending" as const,
  };
}
