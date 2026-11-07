import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter, validatePatch, ControlGraph } from '../src/control/patch.ts';
import { extractFeatures } from '../src/vision/features.ts';
import { MidiOutput } from '../src/midi/output.ts';
const pixels = (colors) => new Uint8ClampedArray(colors.flatMap(c => [...c, 255]));
const sample = v => ({ brightness:v, red:v, green:v, blue:v, color:v, motion:v });

test('pixel fixtures distinguish brightness, target color, noise and movement', () => {
  const black = pixels([[0,0,0],[0,0,0]]), white = pixels([[255,255,255],[255,255,255]]);
  assert.equal(extractFeatures(black, undefined, 2, [1,0,0], 0.35).brightness, 0);
  assert.equal(extractFeatures(white, black, 2, [1,0,0], 0.35).motion, 1);
  const red = pixels([[255,0,0],[255,0,0]]);
  assert.equal(extractFeatures(red, red, 2, [1,0,0], 0.35).color, 1);
  assert.equal(extractFeatures(red, red, 2, [1,0,0], 0.35).motion, 0);
  const noise = pixels([[1,1,1],[1,1,1]]);
  assert.equal(extractFeatures(noise, black, 2, [1,0,0], 0.35).changedFraction, 0);
  const left = pixels([[255,255,255],[0,0,0]]), right = pixels([[0,0,0],[255,255,255]]);
  assert.equal(extractFeatures(right, left, 2, [1,0,0], 0.35).directionX, 0.5);
  assert.equal(extractFeatures(left, right, 2, [1,0,0], 0.35).directionX, -0.5);
});

test('patch validation rejects unsafe or incompatible graphs and preserves valid JSON', () => {
  const patch = starter();
  assert.deepEqual(validatePatch(JSON.parse(JSON.stringify(patch))), patch);
  for (const mutate of [
    p => p.schemaVersion = 2,
    p => p.nodes[1].params.max = 0,
    p => p.nodes[2].params.ms = -1,
    p => p.nodes[0].params.signal = 'script',
    p => p.edges[0].type = 'audio',
    p => p.edges[0].from = 'missing',
    p => p.nodes.push(structuredClone(p.nodes[0])),
    p => p.camera.roi.x = 2,
    p => p.midi.cc = 123,
    p => p.midi.hz = Infinity,
    p => p.edges[1].from = 'smooth',
  ]) {
    const copy = structuredClone(patch); mutate(copy); assert.throws(() => validatePatch(copy));
  }
  const graph = new ControlGraph(patch);
  patch.nodes[0].params.signal = 'motion';
  assert.equal(graph.patch.nodes[0].params.signal, 'brightness');
});

test('control graph clamps and smooths according to elapsed time, then maps adapters independently', () => {
  const p = starter(); p.nodes[1].params = {min:0.2,max:0.8}; p.nodes[2].params.ms = 100;
  const graph = new ControlGraph(p);
  assert.equal(graph.evaluate(sample(0), 0)[0].value, 0);
  const result = graph.evaluate(sample(1), 100)[0];
  assert.ok(Math.abs(result.value - (1-Math.exp(-1))) < 1e-10);
  assert.equal(result.effect, 'cutoff');
  assert.throws(() => graph.evaluate(sample(1), 100));
  assert.throws(() => graph.evaluate({...sample(1),red:NaN}, 200));
  assert.throws(() => graph.evaluate({}, 200));
});

test('threshold hysteresis and rate limiting preserve state across irregular frames', () => {
  const p = starter();
  p.nodes[2] = {id:'smooth',kind:'threshold',params:{low:0.4,high:0.6}};
  let g = new ControlGraph(p);
  assert.equal(g.evaluate(sample(0.7),0)[0].value,1);
  assert.equal(g.evaluate(sample(0.5),10)[0].value,1);
  assert.equal(g.evaluate(sample(0.3),20)[0].value,0);
  p.nodes[2] = {id:'smooth',kind:'rateLimit',params:{hz:10}};
  g = new ControlGraph(p);
  assert.equal(g.evaluate(sample(0),0)[0].value,0);
  assert.equal(g.evaluate(sample(1),90)[0].value,0);
  assert.equal(g.evaluate(sample(1),101)[0].value,1);
});

test('MIDI clamps CC, limits sends, suppresses duplicates and disarms stale data', () => {
  const messages = []; let cleared = 0;
  const port = {id:'test',state:'connected',send:bytes=>messages.push(bytes),clear:()=>cleared++};
  const midi = new MidiOutput(); midi.select(port);
  const config = {channel:16,cc:74,hz:30,min:10,max:100};
  midi.arm(config,100,100); config.cc=20;
  midi.send(2,100,100);
  midi.send(0,110,110); midi.send(2,140,140); midi.send(-1,150,150);
  assert.deepEqual(messages,[[0xbf,74,100],[0xbf,74,10]]);
  midi.send(0.3,800,150);
  assert.equal(midi.armed,false);
  midi.send(1,810,810); assert.equal(messages.length,2);
  midi.arm(config,900,900); port.state='disconnected'; midi.send(0.2,910,910);
  assert.equal(midi.armed,false); assert.ok(cleared>0);
  assert.throws(()=>midi.arm(config,1000,0));
});

test('starter patch files match the public versioned runtime contract', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const signal of ['brightness','red','motion']) {
    const data = JSON.parse(await readFile(new URL(`../public/patches/${signal}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(validatePatch(data), starter(signal, signal === 'red' ? 'drive' : signal === 'motion' ? 'tremolo' : 'cutoff'));
  }
});
