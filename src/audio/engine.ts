import workletURL from './monitor-worklet.js?url';
import { bounded, decibelsToGain, mixGains } from './parameters.mjs';

export type Telemetry = {
  blocks: number; frameGaps: number; invalidSamples: number;
  clippedSamples: number; peak: number; renderedSeconds: number;
};
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };
export type StartOptions = { input: string; output: string; channel: number; sampleRate: number };

/** EVR-94. Owns the audio graph only; no camera, control transport or UI dependency. */
export class AudioEngine {
  context?: SinkContext;
  stream?: MediaStream;
  settings?: MediaTrackSettings;
  telemetry?: Telemetry;
  lastTelemetry = 0;
  interruptions = 0;
  private worklet?: AudioWorkletNode;
  private filter?: BiquadFilterNode;
  private dry?: GainNode;
  private wet?: GainNode;
  private level?: GainNode;
  private source?: AudioNode;
  private sample?: AudioBufferSourceNode;
  private intentionalStop = false;
  private generation = 0;
  onFailure: (message: string) => void = () => {};

  async start(options: StartOptions) {
    if (this.context) throw new Error('Stop monitoring before changing devices.');
    this.intentionalStop = false;
    const generation = ++this.generation;
    const context = new AudioContext({ latencyHint: 'interactive',
      ...(options.sampleRate ? { sampleRate: options.sampleRate } : {}) }) as SinkContext;
    this.context = context;
    this.telemetry = undefined;
    this.settings = undefined;
    this.lastTelemetry = 0;
    this.interruptions = 0;
    const ensureActive = () => {
      if (generation !== this.generation || this.context !== context) throw new Error('Audio start cancelled.');
    };
    try {
      // Resume within the user gesture, before asynchronous device permission requests.
      await context.resume();
      ensureActive();
      if (options.output) {
        if (!context.setSinkId) throw new Error('Output selection is unavailable. Choose the output in OS settings.');
        await context.setSinkId(options.output);
        ensureActive();
      }
      await context.audioWorklet.addModule(workletURL);
      ensureActive();
      if (options.input === 'sample') {
        const sample = context.createBufferSource();
        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = buffer.getChannelData(0);
        // Reproducible synthetic pluck, not a recording or hardware benchmark.
        for (let i = 0; i < data.length; i++) {
          const t = i / context.sampleRate;
          data[i] = 0.2 * Math.exp(-4 * (t % 0.5)) *
            (Math.sin(2 * Math.PI * 110 * t) + 0.3 * Math.sin(2 * Math.PI * 220 * t));
        }
        sample.buffer = buffer;
        sample.loop = true;
        this.sample = sample;
        this.source = sample;
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: {
          ...(options.input ? { deviceId: { exact: options.input } } : {}),
          echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          channelCount: { ideal: 2 }, latency: { ideal: 0 },
        } as MediaTrackConstraints, video: false });
        if (generation !== this.generation) {
          stream.getTracks().forEach(track => track.stop());
          throw new Error('Audio start cancelled.');
        }
        this.stream = stream;
        const track = stream.getAudioTracks()[0];
        this.settings = track.getSettings();
        if (this.settings.channelCount && options.channel >= this.settings.channelCount) {
          throw new Error('Selected input channel is unavailable. Select channel 1.');
        }
        track.onended = () => this.fail('Audio input disconnected. Reconnect and start again.');
        track.onmute = () => this.fail('Audio input became unavailable. Start again when ready.');
        const source = context.createMediaStreamSource(stream);
        const splitter = context.createChannelSplitter(Math.max(2, this.settings.channelCount ?? 2));
        source.connect(splitter);
        this.source = splitter;
      }
      this.worklet = new AudioWorkletNode(context, 'patchcraft-monitor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1,
        channelCountMode: 'explicit',
      });
      this.worklet.port.onmessage = event => {
        this.telemetry = event.data as Telemetry;
        this.lastTelemetry = performance.now();
      };
      this.worklet.onprocessorerror = () => this.fail('Audio processor failed. Output muted; restart monitoring.');
      this.dry = context.createGain();
      this.wet = context.createGain();
      this.level = context.createGain();
      this.level.gain.value = 0;
      this.filter = context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 2500;
      this.filter.Q.value = 0.707;
      this.dry.gain.value = 1;
      this.wet.gain.value = 0;
      this.source!.connect(this.worklet, this.sample ? 0 : options.channel, 0);
      this.worklet.connect(this.dry).connect(this.level);
      this.worklet.connect(this.filter).connect(this.wet).connect(this.level);
      this.level.connect(context.destination);
      context.onstatechange = () => {
        if (!this.intentionalStop && context.state !== 'running') {
          this.interruptions++;
          this.fail('Audio context interrupted. Output muted; start again to resume.');
        }
      };
      this.sample?.start();
    } catch (error) {
      if (generation === this.generation) await this.stop();
      throw error;
    }
  }

  update(db: number, wet: number, cutoff: number, bypass: boolean, muted: boolean) {
    const context = this.context;
    if (!context || !this.level || !this.dry || !this.wet || !this.filter) return;
    const mix = mixGains(wet, bypass);
    const time = context.currentTime;
    // AudioParam automation remains on the rendering thread if the UI stalls.
    this.level.gain.setTargetAtTime(muted ? 0 : decibelsToGain(db), time, 0.015);
    this.dry.gain.setTargetAtTime(mix.dry, time, 0.015);
    this.wet.gain.setTargetAtTime(mix.wet, time, 0.015);
    this.filter.frequency.setTargetAtTime(bounded(cutoff, 80, context.sampleRate * 0.45, 2500), time, 0.02);
  }

  private fail(message: string) {
    if (this.intentionalStop) return;
    // Immediate mute is intentional for failures, unlike normal smoothed controls.
    if (this.level && this.context) {
      this.level.gain.cancelScheduledValues(this.context.currentTime);
      this.level.gain.value = 0;
      this.level.disconnect();
    }
    this.onFailure(message);
    void this.stop();
  }

  async stop() {
    ++this.generation;
    this.intentionalStop = true;
    const context = this.context;
    this.context = undefined;
    if (context) context.onstatechange = null;
    if (this.level) {
      this.level.gain.cancelScheduledValues(context?.currentTime ?? 0);
      this.level.gain.value = 0;
      this.level.disconnect();
    }
    this.stream?.getTracks().forEach(track => { track.onended = null; track.onmute = null; track.stop(); });
    this.stream = undefined;
    this.sample?.stop();
    this.sample = undefined;
    if (this.worklet) { this.worklet.port.onmessage = null; this.worklet.port.close(); }
    if (context && context.state !== 'closed') await context.close();
  }
}
