export type Calibration = { min: number; max: number; invert: boolean };
export function validateCalibration(value: unknown): Calibration {
  const c = value as Calibration;
  if (!c || typeof c.min !== 'number' || typeof c.max !== 'number' || !Number.isFinite(c.min) || !Number.isFinite(c.max) || c.max <= c.min || typeof c.invert !== 'boolean') throw new Error('Calibration needs finite Min < Max and a boolean Invert.');
  return { min: c.min, max: c.max, invert: c.invert };
}
export function calibrate(value: number, c: Calibration) {
  const normalized = Math.max(0, Math.min(1, (value - c.min) / (c.max - c.min)));
  return c.invert ? 1 - normalized : normalized;
}
