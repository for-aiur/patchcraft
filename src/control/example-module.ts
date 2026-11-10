import type { ModuleDefinition } from './visual-modules';

/** Example contributor module: exposes one selected camera feature as a typed scalar. */
export const exampleFeatureSource: ModuleDefinition = {
  id: 'org.patchcraft.example.feature-source', version: 1,
  label: 'Example feature source', description: 'Publishes one camera feature as a scalar signal.', category: 'feature',
  inputs: [], outputs: [{ id: 'value', label: 'Value', type: 'scalar/f32' }],
  parameters: { feature: { type: 'enum', label: 'Feature', default: 'brightness', options: ['brightness', 'red', 'green', 'blue', 'color', 'motion'] } },
  createState: () => ({}), reset: () => ({}),
  process: (_inputs, parameters, state, sample) => {
    const feature = String(parameters.feature);
    const value = sample.features[feature];
    if (!Number.isFinite(value)) throw new Error(`Camera feature '${feature}' is unavailable.`);
    return { outputs: { value: { type: 'scalar/f32', value } }, state: { ...state } };
  },
};

/** Example contributor processor demonstrating named multi-input scalar ports. */
export const exampleWeightedMix: ModuleDefinition = {
  id: 'org.patchcraft.example.weighted-mix', version: 1,
  label: 'Example weighted mix', description: 'Combines two normalized scalar signals with explicit weights.', category: 'signal',
  inputs: [
    { id: 'a', label: 'Signal A', type: 'scalar/f32' },
    { id: 'b', label: 'Signal B', type: 'scalar/f32' },
    { id: 'c', label: 'Signal C', type: 'scalar/f32', required: false },
  ], outputs: [{ id: 'value', label: 'Mixed value', type: 'scalar/f32' }],
  parameters: {
    weightA: { type: 'number', label: 'Signal A weight', default: 0.5, min: 0, max: 1, step: 0.01 },
    weightB: { type: 'number', label: 'Signal B weight', default: 0.5, min: 0, max: 1, step: 0.01 },
    weightC: { type: 'number', label: 'Signal C weight', default: 0, min: 0, max: 1, step: 0.01 },
  },
  createState: () => ({}), reset: () => ({}),
  process: (inputs, parameters, state) => {
    const a = (inputs.a as { value: number }).value;
    const b = (inputs.b as { value: number }).value;
    const c = (inputs.c as { value: number } | undefined)?.value ?? 0;
    const weightA = Number(parameters.weightA), weightB = Number(parameters.weightB), weightC = Number(parameters.weightC);
    const total = weightA + weightB + (inputs.c ? weightC : 0);
    const value = total === 0 ? 0 : (a * weightA + b * weightB + c * weightC) / total;
    return { outputs: { value: { type: 'scalar/f32', value } }, state: { ...state } };
  },
};

/** Example post-mix response module with finite smoothing state. */
export const exampleResponse: ModuleDefinition = {
  id: 'org.patchcraft.example.response', version: 1,
  label: 'Response shaping', description: 'Applies a response curve and time smoothing to a control signal.', category: 'signal',
  inputs: [{ id: 'input', label: 'Combined signal', type: 'scalar/f32' }],
  outputs: [{ id: 'value', label: 'Control value', type: 'scalar/f32' }],
  parameters: {
    curve: { type: 'number', label: 'Response curve', default: 1, min: 0.25, max: 4, step: 0.05 },
    smoothingMs: { type: 'number', label: 'Smoothing', default: 80, min: 0, max: 1000, step: 1, unit: 'ms' },
  },
  createState: () => ({}), reset: () => ({}),
  process: (inputs, parameters, state, sample) => {
    const raw = (inputs.input as { value: number }).value;
    const curved = Math.pow(Math.max(0, Math.min(1, raw)), Number(parameters.curve));
    const previous = typeof state.value === 'number' && typeof state.at === 'number' ? state.value : undefined;
    const elapsed = previous === undefined ? 0 : Math.max(0, sample.at - Number(state.at));
    const ms = Number(parameters.smoothingMs);
    const value = previous === undefined || ms === 0 ? curved : previous + (curved - previous) * (1 - Math.exp(-elapsed / ms));
    return { outputs: { value: { type: 'scalar/f32', value } }, state: { value, at: sample.at } };
  },
};
