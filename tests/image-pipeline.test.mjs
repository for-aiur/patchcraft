import test from 'node:test';
import assert from 'node:assert/strict';
import { imageModules, processImagePipeline } from '../src/vision/pipeline.ts';

const pixel = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);
const stage = (module, parameters, enabled = true) => ({ module, version: 1, enabled, parameters });

test('compiled image registry exposes versioned modular stages', () => {
  assert.deepEqual(imageModules.list().slice(0,4).map(module => module.id), [
    'org.patchcraft.image.roi-crop', 'org.patchcraft.image.grayscale', 'org.patchcraft.image.tone', 'org.patchcraft.image.box-blur',
  ]);
});

test('ROI crop outputs a resized selected region', () => {
  const pixels = new Uint8ClampedArray([255,0,0,255, 0,0,255,255]);
  const result = processImagePipeline(pixels, 2, 1, { stages: [stage('org.patchcraft.image.roi-crop', { x: 0.5, y: 0, width: 0.5, height: 1 })] });
  assert.deepEqual([...result], [0,0,255,255, 0,0,255,255]);
});

test('stage order and bypass change the actual output', () => {
  const red = pixel(255,0,0);
  const gray = stage('org.patchcraft.image.grayscale', { enabled: true });
  const darken = stage('org.patchcraft.image.tone', { contrast: 1, gamma: 2 });
  const grayThenGamma = processImagePipeline(red, 1, 1, { stages: [gray, darken] });
  const gammaThenGray = processImagePipeline(red, 1, 1, { stages: [darken, gray] });
  const bypass = processImagePipeline(red, 1, 1, { stages: [{ ...gray, enabled: false }] });
  assert.ok(grayThenGamma[0] > gammaThenGray[0]);
  assert.deepEqual([...bypass], [...red]);
});

test('pipeline emits the intermediate image after every active or bypassed stage', () => {
  const outputs = [];
  const red = pixel(255,0,0);
  const settings = { stages: [
    stage('org.patchcraft.image.grayscale', { enabled: true }),
    stage('org.patchcraft.image.tone', { contrast: 1, gamma: 2 }, false),
  ] };
  const final = processImagePipeline(red, 1, 1, settings, imageModules, (_stage, index, image) => outputs.push({ index, pixels: [...image] }));
  assert.deepEqual(outputs.map(output => output.index), [0, 1]);
  assert.deepEqual(outputs[0].pixels, [54,54,54,255]);
  assert.deepEqual(outputs[1].pixels, outputs[0].pixels);
  assert.deepEqual([...final], outputs[1].pixels);
});

test('image pipeline rejects unsupported modules, invalid ranges, oversized frames and excessive stage count', () => {
  assert.throws(() => processImagePipeline(pixel(0,0,0), 1, 1, { stages: [stage('org.unknown.missing', {})] }), /Unknown image module/);
  assert.throws(() => processImagePipeline(pixel(0,0,0), 1, 1, { stages: [stage('org.patchcraft.image.box-blur', { radius: 9 })] }), /Invalid image module parameter/);
  assert.throws(() => processImagePipeline(pixel(0,0,0), 1000, 1000, { stages: [] }), /Invalid image frame/);
  assert.throws(() => processImagePipeline(pixel(0,0,0), 1, 1, { stages: Array(17).fill(stage('org.patchcraft.image.box-blur', { radius: 1 })) }), /at most 16 stages/);
});
