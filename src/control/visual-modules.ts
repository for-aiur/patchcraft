/** Typed contracts for source-controlled visual processing modules. Recipes store only module IDs and data. */
export type PortType = 'image/rgba8' | 'mask/u8' | 'scalar/f32' | 'vector2/f32';
export type ModuleCategory = 'image' | 'feature' | 'signal' | 'output';
export type PortSpec = { id: string; label: string; type: PortType; required?: boolean };
export type ParameterSpec = {
  type: 'number' | 'boolean' | 'string' | 'enum';
  default: number | boolean | string;
  label: string;
  description?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};
export type ModuleState = Record<string, number | boolean | string | null>;
export type GraphValue =
  | { type: 'scalar/f32'; value: number }
  | { type: 'vector2/f32'; x: number; y: number }
  | { type: 'mask/u8'; width: number; height: number; data: Uint8Array }
  | { type: 'image/rgba8'; width: number; height: number; data: Uint8ClampedArray };
export type ModuleDefinition = {
  id: string;
  version: number;
  label: string;
  description: string;
  category: ModuleCategory;
  inputs: PortSpec[];
  outputs: PortSpec[];
  parameters: Record<string, ParameterSpec>;
  createState(): ModuleState;
  reset(state: ModuleState): ModuleState;
  process(
    inputs: Readonly<Record<string, GraphValue>>,
    parameters: Readonly<Record<string, number | boolean | string>>,
    state: Readonly<ModuleState>,
    sample: { at: number; features: Readonly<Record<string, number>> },
  ): { outputs: Record<string, GraphValue>; state: ModuleState };
  dispose?(state: ModuleState): void;
};

export class ModuleRegistry {
  private definitions = new Map<string, ModuleDefinition>();

  register(definition: ModuleDefinition) {
    validateDefinition(definition);
    if (this.definitions.has(definition.id)) throw new Error(`Module '${definition.id}' is already registered.`);
    this.definitions.set(definition.id, definition);
    return this;
  }

  get(id: string, version?: number) {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown module '${id}'. Add its implementation to the compiled module registry.`);
    if (version !== undefined && definition.version !== version) {
      throw new Error(`Module '${id}' version ${version} is unavailable; this build provides version ${definition.version}.`);
    }
    return definition;
  }

  list() { return [...this.definitions.values()]; }
}

export function validateDefinition(module: ModuleDefinition) {
  if (!/^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/.test(module.id) || !Number.isInteger(module.version) || module.version < 1) throw new Error('Module IDs must be stable reverse-domain names and versions must be positive integers.');
  if (!module.label.trim() || !module.description.trim()) throw new Error(`Module '${module.id}' needs a label and description.`);
  if (!['image', 'feature', 'signal', 'output'].includes(module.category)) throw new Error(`Module '${module.id}' has an invalid category.`);
  const portIds = new Set<string>();
  for (const port of [...module.inputs, ...module.outputs]) {
    if (!/^[a-z][a-zA-Z0-9]{0,39}$/.test(port.id) || !port.label.trim() || portIds.has(port.id) || !['image/rgba8', 'mask/u8', 'scalar/f32', 'vector2/f32'].includes(port.type)) throw new Error(`Module '${module.id}' has an invalid or duplicate port.`);
    portIds.add(port.id);
  }
  for (const [key, parameter] of Object.entries(module.parameters)) {
    if (!/^[a-z][a-zA-Z0-9]{0,39}$/.test(key) || !parameter.label.trim()) throw new Error(`Module '${module.id}' has an invalid parameter definition.`);
    if (parameter.type === 'number' && (typeof parameter.default !== 'number' || !Number.isFinite(parameter.default) || !Number.isFinite(parameter.min) || !Number.isFinite(parameter.max) || parameter.min! > parameter.default || parameter.default > parameter.max!)) throw new Error(`Module '${module.id}' parameter '${key}' needs valid numeric bounds and a default.`);
    if (parameter.type === 'enum' && (typeof parameter.default !== 'string' || !parameter.options?.includes(parameter.default))) throw new Error(`Module '${module.id}' enum '${key}' needs options containing its default.`);
  }
}
