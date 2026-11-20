// Pareto dominance between result groups (see docs/eval-report.md).
// A dominates B when A is no more expensive, at least as strong on every
// resource both groups declare, strictly better somewhere, and at least one
// resource is comparable at all.
export const resourceKeys = ["cpu", "ram", "disk"];
const known = (value) => value !== null && value !== undefined;

export function dominates(a, b) {
  if (!(a.min <= b.min)) return false;
  let comparable = 0,
    strict = a.min < b.min;
  for (const key of resourceKeys) {
    if (!known(a[key]) || !known(b[key])) continue;
    comparable++;
    if (a[key] < b[key]) return false;
    if (a[key] > b[key]) strict = true;
  }
  return comparable > 0 && strict;
}

// Pairs where a later (lower-ranked) group dominates an earlier one.
export function paretoViolations(groups) {
  const found = [];
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++)
      if (dominates(groups[j], groups[i]))
        found.push({ above: groups[i].id, below: groups[j].id });
  return found;
}

// Input sorted by `min` ascending. A violation needs A.min <= B.min with B
// ranked first, so it can only occur between equal prices. Within each
// equal-price block, repeatedly take the first group no remaining group
// dominates. Only partially unknown resources can form a dominance cycle; the
// block then keeps its incoming order for the rest.
export function paretoOrder(sorted) {
  const out = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j < sorted.length && sorted[j].min === sorted[i].min) j++;
    const block = sorted.slice(i, j);
    while (block.length) {
      let k = block.findIndex(
        (g) => !block.some((h) => h !== g && dominates(h, g)),
      );
      if (k < 0) k = 0;
      out.push(block.splice(k, 1)[0]);
    }
    i = j;
  }
  return out;
}
