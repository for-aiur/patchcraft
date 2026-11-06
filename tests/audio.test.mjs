import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixGains, decibelsToGain } from '../src/audio/parameters.mjs';
globalThis.AudioWorkletProcessor = class { port = { postMessage: value => { this.message = value; } }; };
globalThis.registerProcessor = () => {};
globalThis.currentFrame = 0;
globalThis.sampleRate = 48000;
const { MonitorProcessor } = await import('../src/audio/monitor-worklet.js');
test('bypass retains dry path and output gain is bounded', () => {
  assert.deepEqual(mixGains(1, true), {dry: 1, wet: 0});
  assert.deepEqual(mixGains(NaN, false), {dry: 1, wet: 0});
  assert.ok(decibelsToGain(100) < 0.502);
  assert.ok(decibelsToGain(NaN) < 0.064);
});
test('worklet preserves valid PCM and sanitizes invalid / overloaded samples', () => {
  const processor = new MonitorProcessor();
  const output = new Float32Array(6);
  processor.process([[new Float32Array([0, .25, -.5, NaN, Infinity, 2])]], [[output]]);
  assert.deepEqual([...output], [0, .25, -.5, 0, 0, 1]);
  assert.equal(processor.invalid, 2);
  assert.equal(processor.clipped, 1);
});
test('missing input renders silence and telemetry detects frame discontinuities', () => {
  const processor = new MonitorProcessor();
  for(let i=0;i<376;i++) {
    globalThis.currentFrame = i*128;
    const output = new Float32Array(128).fill(1);
    processor.process([], [[output]]);
    assert.ok(output.every(value => value === 0));
  }
  assert.equal(processor.message.frameGaps, 0);
  globalThis.currentFrame += 256;
  processor.process([], [[new Float32Array(128)]]);
  assert.equal(processor.gaps, 1);
});
