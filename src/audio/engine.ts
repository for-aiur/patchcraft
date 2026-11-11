import { LiveEffects, type LiveEffectId, type LiveEffectControl } from './live-effects';
import workletURL from './monitor-worklet.js?url&no-inline';
import { bounded, decibelsToGain, mixGains } from './parameters.mjs';

export type Telemetry = {
  blocks: number; frameGaps: number; invalidSamples: number;
  clippedSamples: number; peak: number; renderedSeconds: number;
};
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };
export type StartOptions = { input: string; output: string; channel: number; sampleRate: number; liveEffects?: boolean };

/** Owns the audio graph only; no camera, control transport or UI dependency. */
export class AudioEngine {
  context?: SinkContext;
  stream?: MediaStream;
  settings?: MediaTrackSettings;
  telemetry?: Telemetry;
  lastTelemetry = 0;
  interruptions = 0;
  private liveEffects?: LiveEffects;
  private worklet?: AudioWorkletNode;
  private filter?: BiquadFilterNode;
  private dry?: GainNode;
  private wet?: GainNode;
  private level?: GainNode;
  private drive?: GainNode;
  private driveDry?: GainNode;
  private driveWet?: GainNode;
  private shaper?: WaveShaperNode;
  private tremolo?: GainNode;
  private modulation?: GainNode;
  private oscillator?: OscillatorNode;
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
        if (!options.liveEffects && this.settings.channelCount && options.channel >= this.settings.channelCount) {
          throw new Error('Selected input channel is unavailable. Select channel 1.');
        }
        track.onended = () => this.fail('Audio input disconnected. Reconnect and start again.');
        track.onmute = () => this.fail('Audio input became unavailable. Start again when ready.');
        const source = context.createMediaStreamSource(stream);
        const splitter = context.createChannelSplitter(Math.max(2, this.settings.channelCount ?? 2));
        if (options.liveEffects) {
          this.source = source;
        } else {
          source.connect(splitter);
          this.source = splitter;
        }
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
      this.source!.connect(this.worklet, this.sample || options.liveEffects ? 0 : options.channel, 0);
      if (!options.liveEffects) this.worklet.connect(this.dry).connect(this.level);
      this.drive = context.createGain();
      this.driveDry = context.createGain();
      this.driveWet = context.createGain();
      this.driveWet.gain.value = 0;
      this.shaper = context.createWaveShaper();
      this.tremolo = context.createGain();
      this.modulation = context.createGain();
      this.modulation.gain.value = 0;
      this.oscillator = context.createOscillator();
      this.oscillator.frequency.value = 5;
      this.oscillator.connect(this.modulation).connect(this.tremolo.gain);
      this.oscillator.start();
      const driveCurve = new Float32Array(1024);
      for (let i = 0; i < driveCurve.length; i++) {
        driveCurve[i] = Math.tanh((i / (driveCurve.length - 1)) * 2 - 1);
      }
      this.shaper.curve = driveCurve;
      if (!options.liveEffects) this.worklet.connect(this.filter);
      this.filter.connect(this.driveDry).connect(this.tremolo);
      this.filter.connect(this.drive).connect(this.shaper).connect(this.driveWet).connect(this.tremolo);
      this.tremolo.connect(this.wet).connect(this.level);
      if (options.liveEffects) {
        this.liveEffects = new LiveEffects(context, this.worklet, this.level);
        const ceiling = context.createWaveShaper();
        ceiling.curve = Float32Array.from({length: 1025}, (_, i) => bounded(i / 512 - 1, -0.5, 0.5, 0));
        this.level.connect(ceiling).connect(context.destination);
      } else {
        this.level.connect(context.destination);
      }
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

  setLiveEffectOrder(order: readonly LiveEffectId[]) {
    this.liveEffects?.setOrder(order);
  }

  updateLiveEffect(id: LiveEffectId, control: LiveEffectControl) {
    this.liveEffects?.update(id, control);
  }

  // The adapter consumes controls only; camera processing never enters audio rendering.
  setVisualEffect(effect: string, value: number) { this.setVisualControls({[effect]: value}); }

  setVisualControls(values: Record<string, number>) {
    const c = this.context;
    if (!c || !this.drive || !this.shaper || !this.tremolo || !this.modulation || !this.filter || !this.driveDry || !this.driveWet) return;
    const cutoff = bounded(values.cutoff, 0, 1, 0), drive = bounded(values.drive, 0, 1, 0), tremolo = bounded(values.tremolo, 0, 1, 0);
    const t = c.currentTime;
    // Crossfade the bounded drive path instead of switching waveshaper curves live.
    this.driveDry.gain.setTargetAtTime(values.drive !== undefined ? 0 : 1, t, 0.02);
    this.driveWet.gain.setTargetAtTime(values.drive !== undefined ? 1 : 0, t, 0.02);
    this.filter.frequency.setTargetAtTime(values.cutoff !== undefined ? 80 * (18000 / 80) ** cutoff : c.sampleRate * 0.45, t, 0.02);
    this.drive.gain.setTargetAtTime(values.drive !== undefined ? 1 + 7 * drive : 1, t, 0.02);
    this.tremolo.gain.setTargetAtTime(values.tremolo !== undefined ? 1 - tremolo / 2 : 1, t, 0.02);
    this.modulation.gain.setTargetAtTime(values.tremolo !== undefined ? tremolo / 2 : 0, t, 0.02);
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
    this.oscillator?.stop(); this.oscillator = undefined;
    this.drive = undefined; this.shaper = undefined; this.tremolo = undefined;
    this.modulation = undefined; this.driveDry = undefined; this.driveWet = undefined;
    if (this.worklet) { this.worklet.port.onmessage = null; this.worklet.port.close(); }
    this.liveEffects = undefined;
    this.worklet = undefined;
    this.source = undefined;
    this.level = undefined;
    this.filter = undefined;
    this.dry = undefined;
    this.wet = undefined;
    if (context && context.state !== 'closed') await context.close();
  }
}
