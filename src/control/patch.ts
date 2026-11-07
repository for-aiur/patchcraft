// Closed node catalog; patches contain data only.
export type Signal = 'brightness' | 'red' | 'green' | 'blue' | 'color' | 'motion';
export type Effect = 'cutoff' | 'drive' | 'tremolo' | 'delay' | 'reverb';
export type NodeKind = 'camera' | 'normalize' | 'clamp' | 'map' | 'smooth' | 'threshold' | 'rateLimit' | 'effect' | 'output';
export type PatchNode = { id: string; kind: NodeKind; params: Record<string, number | string> };
export type Edge = { from: string; to: string; type: 'control' };
export type Patch = {
  schemaVersion: 1; name: string; nodes: PatchNode[]; edges: Edge[];
  camera: { roi: { x: number; y: number; width: number; height: number }; target: [number, number, number]; tolerance: number; fps: number };
  midi: { channel: number; cc: number; hz: number; min: number; max: number; portHint: string };
};
const signals: Signal[] = ['brightness', 'red', 'green', 'blue', 'color', 'motion'];
export const effects: Record<Effect, { min: number; max: number; default: number; unit: string; browser: boolean }> = {
  cutoff: { min: 80, max: 18000, default: 2500, unit: 'Hz', browser: true },
  drive: { min: 1, max: 8, default: 1, unit: 'ratio', browser: true },
  tremolo: { min: 0, max: 1, default: 0, unit: 'depth', browser: true },
  delay: { min: 0, max: 1, default: 0.2, unit: 'wet', browser: false },
  reverb: { min: 0, max: 1, default: 0.2, unit: 'wet', browser: false },
};
const rules: Record<NodeKind, Record<string, [number, number] | string[]>> = {
  camera: { signal: signals }, normalize: { min: [0, 1], max: [0, 1] },
  clamp: { min: [0, 1], max: [0, 1] }, map: { min: [0, 1], max: [0, 1] },
  smooth: { ms: [0, 2000] }, threshold: { low: [0, 1], high: [0, 1] },
  rateLimit: { hz: [1, 60] }, effect: { parameter: Object.keys(effects) }, output: {},
};
const numberIn = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const unit = (value: number) => Math.max(0, Math.min(1, value));
export function validatePatch(input: unknown): Patch {
  if (!input || typeof input !== 'object') throw new Error('Patch must be an object.');
  // JSON cloning removes prototypes and isolates the active graph from caller mutations.
  const p = JSON.parse(JSON.stringify(input)) as Patch;
  if (Object.keys(p).some(key => !['schemaVersion','name','nodes','edges','camera','midi'].includes(key))) throw new Error('Unknown patch field.');
  if (p.schemaVersion !== 1 || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100) throw new Error('Unsupported patch version or name.');
  if (!Array.isArray(p.nodes) || p.nodes.length < 2 || p.nodes.length > 64 || !Array.isArray(p.edges) || p.edges.length > 128) throw new Error('Invalid graph size.');
  const ids = new Set<string>();
  for (const n of p.nodes) {
    if (!n || typeof n.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(n.id) || ids.has(n.id) || !Object.hasOwn(rules, n.kind) || !n.params || typeof n.params !== 'object' || Array.isArray(n.params)) throw new Error('Invalid or duplicate node.');
    ids.add(n.id);
    const spec = rules[n.kind];
    if (Object.keys(n.params).some(k => !Object.hasOwn(spec, k))) throw new Error('Unknown node parameter.');
    for (const [key, bounds] of Object.entries(spec)) {
      const v = n.params[key];
      if (typeof bounds[0] === 'number' ? !numberIn(v, bounds[0], bounds[1] as number) : !bounds.includes(v as never)) throw new Error(`Invalid ${n.kind}.${key}.`);
    }
    if (['normalize', 'clamp', 'map'].includes(n.kind) && Number(n.params.max) <= Number(n.params.min)) throw new Error('Calibration or mapping range must have positive width.');
    if (n.kind === 'threshold' && Number(n.params.high) < Number(n.params.low)) throw new Error('Threshold high must be at least low.');
  }
  for (const e of p.edges) {
    if (!e || e.type !== 'control' || !ids.has(e.from) || !ids.has(e.to)) throw new Error('Invalid connection or port type.');
    const source = p.nodes.find(n => n.id === e.from)!;
    const target = p.nodes.find(n => n.id === e.to)!;
    if (source.kind === 'output' || target.kind === 'camera') throw new Error('Incompatible ports.');
  }
  for (const n of p.nodes) {
    const incoming = p.edges.filter(e => e.to === n.id);
    if (incoming.length !== (n.kind === 'camera' ? 0 : 1)) throw new Error('Each processor/output requires exactly one control input.');
  }
  const ordered = order(p);
  if (!ordered.some(n => n.kind === 'output')) throw new Error('Graph needs an output.');
  const roi = p.camera?.roi;
  if (!roi || ![roi.x, roi.y, roi.width, roi.height].every(v => numberIn(v, 0, 1)) || roi.width < 0.05 || roi.height < 0.05 || roi.x + roi.width > 1.000001 || roi.y + roi.height > 1.000001 || !numberIn(p.camera.fps, 5, 60) || !numberIn(p.camera.tolerance, 0.01, 1) || !Array.isArray(p.camera.target) || p.camera.target.length !== 3 || !p.camera.target.every(v => numberIn(v, 0, 1))) throw new Error('Invalid camera settings.');
  const m = p.midi;
  if (!m || !Number.isInteger(m.channel) || !numberIn(m.channel, 1, 16) || !Number.isInteger(m.cc) || !numberIn(m.cc, 0, 119) || !numberIn(m.hz, 1, 60) || !Number.isInteger(m.min) || !Number.isInteger(m.max) || !numberIn(m.min, 0, 127) || !numberIn(m.max, 0, 127) || m.min > m.max || typeof m.portHint !== 'string' || m.portHint.length > 200) throw new Error('Invalid MIDI mapping.');
  return p;
}
function order(p: Patch) {
  const result: PatchNode[] = [];
  const pending = new Set(p.nodes.map(n => n.id));
  while (pending.size) {
    const ready = p.nodes.filter(n => pending.has(n.id) && p.edges.filter(e => e.to === n.id).every(e => !pending.has(e.from)));
    if (!ready.length) throw new Error('Graph contains a cycle.');
    for (const node of ready) { result.push(node); pending.delete(node.id); }
  }
  return result;
}
export class ControlGraph {
  patch: Patch;
  private ordered: PatchNode[];
  private memory = new Map<string, { value: number; at: number }>();
  private lastAt = -Infinity;
  constructor(patch: unknown) { this.patch = validatePatch(patch); this.ordered = order(this.patch); }
  reconfigure(input: unknown) {
    const next = validatePatch(input);
    const shape = (p: Patch) => ({ camera:p.camera,midi:p.midi,edges:p.edges,nodes:p.nodes.map(n=>({id:n.id,kind:n.kind,strings:Object.fromEntries(Object.entries(n.params).filter(([,v])=>typeof v==='string'))})) });
    if(JSON.stringify(shape(next))!==JSON.stringify(shape(this.patch))) throw new Error('Live numeric reconfiguration cannot change graph structure or routing.');
    this.patch=next; this.ordered=order(next);
  }
  evaluate(signals: Record<Signal, number>, at: number) {
    if (!Number.isFinite(at) || at <= this.lastAt || (['brightness', 'red', 'green', 'blue', 'color', 'motion'] as Signal[]).some(key => !Number.isFinite(signals[key]))) throw new Error('Invalid or out-of-order control sample.');
    this.lastAt = at;
    const values = new Map<string, number>();
    const outputs: { id: string; value: number; effect: Effect }[] = [];
    const parameters = new Map<string, Effect>();
    for (const n of this.ordered) {
      const parent = this.patch.edges.find(e => e.to === n.id)?.from;
      let v = parent ? values.get(parent)! : 0;
      let effect = parent ? parameters.get(parent) ?? 'cutoff' : 'cutoff';
      const a = Number(n.params.min), b = Number(n.params.max);
      const old = this.memory.get(n.id);
      switch (n.kind) {
        case 'camera': v = unit(signals[n.params.signal as Signal]); break;
        case 'normalize': v = unit((v - a) / (b - a)); break;
        case 'clamp': v = Math.max(a, Math.min(b, v)); break;
        case 'map': v = a + unit(v) * (b - a); break;
        case 'smooth': v = old ? old.value + (v - old.value) * (1 - Math.exp(-(at - old.at) / Math.max(0.001, Number(n.params.ms)))) : v; break;
        case 'threshold': v = v >= Number(n.params.high) ? 1 : v <= Number(n.params.low) ? 0 : old?.value ?? 0; break;
        case 'rateLimit': if (old && at - old.at < 1000 / Number(n.params.hz)) v = old.value; break;
        case 'effect': effect = n.params.parameter as Effect; break;
        case 'output': outputs.push({ id:n.id, value: unit(v), effect }); break;
      }
      values.set(n.id, v); parameters.set(n.id, effect);
      if (n.kind !== 'rateLimit' || !old || at - old.at >= 1000 / Number(n.params.hz)) this.memory.set(n.id, { value: v, at });
    }
    return outputs;
  }
}
export function starter(signal: Signal = 'brightness', effect: Effect = 'cutoff'): Patch {
  return validatePatch({ schemaVersion: 1, name: `${signal} → ${effect}`, camera: { roi: { x: 0, y: 0, width: 1, height: 1 }, target: [1, 0, 0], tolerance: 0.35, fps: 30 },
    midi: { channel: 1, cc: effect === 'cutoff' ? 74 : effect === 'drive' ? 20 : 21, hz: 30, min: 0, max: 127, portHint: '' },
    nodes: [{ id: 'camera', kind: 'camera', params: { signal } }, { id: 'normalize', kind: 'normalize', params: { min: 0, max: signal === 'motion' ? 0.15 : 1 } },
      { id: 'smooth', kind: 'smooth', params: { ms: 80 } }, { id: 'effect', kind: 'effect', params: { parameter: effect } }, { id: 'output', kind: 'output', params: {} }],
    edges: [['camera','normalize'], ['normalize','smooth'], ['smooth','effect'], ['effect','output']].map(([from,to]) => ({ from, to, type: 'control' })) });
}
