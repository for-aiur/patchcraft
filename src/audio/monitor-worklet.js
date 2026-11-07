// EVR-94 / EVR-98. Fixed-size processing; telemetry is aggregated once per second.
export class MonitorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = 0;
    this.blocks = 0;
    this.gaps = 0;
    this.invalid = 0;
    this.clipped = 0;
    this.peak = 0;
    this.expectedFrame = -1;
  }

  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    const input = inputs[0]?.[0];
    if (this.expectedFrame >= 0 && currentFrame !== this.expectedFrame) this.gaps++;
    this.expectedFrame = currentFrame + output.length;
    for (let i = 0; i < output.length; i++) {
      const value = input?.[i] ?? 0;
      if (!Number.isFinite(value)) {
        output[i] = 0;
        this.invalid++;
      } else {
        this.peak = Math.max(this.peak, Math.abs(value));
        if (Math.abs(value) >= 1) this.clipped++;
        output[i] = Math.max(-1, Math.min(1, value));
      }
    }
    this.blocks++;
    this.frames += output.length;
    if (this.frames >= sampleRate) {
      this.port.postMessage({ blocks: this.blocks, frameGaps: this.gaps,
        invalidSamples: this.invalid, clippedSamples: this.clipped, peak: this.peak,
        renderedSeconds: currentFrame / sampleRate });
      this.frames = 0;
      this.peak = 0;
    }
    return true;
  }
}

registerProcessor('patchcraft-monitor', MonitorProcessor);
