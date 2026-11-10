import './vision.css';
import { CameraInput, type CameraSample } from './vision/camera';
import { ControlGraph, starter, validatePatch, type Patch, type Signal } from './control/patch';
import { MidiOutput } from './midi/output';
import type { Features } from './vision/features';

document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="/vision.html">◈ PATCHCRAFT</a><span class="tag">CAMERA → MIDI CC</span></header>
<main>
  <div class="intro"><p class="eyebrow">CONTROL YOUR EXISTING RIG</p><h1>Light. Motion.<br><em>Your sound.</em></h1><p>Patchcraft sends a changing MIDI CC from a camera signal or simulator.<br>Assign it to parameters in your DAW or plugin.</p></div>
  <div class="workspace">
    <section class="panel">
      <div class="section-title"><span>INPUT</span><span id="input-state" class="badge">SIMULATOR</span></div>
      <div class="fields"><label>Signal source<select id="source"><option value="simulator">Simulator</option><option value="camera">Camera</option></select></label><label>Camera signal<select id="signal"><option>brightness</option><option>red</option><option>green</option><option>blue</option><option>color</option><option>motion</option></select></label></div>
      <div id="simulator-panel" class="source-panel">
        <label class="slider">Simulated signal <output id="sim-value">0.00</output><input id="sim-slider" type="range" min="0" max="1" step="0.001" value="0.5"></label>
        <div class="actions"><button id="sim-sweep" class="secondary" aria-pressed="false">Start repeatable sweep</button></div>
        <p class="hint">Use the slider or sweep to change the value while your DAW/plugin listens for MIDI.</p>
      </div>
      <div id="camera-panel" class="source-panel" hidden>
        <div class="preview"><video id="video" muted playsinline></video><div id="roi-box" class="roi-box"></div></div>
        <div class="fields"><label>Camera<select id="camera-device"><option value="">Default camera</option></select></label><label>Analysis rate<select id="fps"><option>30</option><option>15</option><option>60</option></select></label></div>
        <div class="actions"><button id="camera-start" class="primary">Start camera</button><button id="camera-stop" class="secondary">Stop camera</button></div>
        <p id="camera-status" class="status" role="status">Camera is off.</p>
        <details><summary>Camera region and color</summary><p class="hint">Coordinates use percentages of the unmirrored camera frame.</p><div class="fields"><label>Left %<input id="roi-x" type="number" min="0" max="95" value="0"></label><label>Top %<input id="roi-y" type="number" min="0" max="95" value="0"></label><label>Width %<input id="roi-width" type="number" min="5" max="100" value="100"></label><label>Height %<input id="roi-height" type="number" min="5" max="100" value="100"></label><label>Target color<input id="target-color" type="color" value="#ff0000"></label><label>Color tolerance<input id="tolerance" type="number" min="0.01" max="1" step="0.01" value="0.35"></label></div><button id="camera-apply" class="secondary">Apply camera settings</button></details>
        <p class="hint">Lighting and exposure affect camera values. Camera processing stays local in your browser.</p>
      </div>
      <div class="meter-row"><span id="signal-label">Brightness</span><meter id="signal-meter" min="0" max="1"></meter><output id="signal-value">0.000</output></div>
      <div class="meter-row"><span>Output value</span><meter id="control-meter" min="0" max="1"></meter><output id="control-value">0.000</output></div>
    </section>
    <section class="panel">
      <div class="section-title"><span>MIDI OUTPUT</span><span id="midi-state" class="badge">STOPPED</span></div>
      <p>Choose the MIDI port your rig listens to. The selected CC is sent continuously to that port; assign it to one or more parameters in the receiving app.</p>
      <div class="fields"><label>MIDI output<select id="midi-output"><option value="">Choose an output</option></select></label><label>CC number<select id="midi-cc"></select></label></div>
      <details><summary>Channel and range</summary><div class="fields"><label>Channel<select id="midi-channel"></select></label><label>Output minimum<input id="midi-min" type="number" min="0" max="127" value="0"></label><label>Output maximum<input id="midi-max" type="number" min="0" max="127" value="127"></label><label>Maximum updates per second<select id="midi-hz"><option>15</option><option selected>30</option><option>60</option></select></label></div></details>
      <div class="actions"><button id="midi-toggle" class="primary">Start MIDI output</button></div>
      <p id="midi-status" class="status" role="status">Stopped. No MIDI messages are being sent.</p>
      <div class="notice"><strong>Assign in your DAW or plugin</strong><ol><li>Open the parameter's MIDI assignment mode in the receiving app.</li><li>Start MIDI output here, then move the camera signal or simulator.</li><li>The receiving app assigns the selected CC. You can use one CC for multiple parameters.</li></ol></div>
      <p class="hint">Only applications connected to the selected MIDI port receive this signal. If the camera stops, the page is hidden, or the MIDI device disconnects, sending stops until you start it again.</p>
    </section>
    <section class="panel wide diagnostics"><div class="section-title"><span>STATUS</span></div><p id="diagnostics" class="mini-metrics">Choose a signal source and MIDI output to begin.</p><p class="budget">Displayed timings cover browser processing and MIDI send calls. They do not measure physical camera-to-plugin response or audio round-trip latency.</p></section>
  </div>
  <footer>PATCHCRAFT</footer>
</main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const select = (id: string) => $<HTMLSelectElement>(id);
const field = (id: string) => $<HTMLInputElement>(id);
const number = (id: string) => Number(field(id).value);
const say = (id: string, text: string) => { $(id).textContent = text; };
const features = (): Features => ({ brightness: 0, red: 0, green: 0, blue: 0, color: 0, motion: 0, directionX: 0, directionY: 0, changedFraction: 0 });
for (let channel = 1; channel <= 16; channel++) select('midi-channel').add(new Option(String(channel), String(channel)));
for (let cc = 0; cc <= 119; cc++) select('midi-cc').add(new Option(`CC ${cc}`, String(cc)));
select('midi-cc').value = '74';

let patch: Patch = starter('brightness');
let graph = new ControlGraph(patch);
const camera = new CameraInput($<HTMLVideoElement>('video'), patch.camera);
const midi = new MidiOutput();
let midiAccess: MIDIAccess | undefined;
let lastSample: CameraSample | undefined;
let lastValue = 0.5;
let outputValue = 0.5;
let cameraBusy = false;
let simulatorTimer: ReturnType<typeof setInterval> | undefined;
let sweepStartedAt = 0;
let lastSendAt = 0;

function disarm(reason: string) {
  midi.disarm(reason);
  say('midi-status', reason);
  syncOutputState();
}
function syncOutputState() {
  const armed = midi.armed;
  say('midi-state', armed ? 'SENDING' : 'STOPPED');
  $('midi-state').classList.toggle('live', armed);
  const button = $<HTMLButtonElement>('midi-toggle');
  button.textContent = armed ? 'Stop MIDI output' : 'Start MIDI output';
  button.classList.toggle('secondary', armed);
  button.classList.toggle('primary', !armed);
}
function activeSignal() { return select('signal').value as Signal; }
function drawRoi() {
  const r = patch.camera.roi;
  Object.assign($('roi-box').style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });
}
function processFeatures(values: Features, at: number, source: 'camera' | 'simulator', sample?: CameraSample) {
  if (document.hidden) { disarm('Page hidden. Start MIDI output again when the page is visible.'); return; }
  if (source === 'camera' && (!sample || performance.now() - sample.capturedAt > 500)) { disarm('Camera signal is stale. Restart the camera and MIDI output.'); return; }
  try {
    const result = graph.evaluate(values, at)[0];
    if (!result) return;
    outputValue = result.value;
    lastValue = values[activeSignal()];
    lastSample = sample ?? { features: values, capturedAt: at, processingMs: 0, generation: 0, deliveredAt: performance.now(), readbackMs: 0 };
    if (midi.armed) {
      midi.send(outputValue, performance.now(), at);
      if (midi.lastSentAt !== lastSendAt) lastSendAt = midi.lastSentAt;
    }
    renderValues(source);
  } catch (error) {
    disarm(error instanceof Error ? error.message : String(error));
  }
}
function simulatorFeatures(value: number): Features {
  const data = features();
  const signal = activeSignal();
  const scale = signal === 'motion' ? 0.15 : 1;
  data[signal] = value * scale;
  data.changedFraction = signal === 'motion' ? value : 0;
  return data;
}
function tickSimulator() {
  const now = performance.now();
  const sweep = $<HTMLButtonElement>('sim-sweep').getAttribute('aria-pressed') === 'true';
  if (sweep) {
    const value = (1 + Math.sin((now - sweepStartedAt) * Math.PI * 2 / 4)) / 2;
    field('sim-slider').value = String(value);
    say('sim-value', value.toFixed(2));
    processFeatures(simulatorFeatures(value), now, 'simulator');
  } else {
    processFeatures(simulatorFeatures(number('sim-slider')), now, 'simulator');
  }
}
function ensureSimulator() {
  clearInterval(simulatorTimer);
  simulatorTimer = setInterval(tickSimulator, 33);
}
function renderValues(source: 'camera' | 'simulator' = select('source').value as 'camera' | 'simulator') {
  const value = lastSample?.features[activeSignal()] ?? lastValue;
  $<HTMLMeterElement>('signal-meter').value = Math.max(0, Math.min(1, activeSignal() === 'motion' ? value / 0.15 : value));
  $<HTMLMeterElement>('control-meter').value = outputValue;
  say('signal-value', value.toFixed(3));
  say('control-value', outputValue.toFixed(3));
  say('signal-label', activeSignal());
  say('input-state', source === 'camera' ? (camera.stream ? 'CAMERA LIVE' : 'CAMERA OFF') : 'SIMULATOR');
  $('input-state').classList.toggle('live', source === 'camera' && !!camera.stream);
  const latestAge = lastSample ? Math.max(0, performance.now() - lastSample.capturedAt) : undefined;
  say('diagnostics', `${source === 'camera' ? `Camera frames: ${camera.frames} · skipped: ${camera.skipped} · camera signal age: ${latestAge?.toFixed(1) ?? '—'} ms` : `Simulator signal: ${number('sim-slider').toFixed(2)} · ${$<HTMLButtonElement>('sim-sweep').getAttribute('aria-pressed') === 'true' ? 'repeatable sweep running' : 'manual'}`}\nMIDI: ${midi.armed ? 'sending' : 'stopped'} · sends: ${midi.sent} · suppressed duplicates/rate limit: ${midi.suppressed} · latest CC value: ${midi.lastValue ?? '—'} · send-call delay p95: ${midi.delays.length ? [...midi.delays].sort((a,b)=>a-b)[Math.floor((midi.delays.length-1)*0.95)].toFixed(2) : '—'} ms`);
}

camera.onSample = sample => processFeatures(sample.features, sample.capturedAt, 'camera', sample);
camera.onStop = reason => {
  lastSample = undefined;
  say('camera-status', reason);
  say('input-state', 'CAMERA OFF');
  disarm(reason);
  renderValues('camera');
};
function updateCameraSettings() {
  const hex = field('target-color').value;
  patch.camera = { roi: { x: number('roi-x') / 100, y: number('roi-y') / 100, width: number('roi-width') / 100, height: number('roi-height') / 100 },
    target: [1,3,5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number,number,number], tolerance: number('tolerance'), fps: number('fps') };
  patch = validatePatch(patch); graph = new ControlGraph(patch); camera.config = patch.camera; drawRoi();
  camera.stop('Camera settings updated. Start the camera again.');
}

function showPorts() {
  const selected = select('midi-output').value;
  select('midi-output').replaceChildren(new Option('Choose an output', ''), ...Array.from(midiAccess?.outputs.values() ?? []).filter(port => port.state === 'connected').map(port => new Option(port.name || port.id, port.id)));
  if (selected && midiAccess?.outputs.has(selected)) select('midi-output').value = selected;
}
async function enableMidi() {
  if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is unavailable. Open this HTTPS page in desktop Chrome or Chromium.');
  midiAccess = await navigator.requestMIDIAccess({ sysex: false });
  midiAccess.onstatechange = () => {
    if (midi.armed && (!midi.port || midi.port.state !== 'connected')) { midi.select(undefined); disarm('MIDI output disconnected. Select a port and start again.'); }
    showPorts();
  };
  showPorts();
  say('midi-status', 'MIDI ready. Choose the port your DAW or plugin listens to.');
}
$('midi-output').addEventListener('change', () => { if (midi.armed) disarm('MIDI output changed. Start again to confirm.'); midi.select(undefined); });
for (const id of ['midi-channel','midi-cc','midi-min','midi-max','midi-hz','signal']) {
  $(id).addEventListener('change', () => { if (midi.armed) disarm('Control settings changed. Start MIDI output again.'); });
}
select('signal').addEventListener('change', () => {
  const selected = activeSignal();
  disarm('Signal changed. Start MIDI output again.');
  patch.nodes.find(node => node.kind === 'camera')!.params.signal = selected;
  const normalize = patch.nodes.find(node => node.kind === 'normalize')!;
  normalize.params = { min: 0, max: selected === 'motion' ? 0.15 : 1 };
  patch = validatePatch(patch); graph = new ControlGraph(patch);
  renderValues();
});
$('source').addEventListener('change', () => {
  disarm('Input source changed. Start MIDI output again.');
  const cameraMode = select('source').value === 'camera';
  $('camera-panel').toggleAttribute('hidden', !cameraMode);
  $('simulator-panel').toggleAttribute('hidden', cameraMode);
  if (cameraMode) { clearInterval(simulatorTimer); simulatorTimer = undefined; }
  else { if (camera.stream) camera.stop('Simulator selected.'); ensureSimulator(); }
  renderValues();
});
field('sim-slider').addEventListener('input', tickSimulator);
$('sim-sweep').addEventListener('click', () => {
  const button = $<HTMLButtonElement>('sim-sweep');
  const active = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(active));
  button.textContent = active ? 'Stop repeatable sweep' : 'Start repeatable sweep';
  if (active) sweepStartedAt = performance.now();
  tickSimulator();
});
$('camera-start').addEventListener('click', async () => {
  if (cameraBusy) return;
  cameraBusy = true; $<HTMLButtonElement>('camera-start').disabled = true;
  say('camera-status', 'Requesting camera…');
  try {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) throw new Error('Use a current desktop Chrome or Chromium browser.');
    camera.config = patch.camera;
    await camera.start(select('camera-device').value);
    const devices = await navigator.mediaDevices.enumerateDevices();
    const selected = camera.settings?.deviceId ?? '';
    select('camera-device').replaceChildren(new Option('Default camera', ''), ...devices.filter(device => device.kind === 'videoinput' && device.deviceId).map(device => new Option(device.label || 'Camera', device.deviceId)));
    select('camera-device').value = selected;
    say('camera-status', 'Camera live. Change the scene to vary the selected signal.');
  } catch (error) { say('camera-status', error instanceof Error ? error.message : String(error)); }
  finally { cameraBusy = false; $<HTMLButtonElement>('camera-start').disabled = false; renderValues('camera'); }
});
$('camera-stop').addEventListener('click', () => camera.stop('Camera stopped.'));
select('camera-device').addEventListener('change', () => { if (camera.stream) camera.stop('Camera changed. Start it again.'); });
$('camera-apply').addEventListener('click', () => {
  try { updateCameraSettings(); say('camera-status', 'Settings applied. Start the camera again.'); }
  catch (error) { say('camera-status', error instanceof Error ? error.message : String(error)); }
});
$('midi-toggle').addEventListener('click', async () => {
  if (midi.armed) { disarm('Stopped. The receiving app keeps its last value.'); return; }
  try {
    if (!midiAccess) await enableMidi();
    if (document.hidden) throw new Error('Keep this tab visible while sending MIDI.');
    if (select('source').value === 'camera' && (!camera.stream || !lastSample || performance.now() - lastSample.capturedAt > 500)) throw new Error('Start the camera and wait for a fresh signal first.');
    if (select('source').value === 'simulator') tickSimulator();
    if (!select('midi-output').value) throw new Error('MIDI is ready. Choose an output port, then start MIDI output.');
    const port = midiAccess?.outputs.get(select('midi-output').value);
    midi.select(port);
    if (port?.open) await port.open();
    const settings = { channel: Number(select('midi-channel').value), cc: Number(select('midi-cc').value), hz: number('midi-hz'), min: number('midi-min'), max: number('midi-max') };
    const now = performance.now();
    if (!lastSample) throw new Error('Wait for a fresh input value first.');
    midi.arm(settings, now, lastSample.capturedAt);
    patch.midi = { ...patch.midi, ...settings, portHint: select('midi-output').selectedOptions[0]?.text ?? '' };
    say('midi-status', `Sending CC ${settings.cc} on channel ${settings.channel}. Move the input while the receiving app listens.`);
    syncOutputState();
    if (select('source').value === 'simulator') tickSimulator();
  } catch (error) { disarm(error instanceof Error ? error.message : String(error)); }
});

document.addEventListener('visibilitychange', () => { if (document.hidden) disarm('Page hidden. Start MIDI output again when visible.'); });
window.addEventListener('pagehide', () => { disarm('Page closed.'); camera.stop(); clearInterval(simulatorTimer); });
ensureSimulator();
if (!window.isSecureContext || !navigator.mediaDevices) { $<HTMLButtonElement>('camera-start').disabled = true; say('camera-status', 'Use HTTPS or localhost in a supported desktop browser.'); }
drawRoi();
renderValues('simulator');
syncOutputState();
setInterval(() => {
  if (select('source').value === 'camera' && midi.armed && (!lastSample || performance.now() - lastSample.capturedAt > 500)) disarm('Camera signal is stale. Sending stopped.');
  renderValues();
}, 250);
