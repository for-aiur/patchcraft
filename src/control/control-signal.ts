import { calibrate, validateCalibration, type Calibration } from './calibration.ts';

export type ControlSignalInput = {
  id: string;
  source: string;
  weight: number;
  calibration: Calibration;
};

export type ControlSignal = {
  id: string;
  name: string;
  enabled: boolean;
  smoothingMs: number;
  inputs: ControlSignalInput[];
};

export type ControlSignalState = { value?: number; at?: number };

export function validateControlSignal(value: unknown): ControlSignal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Control Signal must be an object.');
  const signal = value as ControlSignal;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(signal.id) || typeof signal.name !== 'string' || !signal.name.trim() || signal.name.length > 80) throw new Error('Control Signal needs a valid ID and name.');
  if (typeof signal.enabled !== 'boolean' || !Number.isFinite(signal.smoothingMs) || signal.smoothingMs < 0 || signal.smoothingMs > 1000) throw new Error(`Invalid settings for Control Signal '${signal.name}'.`);
  if (!Array.isArray(signal.inputs) || signal.inputs.length < 1 || signal.inputs.length > 8) throw new Error(`Control Signal '${signal.name}' needs between 1 and 8 inputs.`);
  const ids = new Set<string>();
  const inputs = signal.inputs.map(input => {
    if (!input || !/^[a-zA-Z0-9_-]{1,40}$/.test(input.id) || ids.has(input.id) || typeof input.source !== 'string' || input.source.length > 160 || !Number.isFinite(input.weight) || input.weight < 0 || input.weight > 1) throw new Error(`Invalid input in Control Signal '${signal.name}'.`);
    ids.add(input.id);
    return { id: input.id, source: input.source, weight: input.weight, calibration: validateCalibration(input.calibration) };
  });
  return { id: signal.id, name: signal.name.trim(), enabled: signal.enabled, smoothingMs: signal.smoothingMs, inputs };
}

export function evaluateControlSignal(
  signal: ControlSignal,
  read: (source: string) => number | undefined,
  at: number,
  state: ControlSignalState,
) {
  if (!Number.isFinite(at) || (state.at !== undefined && at <= state.at)) throw new Error('Control Signal samples must have increasing finite timestamps.');
  const connected = signal.inputs.filter(input => input.source && input.weight > 0);
  const totalWeight = connected.reduce((sum, input) => sum + input.weight, 0);
  const weighted = connected.reduce((sum, input) => {
    const value = read(input.source);
    return sum + (value === undefined || !Number.isFinite(value) ? 0 : calibrate(value, input.calibration)) * input.weight;
  }, 0);
  const raw = signal.enabled && totalWeight > 0 ? weighted / totalWeight : 0;
  const alpha = signal.smoothingMs === 0 || state.value === undefined || state.at === undefined
    ? 1
    : 1 - Math.exp(-Math.max(0, at - state.at) / signal.smoothingMs);
  const value = state.value === undefined ? raw : state.value + alpha * (raw - state.value);
  state.value = value;
  state.at = at;
  return value;
}
