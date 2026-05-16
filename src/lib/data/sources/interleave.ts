/**
 * Round-robin interleave across groups until `total` items have been taken.
 * Single group → fast path (`slice`). Empty / exhausted groups are skipped.
 *
 * Per design/04-data-sources.md → "Interleaving": "group items by source,
 * then round-robin across sources until you have `count` items."
 */
export function interleave<T>(groups: T[][], total: number): T[] {
  if (groups.length === 0 || total <= 0) return [];
  if (groups.length === 1) return groups[0].slice(0, total);

  const out: T[] = [];
  let idx = 0;
  while (out.length < total) {
    let added = false;
    for (const group of groups) {
      if (group.length > idx) {
        out.push(group[idx]);
        added = true;
        if (out.length >= total) return out;
      }
    }
    if (!added) break; // every group exhausted
    idx++;
  }
  return out;
}
