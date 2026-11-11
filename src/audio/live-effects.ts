type Effect = {
  name: string;
  parameter: string;
  icon: string;
  build: (c: BaseAudioContext, input: AudioNode, output: AudioNode) => (value: number) => void;
};

const smooth = (c: BaseAudioContext, param: AudioParam, value: number) =>
  param.setTargetAtTime(value, c.currentTime, 0.025);

function blend(c: BaseAudioContext, input: AudioNode, processed: AudioNode, output: AudioNode, max: number) {
  const dry = c.createGain(), wet = c.createGain();
  input.connect(dry).connect(output);
  processed.connect(wet).connect(output);
  return (value: number) => {
    smooth(c, wet.gain, max * value);
    smooth(c, dry.gain, 1 - max * value);
  };
}

function modulatedDelay(base: number, rate: number, feedback: number): Effect['build'] {
  return (c, input, output) => {
    const delay = c.createDelay(0.05), lfo = c.createOscillator(), depth = c.createGain();
    delay.delayTime.value = base;
    lfo.frequency.value = rate;
    depth.gain.value = 0;
    lfo.connect(depth).connect(delay.delayTime);
    lfo.start();
    input.connect(delay);
    if (feedback) {
      const loop = c.createGain();
      loop.gain.value = feedback;
      delay.connect(loop).connect(delay);
    }
    const mix = blend(c, input, delay, output, 0.5);
    return value => {
      smooth(c, depth.gain, base * 0.65 * value);
      mix(value);
    };
  };
}

export const liveEffects = {
  chorus: { name: 'Chorus', parameter: 'Depth', icon: 'M2 10Q6 2 10 10T18 10T26 10M2 15Q6 7 10 15T18 15T26 15', build: modulatedDelay(0.018, 0.85, 0) },
  compressor: { name: 'Compressor', parameter: 'Compression', icon: 'M3 22L14 11L26 7', build: (c, input, output) => {
    const node = c.createDynamicsCompressor();
    node.ratio.value = 4;
    node.attack.value = 0.008;
    node.release.value = 0.15;
    input.connect(node).connect(output);
    return v => smooth(c, node.threshold, -40 * v);
  } },
  delay: { name: 'Delay', parameter: 'Echo mix', icon: 'M4 4V22M11 8V22M18 12V22M25 16V22', build: (c, input, output) => {
    const delay = c.createDelay(0.5), feedback = c.createGain();
    delay.delayTime.value = 0.28;
    feedback.gain.value = 0.35;
    input.connect(delay);
    delay.connect(feedback).connect(delay);
    return blend(c, input, delay, output, 0.55);
  } },
  distortion: { name: 'Distortion', parameter: 'Drive', icon: 'M2 20L8 20L11 6H18L21 20H26', build: (c, input, output) => {
    const drive = c.createGain(), shape = c.createWaveShaper();
    shape.curve = Float32Array.from({length: 1025}, (_, i) => Math.tanh(3 * (i / 512 - 1)));
    input.connect(drive).connect(shape);
    const mix = blend(c, input, shape, output, 1);
    return v => { smooth(c, drive.gain, 1 + 7 * v); mix(v); };
  } },
  eq: { name: 'EQ', parameter: 'Mid gain', icon: 'M2 19Q8 19 11 10T18 13Q21 19 26 19', build: (c, input, output) => {
    const node = c.createBiquadFilter();
    node.type = 'peaking';
    node.frequency.value = 900;
    node.Q.value = 0.8;
    input.connect(node).connect(output);
    return v => smooth(c, node.gain, 24 * v - 12);
  } },
  filter: { name: 'Filter', parameter: 'Cutoff', icon: 'M2 7H11Q16 7 18 14T26 22', build: (c, input, output) => {
    const node = c.createBiquadFilter();
    node.type = 'lowpass';
    node.Q.value = 0.707;
    input.connect(node).connect(output);
    return v => smooth(c, node.frequency, 120 * (Math.min(16000, c.sampleRate * 0.45) / 120) ** v);
  } },
  flanger: { name: 'Flanger', parameter: 'Sweep depth', icon: 'M3 6L25 22M3 22L25 6M3 14H25', build: modulatedDelay(0.0035, 0.35, 0.28) },
  phaser: { name: 'Phaser', parameter: 'Sweep depth', icon: 'M2 14Q7 2 12 14T22 14L26 8M2 18Q7 10 12 18T22 18', build: (c, input, output) => {
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 0.45;
    depth.gain.value = 0;
    lfo.connect(depth);
    lfo.start();
    let chain = input;
    for (let i = 0; i < 4; i++) {
      const node = c.createBiquadFilter();
      node.type = 'allpass';
      node.frequency.value = 650 + i * 240;
      depth.connect(node.frequency);
      chain.connect(node);
      chain = node;
    }
    const mix = blend(c, input, chain, output, 0.5);
    return v => { smooth(c, depth.gain, 500 * v); mix(v); };
  } },
  reverb: { name: 'Reverb', parameter: 'Room mix', icon: 'M3 4V22M8 7V21M13 10V20M18 13V19M23 15V18', build: (c, input, output) => {
    const node = c.createConvolver();
    const length = Math.round(c.sampleRate * 0.9);
    const impulse = c.createBuffer(2, length, c.sampleRate);
    let seed = 1;
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = (seed / 2147483648 - 1) * (1 - i / length) ** 3;
      }
    }
    node.buffer = impulse;
    input.connect(node);
    return blend(c, input, node, output, 0.45);
  } },
  tremolo: { name: 'Tremolo', parameter: 'Depth', icon: 'M2 22V13M8 22V6M14 22V12M20 22V18M26 22V11', build: (c, input, output) => {
    const node = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 5;
    depth.gain.value = 0;
    lfo.connect(depth).connect(node.gain);
    lfo.start();
    input.connect(node).connect(output);
    return v => { smooth(c, node.gain, 1 - v * 0.5); smooth(c, depth.gain, v * 0.5); };
  } },
} satisfies Record<string, Effect>;

export type LiveEffectId = keyof typeof liveEffects;

export type LiveEffectControl = { enabled: boolean; value: number };

export class LiveEffects {
  private stages = new Map<LiveEffectId, {
    input: GainNode; output: GainNode; dry: GainNode; wet: GainNode;
    set: (value: number) => void; active: boolean;
  }>();
  private links: Array<[AudioNode, AudioNode]> = [];

  constructor(private context: BaseAudioContext, private input: AudioNode, private output: AudioNode) {
    for (const [key, effect] of Object.entries(liveEffects)) {
      const inlet = context.createGain(), outlet = context.createGain();
      const dry = context.createGain(), wet = context.createGain();
      wet.gain.value = 0;
      inlet.connect(dry).connect(outlet);
      wet.connect(outlet);
      const set = effect.build(context, inlet, wet);
      this.stages.set(key as LiveEffectId, {input: inlet, output: outlet, dry, wet, set, active: false});
    }
    this.setOrder([...this.stages.keys()]);
  }

  setOrder(order: readonly LiveEffectId[]) {
    for (const [from, to] of this.links) from.disconnect(to);
    this.links = [];
    let previous = this.input;
    for (const id of order) {
      const stage = this.stages.get(id)!;
      this.links.push([previous, stage.input]);
      previous = stage.output;
    }
    this.links.push([previous, this.output]);
    for (const [from, to] of this.links) from.connect(to);
  }

  update(id: LiveEffectId, control: LiveEffectControl) {
    const stage = this.stages.get(id);
    if (!stage) return;
    if (control.enabled) stage.set(Number.isFinite(control.value) ? Math.max(0, Math.min(1, control.value)) : 0);
    if (stage.active === control.enabled) return;
    stage.active = control.enabled;
    smooth(this.context, stage.dry.gain, control.enabled ? 0 : 1);
    smooth(this.context, stage.wet.gain, control.enabled ? 1 : 0);
  }
}
