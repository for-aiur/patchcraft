import { extractFeatures, type TargetColor } from './features';
let previous: Uint8ClampedArray | undefined;
let signature = '';
self.onmessage = event => {
  const { pixels, width, target, tolerance, key, capturedAt, generation } = event.data as {
    pixels: Uint8ClampedArray; width: number; target: TargetColor; tolerance: number;
    key: string; capturedAt: number; generation: number;
  };
  const start = performance.now();
  if (signature !== key) previous = undefined;
  const features = extractFeatures(pixels, previous, width, target, tolerance);
  previous = pixels;
  signature = key;
  self.postMessage({ features, processingMs: performance.now() - start, capturedAt, generation });
};
