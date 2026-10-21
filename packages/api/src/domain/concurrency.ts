export async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  limit: number,
  map: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (items.length === 0) return [];
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Concurrency limit must be a positive integer");
  }

  const results = new Array<Output>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index]!, index);
    }
  }));

  return results;
}
