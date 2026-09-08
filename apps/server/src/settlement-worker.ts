import { reconcileCommitmentsBatch } from "@rdm-b2c/api/routers/rdm";

export function startSettlementWorker() {
  let running = false;
  let cursor: string | undefined;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await reconcileCommitmentsBatch(cursor);
      cursor = result.nextCursor;
    } catch (error) {
      console.error("Commitment worker could not run; retrying next minute", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, 60_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
