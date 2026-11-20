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
