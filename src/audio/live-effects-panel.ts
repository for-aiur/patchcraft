import { AudioEngine } from './engine';
import { liveEffects, type LiveEffectId } from './live-effects';
import './live-effects-panel.css';

const effectHints: Record<LiveEffectId, string> = {
  chorus: 'Higher makes the sound thicker and more wavy.',
  compressor: 'Higher turns down loud peaks more.',
  delay: 'Higher makes the echoes louder.',
  distortion: 'Higher makes the sound rougher.',
  eq: 'Low cuts the mids. Middle is neutral. High boosts them.',
  filter: 'Low sounds darker. High lets more treble through.',
  flanger: 'Higher makes the sweeping, jet-like sound stronger.',
  phaser: 'Higher makes the swirling sound stronger.',
  reverb: 'Higher makes the room sound more audible.',
  tremolo: 'Higher makes the volume pulse more deeply.',
};

type NamedSignal = { id: string; name: string; enabled: boolean };

export function mountLiveEffects(host: HTMLElement, readSignal: (id: string) => number | undefined) {
  host.innerHTML = `
    <details class="audio-fx">
      <summary class="section-title"><span>AUDIO EFFECTS</span><span class="badge" data-audio="badge">Audio off</span></summary>
      <div class="audio-fx-body">
        <div class="audio-device-heading"><p>Play through Patchcraft, with or without MIDI.</p><button type="button" class="audio-scan" data-audio="scan"><span aria-hidden="true">↻</span> Find audio devices</button></div>
        <div class="audio-fields">
          <label>Audio input<select data-audio="input"><option value="sample">Demo tone</option><option value="">System default input</option></select></label>
          <label>Audio output<select data-audio="output"><option value="">System default output</option></select></label>
        </div>
        <p class="mini">Turn on a card, then move its slider or choose a Named Signal to move it for you. Use the arrows to change the order in which effects are applied.</p>
        <div class="audio-effect-cards"></div>
        <div class="audio-fields">
          <label>Output level<input data-audio="volume" type="range" min="-60" max="-6" step="1" value="-30"></label>
        </div>
        <div class="audio-device-heading">
          <div class="actions"><button type="button" class="primary" data-audio="start">Start audio</button><label class="audio-bypass"><input type="checkbox" data-audio="bypass"> Bypass</label></div>
          <div class="audio-readouts"><label>Input level <meter data-audio="input-level" min="0" max="1" value="0"></meter></label></div>
        </div>
        <p class="status" role="status" data-audio="status">Use wired headphones when monitoring a microphone.</p>
        <p class="mini" data-audio="latency" hidden></p>
      </div>
    </details>`;
  const get = <T extends HTMLElement>(name: string) => host.querySelector<T>(`[data-audio="${name}"]`)!;
  const input = get<HTMLSelectElement>('input'), output = get<HTMLSelectElement>('output');
  const volume = get<HTMLInputElement>('volume'), bypass = get<HTMLInputElement>('bypass');
  const scan = get<HTMLButtonElement>('scan'), start = get<HTMLButtonElement>('start');
  const status = get('status'), latency = get('latency'), badge = get('badge');
  const meter = get<HTMLMeterElement>('input-level');
  const engine = new AudioEngine();
  const supportsSink = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
  let state: 'off' | 'starting' | 'running' = 'off';
  let generation = 0;
  let discovering = false;
  let lastVolume = NaN;
  const controls = new Map<LiveEffectId, {
    on: HTMLInputElement; signal: HTMLSelectElement; value: HTMLInputElement; live: HTMLOutputElement; last: string;
  }>();
  const cards = host.querySelector('.audio-effect-cards')!;
  const order: LiveEffectId[] = [];
  const rows = new Map<LiveEffectId, HTMLElement>();
  for (const [id, item] of Object.entries(liveEffects)) {
    const card = document.createElement('section');
    const effect = id as LiveEffectId;
    order.push(effect);
    rows.set(effect, card);
    card.className = 'audio-effect-card';
    card.setAttribute('aria-label', item.name);
    card.innerHTML = `
      <label class="audio-card-toggle"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="${item.icon}"/></svg><strong>${item.name}</strong><input type="checkbox" ${id === 'filter' ? 'checked' : ''} aria-label="Enable ${item.name}"></label>
      <div class="audio-card-parameter"><strong>${item.parameter}</strong><p class="audio-card-hint">${effectHints[effect]}</p></div>
      <div class="audio-card-controls">
        <label>Control source<select><option value="">Manual</option></select></label>
        <label>Manual ${item.parameter.toLowerCase()}<input type="range" min="0" max="1" step="0.01" value="0.5"></label>
        <output>Manual · 50%</output>
      </div>
      <div class="audio-order">
        <button type="button" aria-label="Move ${item.name} up" data-move="-1">↑</button>
        <button type="button" aria-label="Move ${item.name} down" data-move="1">↓</button>
      </div>`;
    for (const button of card.querySelectorAll<HTMLButtonElement>('[data-move]')) {
      button.addEventListener('click', () => {
        const from = order.indexOf(effect);
        const to = from + Number(button.dataset.move);
        if (to < 0 || to >= order.length) return;
        const neighbor = rows.get(order[to])!;
        [order[from], order[to]] = [order[to], order[from]];
        neighbor.insertAdjacentElement(to < from ? 'beforebegin' : 'afterend', card);
        engine.setLiveEffectOrder(order);
        syncOrderButtons();
        (button.disabled ? card.querySelector<HTMLButtonElement>('[data-move]:enabled') : button)?.focus();
      });
    }
    const on = card.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    const signal = card.querySelector('select')!;
    const value = card.querySelector<HTMLInputElement>('input[type=range]')!;
    const live = card.querySelector('output')!;
    controls.set(id as LiveEffectId, {on, signal, value, live, last: ''});
    on.addEventListener('change', update);
    signal.addEventListener('change', update);
    value.addEventListener('input', update);
    cards.append(card);
  }

  function syncOrderButtons() {
    order.forEach((id, index) => {
      const row = rows.get(id)!;
      row.querySelector<HTMLButtonElement>('[data-move="-1"]')!.disabled = index === 0;
      row.querySelector<HTMLButtonElement>('[data-move="1"]')!.disabled = index === order.length - 1;
    });
  }
  syncOrderButtons();

  function syncButtons() {
    input.disabled = output.disabled = state !== 'off' || discovering;
    output.disabled ||= !supportsSink;
    scan.disabled = state !== 'off' || discovering;
    start.disabled = discovering;
    start.textContent = state === 'starting' ? 'Cancel' : state === 'running' ? 'Stop audio' : 'Start audio';
    badge.textContent = state === 'running' ? 'Audio on' : state === 'starting' ? 'Starting audio' : 'Audio off';
    badge.classList.toggle('live', state === 'running');
    latency.hidden = state !== 'running';
  }

  async function devices() {
    const all = await navigator.mediaDevices.enumerateDevices();
    function fill(select: HTMLSelectElement, kind: MediaDeviceKind, defaults: HTMLOptionElement[]) {
      const selected = select.value;
      const entries = all.filter(device => device.kind === kind && device.deviceId && device.deviceId !== 'default');
      select.replaceChildren(...defaults, ...entries.map((device, i) =>
        new Option(device.label || `Audio ${kind === 'audioinput' ? 'input' : 'output'} ${i + 1}`, device.deviceId)));
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
    }
    fill(input, 'audioinput', [new Option('Demo tone', 'sample'), new Option('System default input', '')]);
    fill(output, 'audiooutput', [new Option('System default output', '')]);
    syncButtons();
  }

  function update() {
    const peak = state === 'running' ? Math.min(1, engine.telemetry?.peak ?? 0) : 0;
    if (meter.value !== peak) meter.value = peak;
    const db = Number(volume.value);
    if (state === 'running' && db !== lastVolume) {
      engine.update(db, 0, 2500, false, false);
      lastVolume = db;
    }
    for (const [id, control] of controls) {
      const mapped = control.signal.value ? readSignal(control.signal.value) : undefined;
      const normalized = mapped ?? Number(control.value.value);
      const enabled = control.on.checked && !bypass.checked;
      const key = enabled ? String(normalized) : 'off';
      if (state === 'running' && key !== control.last) {
        engine.updateLiveEffect(id, {enabled, value: normalized});
        control.last = key;
      }
      const mode = mapped === undefined ? (control.signal.value ? 'Manual fallback' : 'Manual') : 'Named signal';
      const label = bypass.checked ? 'Bypassed' : `${mode} · ${Math.round(normalized * 100)}%`;
      if (control.live.textContent !== label) control.live.textContent = label;
    }
  }

  function stop(message: string) {
    ++generation;
    state = 'off';
    lastVolume = NaN;
    for (const control of controls.values()) control.last = '';
    meter.value = 0;
    void engine.stop();
    status.textContent = message;
    syncButtons();
  }

  engine.onFailure = stop;
  scan.addEventListener('click', async () => {
    discovering = true;
    syncButtons();
    let permission: MediaStream | undefined;
    try {
      permission = await navigator.mediaDevices.getUserMedia({audio: true});
      await devices();
      status.textContent = supportsSink ? 'Choose an input and output, then start audio.' : 'Choose an input here. Select your output in system sound settings.';
    } catch {
      await devices().catch(() => {});
      status.textContent = 'Microphone access unavailable. Check browser permissions or try the demo tone.';
    } finally {
      permission?.getTracks().forEach(track => track.stop());
      discovering = false;
      syncButtons();
    }
  });
  start.addEventListener('click', async () => {
    if (state !== 'off') { stop('Audio stopped.'); return; }
    const token = ++generation;
    state = 'starting';
    syncButtons();
    try {
      await engine.start({input: input.value, output: supportsSink ? output.value : '', channel: 0, sampleRate: 0, liveEffects: true});
      if (token !== generation) return;
      engine.setLiveEffectOrder(order);
      state = 'running';
      syncButtons();
      update();
      status.textContent = 'Audio running.';
      const context = engine.context!;
      const ms = (seconds?: number) => typeof seconds === 'number' && Number.isFinite(seconds) ? `${(seconds * 1000).toFixed(1)} ms` : 'unavailable';
      latency.textContent = `${context.sampleRate} Hz · Browser estimates: base ${ms(context.baseLatency)}, output ${ms(context.outputLatency)}. Physical round-trip latency requires loopback.`;
    } catch (error) {
      if (token === generation) stop(error instanceof Error ? error.message : 'Audio could not start.');
    }
  });
  volume.addEventListener('input', update);
  bypass.addEventListener('change', update);
  input.addEventListener('change', syncButtons);
  navigator.mediaDevices?.addEventListener('devicechange', () => {
    if (state === 'off' && !discovering) void devices().catch(() => {});
    if (state === 'running' && output.value) {
      void navigator.mediaDevices.enumerateDevices().then(all => {
        if (state === 'running' && output.value && !all.some(device => device.kind === 'audiooutput' && device.deviceId === output.value)) {
          stop('Audio output disconnected. Select an output and start again.');
          void devices().catch(() => {});
        }
      }).catch(() => {});
    }
  });
  syncButtons();
  if (!supportsSink) status.textContent += ' Select your output in system sound settings.';
  void devices().catch(() => {});
  return {
    update,
    stop: () => { if (state !== 'off') stop('Audio stopped.'); },
    setSignals(signals: NamedSignal[]) {
      for (const {signal} of controls.values()) {
        const selected = signal.value;
        signal.replaceChildren(new Option('Manual', ''), ...signals.map(item => new Option(item.name + (item.enabled ? '' : ' (muted)'), item.id)));
        signal.value = signals.some(item => item.id === selected) ? selected : '';
      }
      update();
    },
  };
}
