import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry } from '../src/control/visual-modules.ts';
import { VisualGraphRuntime, validateVisualGraph } from '../src/control/visual-graph.ts';
import { exampleFeatureSource, exampleWeightedMix, exampleResponse } from '../src/control/example-module.ts';

const sink = {
  id: 'org.patchcraft.test.sink', version: 1, label: 'Sink', description: 'Collects a scalar.', category: 'output',
  inputs: [{ id: 'input', label: 'Input', type: 'scalar/f32' }], outputs: [], parameters: {},
  createState: () => ({}), reset: () => ({}),
  process: (inputs, _parameters, state) => { globalThis.__visualOutput = inputs.input.value; return { outputs: {}, state }; },
};
const registry = new ModuleRegistry().register(exampleFeatureSource).register(exampleWeightedMix).register(exampleResponse).register(sink);
const graph = { schemaVersion: 1, nodes: [
  { id: 'camera', module: exampleFeatureSource.id, version: 1 }, { id: 'out', module: sink.id, version: 1 },
], edges: [{ from: 'camera', output: 'value', to: 'out', input: 'input' }] };

test('visual graph evaluates typed modules with one shared timestamp and source-ordered output', () => {
  validateVisualGraph(graph, registry);
  const runtime = new VisualGraphRuntime(graph, registry);
  runtime.evaluate({ at: 10, features: { brightness: 0.75 } });
  assert.equal(globalThis.__visualOutput, 0.75);
  runtime.reset();
  runtime.dispose();
  assert.throws(() => runtime.evaluate({ at: 11, features: { brightness: 0.5 } }), /disposed/);
});

test('graph validator reports missing module, incompatible ports, cycles, stale timestamps and bounds', () => {
  assert.throws(() => validateVisualGraph({ ...graph, nodes: [{ id: 'x', module: 'org.missing.module', version: 1 }] }, registry), /Unknown module/);
  assert.throws(() => validateVisualGraph({ ...graph, nodes: graph.nodes.map(node => ({ ...node, version: 2 })) }, registry), /version 2 is unavailable/);
  assert.throws(() => validateVisualGraph({ ...graph, edges: [{ ...graph.edges[0], input: 'missing' }] }, registry), /unknown port/);
  assert.throws(() => validateVisualGraph({ ...graph, edges: [...graph.edges, { from: 'out', output: 'missing', to: 'camera', input: 'missing' }] }, registry), /cycle|unknown port/);
  assert.throws(() => validateVisualGraph({ ...graph, nodes: Array.from({ length: 65 }, (_, i) => ({ id: `n${i}`, module: exampleFeatureSource.id, version: 1 })) }, registry), /resource limits/);
  const runtime = new VisualGraphRuntime(graph, registry);
  runtime.evaluate({ at: 10, features: { brightness: 0.2 } });
  assert.throws(() => runtime.evaluate({ at: 10, features: { brightness: 0.2 } }), /increasing finite timestamps/);
  runtime.dispose();
});

test('a shared source can branch and two named scalar inputs can be combined', () => {
  const branched = { schemaVersion: 1, nodes: [
    { id: 'brightness', module: exampleFeatureSource.id, version: 1 },
    { id: 'red', module: exampleFeatureSource.id, version: 1, parameters: { feature: 'red' } },
    { id: 'mix', module: exampleWeightedMix.id, version: 1, parameters: { weightA: 0.75, weightB: 0.25 } },
    { id: 'left', module: sink.id, version: 1 }, { id: 'right', module: sink.id, version: 1 },
  ], edges: [
    { from: 'brightness', output: 'value', to: 'mix', input: 'a' },
    { from: 'red', output: 'value', to: 'mix', input: 'b' },
    { from: 'mix', output: 'value', to: 'left', input: 'input' },
    { from: 'mix', output: 'value', to: 'right', input: 'input' },
  ] };
  const runtime = new VisualGraphRuntime(branched, registry);
  runtime.evaluate({ at: 20, features: { brightness: 0.8, red: 0.4 } });
  assert.ok(Math.abs(globalThis.__visualOutput - 0.7) < 1e-12);
  runtime.dispose();
});

test('response shaping applies a normalized curve and time smoothing before output', () => {
  const responseGraph = { schemaVersion: 1, nodes: [
    { id: 'camera', module: exampleFeatureSource.id, version: 1 },
    { id: 'response', module: exampleResponse.id, version: 1, parameters: { curve: 2, smoothingMs: 1000 } },
    { id: 'out', module: sink.id, version: 1 },
  ], edges: [
    { from: 'camera', output: 'value', to: 'response', input: 'input' },
    { from: 'response', output: 'value', to: 'out', input: 'input' },
  ] };
  const runtime = new VisualGraphRuntime(responseGraph, registry);
  runtime.evaluate({ at: 10, features: { brightness: 0.5 } });
  assert.equal(globalThis.__visualOutput, 0.25);
  runtime.evaluate({ at: 1010, features: { brightness: 1 } });
  assert.ok(Math.abs(globalThis.__visualOutput - (0.25 + 0.75 * (1 - Math.exp(-1)))) < 1e-9);
  runtime.dispose();
});

test('legacy control patches receive a migration path message', () => {
  assert.throws(() => validateVisualGraph({ schemaVersion: 1, nodes: [], edges: [] }, registry), /resource limits/);
  assert.throws(() => validateVisualGraph({ nodes: [{ id: 'camera', kind: 'camera' }], edges: [] }, registry), /legacy patch format/);
});
