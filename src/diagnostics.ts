// Bounded software timing summaries; these do not measure physical latency.
export function distribution(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (p: number) => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
  return { count: sorted.length, min: at(0), median: at(0.5), p95: at(0.95), max: at(1) };
}
