import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateControlSignal, validateControlSignal } from '../src/control/control-signal.ts';

const input = (id, source, weight, min = 0, max = 1) => ({ id, source, weight, calibration: { min, max, invert: false } });

test('named control signals combine calibrated measured outputs with normalized weights', () => {
  const signal = validateControlSignal({ id: 'scene-mix', name: 'Scene Mix', enabled: true, smoothingMs: 0, inputs: [input('light', 'stage-a|mean', 0.25), input('motion', 'stage-b|motion', 0.75)] });
  const state = {};
  const value = evaluateControlSignal(signal, source => ({ 'stage-a|mean': 0.8, 'stage-b|motion': 0.4 })[source], 10, state);
  assert.equal(value, 0.5);
});

test('named control signals smooth each independent output over elapsed frame time', () => {
  const signal = validateControlSignal({ id: 'soft', name: 'Soft', enabled: true, smoothingMs: 100, inputs: [input('x', 'stage-a|mean', 1)] });
  const state = {};
  assert.equal(evaluateControlSignal(signal, () => 0, 1, state), 0);
  const value = evaluateControlSignal(signal, () => 1, 101, state);
  assert.ok(value > 0.6 && value < 0.64);
});

test('named control signal validation rejects invalid signal IDs, unbounded weights and empty inputs', () => {
  assert.throws(() => validateControlSignal({ id: 'bad id', name: 'Bad', enabled: true, smoothingMs: 0, inputs: [input('x', 's|mean', 1)] }));
  assert.throws(() => validateControlSignal({ id: 'bad', name: 'Bad', enabled: true, smoothingMs: 0, inputs: [input('x', 's|mean', 1.1)] }));
  assert.throws(() => validateControlSignal({ id: 'empty', name: 'Empty', enabled: true, smoothingMs: 0, inputs: [] }));
});
