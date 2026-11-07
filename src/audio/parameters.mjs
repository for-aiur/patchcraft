// Shared by the audio engine and deterministic parameter tests.
export function bounded(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function mixGains(wet, bypass) {
  const mix = bypass ? 0 : bounded(wet, 0, 1, 0);
  return { dry: 1 - mix, wet: mix };
}

export function decibelsToGain(db) {
  return 10 ** (bounded(db, -60, -6, -24) / 20);
}
