import { MidiOutput, type MidiPort, type MidiSettings } from './output.ts';
import { distribution } from '../diagnostics.ts';
import { validatePatch, type Patch } from '../control/patch.ts';

// Portable routing data never stores an armed state or a device ID.
export type Mapping = MidiSettings & {
  id: string;
  name: string;
  type: 'cc' | 'program';
  program: number;
  low: number;
  high: number;
  portHint: string;
  source?: string;
};
export type RigProfile = { schemaVersion: 1; name: string; patch: Patch; mappings: Mapping[] };
const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export function validateMappings(input: unknown): Mapping[] {
  if (!Array.isArray(input) || input.length > 8) throw new Error('A rig supports up to eight mappings.');
  const mappings = JSON.parse(JSON.stringify(input)) as Mapping[];
  const ids = new Set<string>();
  for (const m of mappings) {
    if (!m || typeof m.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(m.id) || ids.has(m.id)) {
      throw new Error('Mapping IDs must be valid and unique.');
    }
    ids.add(m.id);
    if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 100 ||
        typeof m.portHint !== 'string' || m.portHint.length > 200 || !['cc', 'program'].includes(m.type)) {
      throw new Error('Invalid mapping name, type or device hint.');
    }
    if (!integer(m.channel, 1, 16) || !integer(m.cc, 0, 119) || !integer(m.program, 0, 127) ||
        !integer(m.min, 0, 127) || !integer(m.max, 0, 127) || m.min > m.max ||
        !Number.isFinite(m.hz) || m.hz < 1 || m.hz > 60 ||
        !Number.isFinite(m.low) || !Number.isFinite(m.high) || m.low < 0 || m.high > 1 || m.low >= m.high) {
      throw new Error('Invalid channel, CC, program, range, rate or trigger thresholds.');
    }
    if (m.source !== undefined && (typeof m.source !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(m.source))) throw new Error('Invalid graph output source.');
    const fields = ['source','id','name','type','channel','cc','hz','min','max','program','low','high','portHint'];
    if (Object.keys(m).some(key => !fields.includes(key))) throw new Error('Unknown mapping field.');
  }
  return mappings;
}
export function validateRig(input: unknown): RigProfile {
  if (!input || typeof input !== 'object') throw new Error('Rig profile must be an object.');
  const p = input as RigProfile;
  if (p.schemaVersion !== 1 || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100 ||
      Object.keys(p).some(key => !['schemaVersion','name','patch','mappings'].includes(key))) {
    throw new Error('Unsupported rig profile version or metadata.');
  }
  const patch = validatePatch(p.patch);
  const mappings = validateMappings(p.mappings);
  if (mappings.some(m => m.source && !patch.nodes.some(n => n.id === m.source && n.kind === 'output'))) throw new Error('Mapping source must reference a graph output.');
  return { schemaVersion: 1, name: p.name, patch, mappings };
}
export function defaultMapping(id: string): Mapping {
  return { id, name: 'Camera control', type: 'cc', channel: 1, cc: 74, min: 0, max: 127,
    hz: 30, program: 0, low: 0.3, high: 0.7, portHint: '' };
}
type Route = { mapping: Mapping; output: MidiOutput; programReady: boolean; programsSent: number; lastProgramAt: number };
export class MidiRig {
  private routes = new Map<string, Route>();
  get mappings() { return Array.from(this.routes.values(), route => structuredClone(route.mapping)); }
  replace(input: unknown) {
    const mappings = validateMappings(input);
    this.disarm('Rig profile changed; confirm ports and rearm.');
    this.routes = new Map(mappings.map(mapping => [mapping.id, {
      mapping, output: new MidiOutput(), programReady: false, programsSent: 0, lastProgramAt: -Infinity,
    }]));
  }
  private route(id: string) {
    const route = this.routes.get(id);
    if (!route) throw new Error('Unknown MIDI mapping.');
    return route;
  }
  select(id: string, port?: MidiPort) {
    const route = this.route(id);
    route.output.select(port);
    route.programReady = false;
  }
  arm(id: string, now: number, frameAt: number) {
    const route = this.route(id);
    route.output.arm(route.mapping, now, frameAt);
    route.programReady = false;
  }
  disarm(reason: string) {
    for (const route of this.routes.values()) {
      route.output.disarm(reason);
      route.programReady = false;
    }
  }
  refreshPorts() {
    for (const route of this.routes.values()) {
      if (route.output.port && route.output.port.state !== 'connected') {
        route.output.select(undefined);
        route.output.reason = 'Output disconnected. Select the port and rearm.';
        route.programReady = false;
      }
    }
  }
  dispatch(value: number, now: number, frameAt: number, source?: string) {
    for (const route of this.routes.values()) {
      if (!route.output.armed || (source ? route.mapping.source !== source : route.mapping.source !== undefined)) continue;
      if (route.mapping.type === 'cc') {
        route.output.send(value, now, frameAt);
        continue;
      }
      if (!Number.isFinite(value) || !Number.isFinite(now) || !Number.isFinite(frameAt) ||
          now < frameAt || now - frameAt > 500 || route.output.port?.state !== 'connected') {
        route.output.disarm('Camera stale or MIDI unavailable; rearm explicitly.');
        route.programReady = false;
        continue;
      }
      if (value <= route.mapping.low) route.programReady = true;
      if (route.programReady && value >= route.mapping.high && now - route.lastProgramAt >= Math.max(250, 1000 / route.mapping.hz)) {
        try { this.sendProgram(route, now); }
        catch { route.output.disarm('Program Change failed; select port and rearm.'); }
        route.programReady = false;
      }
    }
  }
  // User-triggered setup actions work without camera capture and leave live output disarmed.
  probe(id: string, now: number) {
    const route = this.route(id);
    route.output.disarm('Setup mode; live control disarmed.');
    route.programReady = false;
    const port = route.output.port;
    if (!port || port.state !== 'connected') throw new Error('Confirm a connected output first.');
    if (!Number.isFinite(now)) throw new Error('Invalid send time.');
    if (now - route.lastProgramAt < 250) throw new Error('Wait before sending another setup message.');
    if (route.mapping.type === 'program') this.sendProgram(route, now);
    else {
      port.send([0xb0 + route.mapping.channel - 1, route.mapping.cc, route.mapping.min]);
      route.lastProgramAt = now;
    }
    route.output.reason = 'Setup message sent. Rearm live control explicitly.';
  }
  private sendProgram(route: Route, now: number) {
    route.output.port!.send([0xc0 + route.mapping.channel - 1, route.mapping.program]);
    route.programsSent++;
    route.lastProgramAt = now;
  }
  timings() {
    return Array.from(this.routes.values(), r => ({ id: r.mapping.id,
      readbackToSendCallMs: distribution(r.output.delays), sendIntervalMs: distribution(r.output.intervals),
      physicalDeliveryLatencyMs: null }));
  }
  snapshot() {
    return Array.from(this.routes.values(), r => ({ id: r.mapping.id, name: r.mapping.name, type: r.mapping.type,
      armed: r.output.armed, portName: r.output.port?.name ?? null, reason: r.output.reason,
      ccSent: r.output.sent, programsSent: r.programsSent, suppressed: r.output.suppressed,
      lastValue: r.output.lastValue ?? null }));
  }
}

export function learnedCC(data: ArrayLike<number>): { channel: number; cc: number } | undefined {
  if (data.length !== 3 || !integer(data[0], 0xb0, 0xbf) || !integer(data[1], 0, 119) || !integer(data[2], 0, 127)) return;
  return { channel: (data[0] & 15) + 1, cc: data[1] };
}
