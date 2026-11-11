import { startFrameClock } from './frame-clock';
import type { Features } from './features';
import type { Patch } from '../control/patch';
export type CameraSample = { features: Features; capturedAt: number; processingMs: number; generation: number; deliveredAt: number; readbackMs: number };
export class CameraInput {
  stream?: MediaStream;
  lastFrameAt = 0;
  skipped = 0;
  frames = 0;
  startedAt = 0;
  endedAt = 0;
  settings?: MediaTrackSettings;
  onSample: (sample: CameraSample) => void = () => {};
  onStop: (reason: string) => void = () => {};
  private generation = 0;
  private worker?: Worker;
  private canvas = document.createElement('canvas');
  private frameCallback = 0;
  private stopClock?: () => void;
  private pending = false;
  private previousTime = -1;
  private lastSampleAt = -Infinity;
  private readbackMs = 0;
  constructor(private video: HTMLVideoElement, public config: Patch['camera']) {}
  async start(id: string) {
    this.stop('Camera starting; rearm outputs explicitly.');
    const generation = this.generation;
    this.startedAt = performance.now(); this.endedAt = 0; this.frames = 0; this.skipped = 0;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { ...(id ? { deviceId: { exact: id } } : {}), width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: this.config.fps } }, audio: false });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream; this.settings = stream.getVideoTracks()[0].getSettings();
    const track = stream.getVideoTracks()[0];
    track.onended = () => this.stop('Camera disconnected.');
    // Temporary track muting can recover; keep the stream and wait for fresh frames.
    try {
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      this.startedAt = performance.now();
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = event => {
        if (generation !== this.generation) return;
        this.pending = false;
        const sample = event.data as CameraSample;
        if (sample.generation !== generation) return;
        this.frames++; this.lastFrameAt = sample.capturedAt;
        this.onSample({ ...sample, deliveredAt: performance.now(), readbackMs: this.readbackMs });
      };
      this.worker.onerror = () => this.stop('Image processing failed.');
      const frame = () => {
        if (generation !== this.generation) return;
        try { this.capture(generation); }
        catch { this.stop('Camera frame readback failed.'); return; }
        this.frameCallback = this.video.requestVideoFrameCallback(frame);
      };
      this.frameCallback = this.video.requestVideoFrameCallback(frame);
      this.stopClock = startFrameClock(() => {
        const now = performance.now();
        // Some browsers throttle compositor callbacks when the preview is offscreen.
        // Read only a newly delivered video frame; never fabricate freshness from a timer.
        if (!this.pending && this.video.currentTime !== this.previousTime &&
            now - this.lastSampleAt >= 1000 / this.config.fps - 2) {
          try { this.capture(generation); }
          catch { this.stop('Camera frame readback failed.'); return; }
        }
        // A temporary frame stall must not destroy the camera stream. Output freshness is checked separately.
      });
    } catch (error) { if (generation === this.generation) this.stop('Camera startup failed.'); throw error; }
  }
  private capture(generation: number) {
    const now = performance.now();
    if (this.stream?.getVideoTracks().some(track => track.muted || track.readyState === 'ended')) return;
    if (this.pending || now - this.lastSampleAt < 1000 / this.config.fps - 2 || this.video.currentTime === this.previousTime) { this.skipped++; return; }
    this.previousTime = this.video.currentTime;
    this.lastSampleAt = now;
    const { roi, target, tolerance } = this.config;
    const width = 160, height = 120;
    this.canvas.width = width; this.canvas.height = height;
    const context = this.canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(this.video, roi.x * this.video.videoWidth, roi.y * this.video.videoHeight, roi.width * this.video.videoWidth, roi.height * this.video.videoHeight, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    this.readbackMs = performance.now() - now;
    this.pending = true;
    this.worker!.postMessage({ pixels, width, target, tolerance, capturedAt: now, generation, key: JSON.stringify(this.config) }, [pixels.buffer]);
  }
  stop(reason = 'Camera stopped.') {
    ++this.generation;
    if (this.stream) this.endedAt = performance.now();
    if (this.frameCallback) this.video.cancelVideoFrameCallback(this.frameCallback);
    this.stopClock?.(); this.stopClock = undefined;
    this.worker?.terminate(); this.worker = undefined; this.pending = false;
    this.stream?.getTracks().forEach(t => { t.onended = null; t.onmute = null; t.stop(); });
    this.stream = undefined; this.video.srcObject = null;
    this.lastFrameAt = 0; this.previousTime = -1; this.lastSampleAt = -Infinity;
    this.onStop(reason);
  }
}
