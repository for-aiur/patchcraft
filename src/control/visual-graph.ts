import { ModuleRegistry, type GraphValue, type ModuleDefinition, type ModuleState } from './visual-modules.ts';

export type VisualNode = { id: string; module: string; version: number; parameters?: Record<string, number | boolean | string> };
export type VisualEdge = { from: string; output: string; to: string; input: string };
export type VisualGraph = { schemaVersion: 1; nodes: VisualNode[]; edges: VisualEdge[] };
export type VisualSample = { at: number; features: Readonly<Record<string, number>> };

const MAX_NODES = 64;
const MAX_EDGES = 128;
const MAX_PIXELS = 640 * 480;

function parameterValues(module: ModuleDefinition, input: unknown) {
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new Error(`Parameters for '${module.id}' must be an object.`);
  const provided = (input ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(provided)) if (!Object.hasOwn(module.parameters, key)) throw new Error(`Unknown parameter '${key}' for module '${module.id}'.`);
  const values: Record<string, number | boolean | string> = {};
  for (const [key, spec] of Object.entries(module.parameters)) {
    const value = provided[key] ?? spec.default;
    if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min! || value > spec.max!)) throw new Error(`Parameter '${module.id}.${key}' is outside its allowed range.`);
    if (spec.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Parameter '${module.id}.${key}' must be boolean.`);
    if (spec.type === 'string' && typeof value !== 'string') throw new Error(`Parameter '${module.id}.${key}' must be a string.`);
    if (spec.type === 'enum' && (typeof value !== 'string' || !spec.options?.includes(value))) throw new Error(`Parameter '${module.id}.${key}' has an unsupported option.`);
    values[key] = value as number | boolean | string;
  }
  return values;
}

function orderedNodes(graph: VisualGraph, registry: ModuleRegistry) {
  if (!graph || graph.schemaVersion !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    if (graph && typeof graph === 'object' && 'nodes' in graph) throw new Error('This is a legacy patch format. Load it with the existing patch runner or migrate it to visual graph schema version 1.');
    throw new Error('Unsupported visual graph format. Expected schemaVersion 1.');
  }
  if (graph.nodes.length === 0 || graph.nodes.length > MAX_NODES || graph.edges.length > MAX_EDGES) throw new Error(`Visual graph exceeds resource limits (${MAX_NODES} nodes, ${MAX_EDGES} connections).`);
  const byId = new Map<string, VisualNode>();
  const modules = new Map<string, ModuleDefinition>();
  for (const node of graph.nodes) {
    if (!node || !/^[a-zA-Z0-9_-]{1,40}$/.test(node.id) || byId.has(node.id)) throw new Error('Visual graph contains an invalid or duplicate node ID.');
    byId.set(node.id, node);
    modules.set(node.id, registry.get(node.module, node.version));
    parameterValues(modules.get(node.id)!, node.parameters);
  }
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  const connectedInputs = new Set<string>();
  for (const edge of graph.edges) {
    const source = modules.get(edge.from), target = modules.get(edge.to);
    if (!source || !target) throw new Error(`Connection references a missing node: '${edge.from}' → '${edge.to}'.`);
    const output = source.outputs.find(port => port.id === edge.output);
    const input = target.inputs.find(port => port.id === edge.input);
    if (!output || !input) throw new Error(`Connection references an unknown port: '${edge.from}.${edge.output}' → '${edge.to}.${edge.input}'.`);
    if (output.type !== input.type) throw new Error(`Incompatible connection types: '${output.type}' cannot connect to '${input.type}'.`);
    const inputKey = `${edge.to}.${edge.input}`;
    if (connectedInputs.has(inputKey)) throw new Error(`Input '${inputKey}' has more than one connection.`);
    connectedInputs.add(inputKey);
    (incoming.get(edge.to) ?? incoming.set(edge.to, new Set()).get(edge.to)!).add(edge.from);
    (outgoing.get(edge.from) ?? outgoing.set(edge.from, new Set()).get(edge.from)!).add(edge.to);
  }
  for (const node of graph.nodes) {
    const def = modules.get(node.id)!;
    for (const port of def.inputs) if (port.required !== false && !connectedInputs.has(`${node.id}.${port.id}`)) throw new Error(`Required input '${node.id}.${port.id}' is not connected.`);
  }
  const pending = new Set(graph.nodes.map(node => node.id));
  const ordered: VisualNode[] = [];
  while (pending.size) {
    const ready = graph.nodes.filter(node => pending.has(node.id) && [...(incoming.get(node.id) ?? [])].every(source => !pending.has(source)));
    if (!ready.length) throw new Error('Visual graph contains a cycle.');
    for (const node of ready) { ordered.push(node); pending.delete(node.id); }
  }
  return { ordered, modules, byId };
}

function validateValue(portType: string, value: unknown, label: string): asserts value is GraphValue {
  if (!value || typeof value !== 'object' || (value as GraphValue).type !== portType) throw new Error(`Module output '${label}' does not match its declared port type.`);
  const v = value as GraphValue;
  if (v.type === 'scalar/f32' && !Number.isFinite(v.value)) throw new Error(`Module output '${label}' must be finite.`);
  if (v.type === 'vector2/f32' && (!Number.isFinite(v.x) || !Number.isFinite(v.y))) throw new Error(`Module output '${label}' must contain finite coordinates.`);
  if (v.type === 'image/rgba8' || v.type === 'mask/u8') {
    if (!Number.isInteger(v.width) || !Number.isInteger(v.height) || v.width < 1 || v.height < 1 || v.width * v.height > MAX_PIXELS || v.data.length !== v.width * v.height * (v.type === 'mask/u8' ? 1 : 4)) throw new Error(`Module output '${label}' exceeds valid image dimensions or buffer size.`);
  }
}

function validateState(value: unknown, moduleId: string): asserts value is ModuleState {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 64 || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`Module '${moduleId}' returned state that cannot safely cross a worker boundary.`);
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(key) || !(item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)))) throw new Error(`Module '${moduleId}' returned invalid worker state.`);
  }
}

export class VisualGraphRuntime {
  private ordered: VisualNode[];
  private modules: Map<string, ModuleDefinition>;
  private byId: Map<string, VisualNode>;
  private state = new Map<string, ModuleState>();
  private lastAt = -Infinity;
  private disposed = false;

  readonly graph: VisualGraph;
  private readonly registry: ModuleRegistry;

  constructor(graph: VisualGraph, registry: ModuleRegistry) {
    this.graph = graph; this.registry = registry;
    const checked = orderedNodes(graph, registry);
    this.ordered = checked.ordered; this.modules = checked.modules; this.byId = checked.byId;
    for (const node of this.ordered) this.state.set(node.id, this.modules.get(node.id)!.createState());
  }

  evaluate(sample: VisualSample) {
    if (this.disposed) throw new Error('Visual graph has been disposed.');
    if (!Number.isFinite(sample.at) || sample.at <= this.lastAt) throw new Error('Visual graph samples must have increasing finite timestamps.');
    for (const [name, value] of Object.entries(sample.features)) if (!Number.isFinite(value)) throw new Error(`Feature '${name}' must be finite.`);
    this.lastAt = sample.at;
    const values = new Map<string, Record<string, GraphValue>>();
    for (const node of this.ordered) {
      const definition = this.modules.get(node.id)!;
      const inputs: Record<string, GraphValue> = {};
      for (const edge of this.graph.edges) if (edge.to === node.id) {
        const value = values.get(edge.from)?.[edge.output];
        if (!value) throw new Error(`No value produced for '${edge.from}.${edge.output}'.`);
        inputs[edge.input] = value;
      }
      const result = definition.process(inputs, parameterValues(definition, node.parameters), this.state.get(node.id)!, sample);
      if (!result || !result.outputs || typeof result.outputs !== 'object' || !result.state || typeof result.state !== 'object') throw new Error(`Module '${definition.id}' returned an invalid result.`);
      if (typeof (result as unknown as { then?: unknown }).then === 'function') throw new Error(`Module '${definition.id}' must process synchronously; asynchronous work is not allowed in the graph runtime.`);
      validateState(result.state, definition.id);
      const outputValues: Record<string, GraphValue> = {};
      for (const port of definition.outputs) {
        const value = result.outputs[port.id];
        if (!value) throw new Error(`Module '${definition.id}' did not produce '${port.id}'.`);
        validateValue(port.type, value, `${node.id}.${port.id}`);
        outputValues[port.id] = value;
      }
      if (Object.keys(result.outputs).some(id => !definition.outputs.some(port => port.id === id))) throw new Error(`Module '${definition.id}' returned an undeclared output.`);
      this.state.set(node.id, result.state);
      values.set(node.id, outputValues);
    }
    return values;
  }

  reset() {
    if (this.disposed) throw new Error('Visual graph has been disposed.');
    for (const node of this.ordered) {
      const definition = this.modules.get(node.id)!;
      this.state.set(node.id, definition.reset(this.state.get(node.id)!));
    }
    this.lastAt = -Infinity;
  }

  dispose() {
    if (this.disposed) return;
    for (const node of this.ordered) this.modules.get(node.id)!.dispose?.(this.state.get(node.id)!);
    this.state.clear(); this.disposed = true;
  }
}

export function validateVisualGraph(graph: VisualGraph, registry: ModuleRegistry) { orderedNodes(graph, registry); return graph; }
