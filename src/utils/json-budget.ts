const DEFAULT_JSON_BUDGET = 25_000;

/**
 * Serialize a budgeted slice of `items` as a single valid JSON string.
 *
 * Accumulates whole items until adding the next would exceed `budget` (always
 * keeps at least one), then hands the retained items to `build` to assemble the
 * output object. When items are dropped, a `truncated` summary is passed so the
 * caller can embed it INSIDE the object — keeping the output parseable, rather
 * than appending a human-readable note after the JSON.
 */
export function budgetedJson<T>(
  items: T[],
  build: (
    kept: T[],
    truncated: { shown: number; total: number; note: string } | null
  ) => unknown,
  budget: number = DEFAULT_JSON_BUDGET
): string {
  const kept: T[] = [];
  let size = 0;
  for (const item of items) {
    const entrySize = JSON.stringify(item).length;
    if (kept.length > 0 && size + entrySize > budget) break;
    kept.push(item);
    size += entrySize;
  }

  const truncated =
    kept.length < items.length
      ? {
          shown: kept.length,
          total: items.length,
          note: `output capped at ~${Math.round(budget / 1000)}KB; narrow filters or use format:summary`,
        }
      : null;

  return JSON.stringify(build(kept, truncated), null, 2);
}
