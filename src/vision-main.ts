import './vision.css';
import { CameraInput, type CameraSample } from './vision/camera';
import { distribution } from './diagnostics';
import { ControlGraph, starter, validatePatch, effects, type Effect, type Patch, type Signal } from './control/patch';
import { MidiOutput } from './midi/output';
import { RigPanel } from './midi/rig-panel';
import { AudioEngine } from './audio/engine';

document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="/vision.html">◈ PATCHCRAFT <span>YNY LABS</span></a><span class="tag">CAMERA → YOUR MUSIC</span></header>
<main><div class="intro"><p class="eyebrow">A SIMPLE LIVE CONTROL TEST</p><h1>Light. Motion.<br><em>Your sound.</em></h1><p>Use your camera to control an effect already mapped in your DAW.<br>Your camera and MIDI stay in this browser.</p></div>
<div class="workspace">
<section class="panel"><div class="section-title"><span>1 · CAMERA</span><span id="camera-state" class="badge">OFF</span></div>
<div class="fields"><label>Camera<select id="camera-device"><option value="">Default camera</option></select></label><label>Analysis rate<select id="fps"><option>30</option><option>15</option><option>60</option></select></label></div>
<div class="preview"><video id="video" muted playsinline></video><div id="roi-box" class="roi-box"></div></div>
<div class="actions"><button id="camera-start" class="primary">Start camera</button><button id="camera-stop" class="secondary">Stop camera</button></div><p id="camera-status" class="status" role="status">Camera is off. Start it to choose a device and calibrate.</p>
<details><summary>Region & target color</summary><p class="hint">Coordinates are percentages of the unmirrored camera frame.</p><div class="fields"><label>Left %<input id="roi-x" type="number" min="0" max="95" value="0"></label><label>Top %<input id="roi-y" type="number" min="0" max="95" value="0"></label><label>Width %<input id="roi-width" type="number" min="5" max="100" value="100"></label><label>Height %<input id="roi-height" type="number" min="5" max="100" value="100"></label><label>Target color<input id="target-color" type="color" value="#ff0000"></label><label>Color tolerance<input id="tolerance" type="number" min="0.01" max="1" step="0.01" value="0.35"></label></div><button id="camera-apply" class="secondary">Apply region & color</button></details>
<p class="hint">Lighting and camera exposure affect the signal. Recalibrate if the room lighting changes.</p>
<div id="feature-meters"></div></section>
<section class="panel"><div class="section-title"><span>2 · CHOOSE WHAT TO CONTROL</span></div>
<label>Starter patch<select id="preset"><option value="brightness">Light Wah · brightness → cutoff</option><option value="red">Red Drive · red → drive</option><option value="motion">Motion Tremolo · motion → depth</option></select></label>
<div class="fields"><label>Camera signal<select id="signal"><option>brightness</option><option>red</option><option>green</option><option>blue</option><option>color</option><option>motion</option></select></label><label>Target parameter<select id="effect"><option value="cutoff">Filter cutoff</option><option value="drive">Drive amount</option><option value="tremolo">Tremolo depth</option><option value="delay">Delay wet · MIDI only</option><option value="reverb">Reverb wet · MIDI only</option></select></label></div><details><summary>Fine-tune the response</summary><div class="fields"><label>Calibration minimum<input id="cal-min" type="number" min="0" max="1" step="0.001" value="0"></label><label>Calibration maximum<input id="cal-max" type="number" min="0" max="1" step="0.001" value="1"></label><label>Smoothing ms<input id="smoothing" type="number" min="0" max="2000" value="80"></label><label>Threshold mode<select id="threshold"><option value="off">Continuous</option><option value="on">Gate with hysteresis</option></select></label><label>Gate low<input id="gate-low" type="number" min="0" max="1" step="0.01" value="0.4"></label><label>Gate high<input id="gate-high" type="number" min="0" max="1" step="0.01" value="0.6"></label></div></details>
<div class="actions"><button id="calibrate" class="secondary">Calibrate for 5 seconds</button><button id="mapping-apply" class="primary">Apply mapping</button></div><p id="patch-status" role="status">Brightness → normalize → smooth → cutoff → output.</p>
<div class="meter-row"><span>Raw signal</span><meter id="raw" min="0" max="1"></meter><output id="raw-value">—</output></div><div class="meter-row"><span>Control</span><meter id="control" min="0" max="1"></meter><output id="control-value">—</output></div>
<p class="hint">Calibration samples the selected signal. Move through the full intended range during five seconds. A stationary or nearly constant signal is rejected.</p>
<div class="actions"><button id="save-local" class="secondary">Save locally</button><button id="load-local" class="secondary">Load local patch</button><button id="export-patch" class="secondary">Export patch</button></div><label>Import patch JSON<input id="import-patch" type="file" accept=".json,application/json"></label><details><summary>Validated graph JSON</summary><p class="hint">Apply mapping rebuilds the guided chain. This JSON view also supports clamp, map and rate-limit processors.</p><textarea id="graph-json" spellcheck="false" aria-label="Patch graph JSON"></textarea><button id="apply-json" class="secondary">Validate & load graph</button></details>
</section>
<section class="panel"><div class="section-title"><span>3 · CONNECT YOUR DAW</span><span id="armed" class="badge">DISARMED</span></div>
<p>Keep your guitar in its usual setup. Choose the MIDI output your DAW listens to, then map it to an effect parameter.</p><button id="midi-connect" class="primary">Find MIDI outputs</button>
<div class="fields"><label>MIDI output<select id="midi-output"><option value="">Choose output explicitly</option></select></label></div><details><summary>Advanced MIDI settings</summary><div class="fields"><label>Channel<input id="midi-channel" type="number" min="1" max="16" value="1"></label><label>CC number<input id="midi-cc" type="number" min="0" max="119" value="74"></label><label>Maximum send Hz<input id="midi-hz" type="number" min="1" max="60" value="30"></label><label>CC minimum<input id="midi-min" type="number" min="0" max="127" value="0"></label><label>CC maximum<input id="midi-max" type="number" min="0" max="127" value="127"></label></div></details>
<div class="actions"><button id="midi-arm" class="primary">Arm MIDI</button><button id="midi-disarm" class="secondary">Disarm MIDI</button></div><p id="midi-status" role="status">Disarmed. No MIDI messages are being sent.</p><p class="hint">Camera data older than 500 ms, hidden tab, changed mapping or a disconnect disarms sending. The DAW retains its last value. Recovery always requires explicit rearming.</p><a href="/docs/vision-midi.md" target="_blank" rel="noopener">Setup guide ↗</a>
</section>
<details class="panel"><summary>Optional · hear the camera control in this browser</summary><p>Hear the camera mapping using a synthetic pluck or your USB interface. Control-only MIDI works with this section stopped.</p><p class="notice">Use wired headphones, low hardware volume and direct monitoring off.</p>
<div class="fields"><label>Audio input<select id="preview-input"><option value="sample">Synthetic pluck</option><option value="">Default audio input</option></select></label><label>Input channel<select id="preview-channel"><option value="0">Channel 1</option><option value="1">Channel 2</option></select></label><label>Audio output<select id="preview-output"><option value="">OS default output</option></select></label><label>Output dB<input id="preview-db" type="number" min="-60" max="-6" value="-24"></label></div>
<button id="audio-devices" class="secondary">Find audio devices</button><div class="actions"><button id="audio-start" class="primary">Start audio preview</button><button id="audio-stop" class="secondary">Stop audio</button><button id="preview-arm" class="secondary">Arm camera preview</button></div><label><input id="preview-mute" type="checkbox" checked> Mute preview</label> <label><input id="preview-bypass" type="checkbox"> Bypass effect</label><p id="audio-status" role="status">Stopped. Preview starts muted.</p></details>
<details class="panel wide"><summary>Optional · add more MIDI controls</summary><section id="rig-panel"></section></details>
<section class="panel wide diagnostics"><div class="section-title"><span>4 · HOW DID IT FEEL?</span><button id="report" class="secondary">Save test notes</button></div><p id="diagnostics" class="mini-metrics"></p><details><summary>Technical details</summary><p class="budget">Live camera analysis and MIDI send timings are software measurements. They do not measure sensor, wireless, DAW or audible response time. Physical visual-to-effect latency has not been measured.</p>
<div class="fields"><label>Operating system<input id="env-os" placeholder="Optional"></label><label>DAW and effect<input id="env-daw" placeholder="Optional"></label><label>Camera and MIDI device<input id="env-rig" placeholder="Optional"></label><label>Notes while playing<input id="env-notes" placeholder="What worked? What felt confusing?"></label></div></details></section>
</div><footer>PATCHCRAFT / YNY LABS</footer></main>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const select = (id: string) => $<HTMLSelectElement>(id);
const field = (id: string) => $<HTMLInputElement>(id);
const value = (id: string) => field(id).value;
const num = (id: string) => Number(value(id));
const message = (id: string, text: string) => { $(id).textContent = text; };
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
let patch = starter();
let graph = new ControlGraph(patch);
const midi = new MidiOutput();
const audio = new AudioEngine();
const camera = new CameraInput($<HTMLVideoElement>('video'), patch.camera);
let lastSample: CameraSample | undefined;
let lastMeasuredSample: CameraSample | undefined;
let lastControl = 0;
let currentEffect: Effect = 'cutoff';
let browserArmed = false;
let mappingDirty = false;
let cameraBusy = false;
let audioBusy = false;
let audioRequest = 0;
let cameraRequest = 0;
let midiRequest = 0;
let calibrating: { until: number; min: number; max: number; signal: Signal; count: number } | undefined;
let midiAccess: MIDIAccess | undefined;
const history: { processing: number[]; age: number[]; readback: number[]; cadence: number[] } = { processing: [], age: [], readback: [], cadence: [] };
const rigPanel = new RigPanel({
  access: () => midiAccess, patch: () => editablePatch(), snapshot: () => structuredClone(patch),
  diagnostics: () => ({ cameraFrames: camera.frames, cameraSettings: { width: camera.settings?.width, height: camera.settings?.height, fps: camera.settings?.frameRate }, processingMs: distribution(history.processing), readbackToControlMs: distribution(history.age), window: 'Latest 1800 samples; excludes sensor and DAW latency.' }),
  loadPatch, frameAt: () => lastSample?.capturedAt ?? -Infinity, disarm,
});
const rawMeters = ['brightness', 'red', 'green', 'blue', 'color', 'motion'] as Signal[];
$('feature-meters').innerHTML = rawMeters.map(s => `<div class="meter-row"><span>${s}</span><meter id="feature-${s}" min="0" max="1"></meter><output id="feature-value-${s}">—</output></div>`).join('');
function resetMeasurements() {
  lastMeasuredSample = undefined;
  for (const array of Object.values(history)) array.length = 0;
  midi.delays.length = 0; midi.intervals.length = 0; midi.sent = 0; midi.suppressed = 0;
}
function boundedHistory(array: number[], v: number) { array.push(v); if (array.length > 1800) array.shift(); }
function node(kind: string) { return patch.nodes.find(n => n.kind === kind); }
function signal() { return (node('camera')?.params.signal ?? 'brightness') as Signal; }
function disarm(reason: string) { ++midiRequest; midi.disarm(reason); rigPanel.stop(reason); browserArmed = false; message('midi-status', reason); }
function drawRoi() {
  const r = patch.camera.roi;
  Object.assign($('roi-box').style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });
}
function showPatch() {
  select('signal').value = signal();
  select('effect').value = String(node('effect')?.params.parameter ?? 'cutoff');
  field('cal-min').value = String(node('normalize')?.params.min ?? 0);
  field('cal-max').value = String(node('normalize')?.params.max ?? 1);
  field('smoothing').value = String(node('smooth')?.params.ms ?? 0);
  select('threshold').value = node('threshold') ? 'on' : 'off';
  field('gate-low').value = String(node('threshold')?.params.low ?? 0.4);
  field('gate-high').value = String(node('threshold')?.params.high ?? 0.6);
  for (const key of ['x','y','width','height'] as const) field(`roi-${key}`).value = String(patch.camera.roi[key] * 100);
  field('target-color').value = '#' + patch.camera.target.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  field('tolerance').value = String(patch.camera.tolerance);
  if (!Array.from(select('fps').options).some(option => option.value === String(patch.camera.fps))) select('fps').add(new Option(String(patch.camera.fps)));
  select('fps').value = String(patch.camera.fps);
  for (const key of ['channel','cc','hz','min','max'] as const) field(`midi-${key}`).value = String(patch.midi[key]);
  $<HTMLTextAreaElement>('graph-json').value = JSON.stringify(patch, null, 2);
  drawRoi();
}
function loadPatch(input: unknown) {
  const next = validatePatch(input);

  const nextGraph = new ControlGraph(next);
  disarm('Patch loaded. Confirm camera, mapping and output; arm explicitly.');
  camera.stop('Patch loaded; restart camera to confirm settings.');
  mappingDirty = false; resetMeasurements();
  patch = next; graph = nextGraph; lastControl = 0;
  currentEffect = (patch.nodes.find(n => n.kind === 'effect')?.params.parameter ?? 'cutoff') as Effect;
  camera.config = patch.camera; lastSample = undefined; calibrating = undefined;
  select('midi-output').value = ''; midi.select(undefined);
  showPatch(); message('patch-status', `${patch.name} loaded. Outputs are disarmed.`);
}
function midiConfig() { return { channel: num('midi-channel'), cc: num('midi-cc'), hz: num('midi-hz'), min: num('midi-min'), max: num('midi-max'), portHint: select('midi-output').selectedOptions[0]?.text ?? '' }; }
function editablePatch() {
  if (mappingDirty) throw new Error('Apply mapping or camera settings before arming or saving.');
  const next = structuredClone(patch); next.midi = midiConfig();
  return validatePatch(next);
}
function applyMapping() {
  const next = starter(value('signal') as Signal, value('effect') as Effect);
  next.name = patch.name;
  next.camera = structuredClone(patch.camera); next.midi = midiConfig();
  next.nodes.find(n => n.kind === 'normalize')!.params = { min: num('cal-min'), max: num('cal-max') };
  next.nodes.find(n => n.kind === 'smooth')!.params.ms = num('smoothing');
  if (value('threshold') === 'on') {
    next.nodes.push({ id: 'gate', kind: 'threshold', params: { low: num('gate-low'), high: num('gate-high') } });
    next.edges = next.edges.filter(e => e.from !== 'smooth');
    next.edges.push({ from: 'smooth', to: 'gate', type: 'control' }, { from: 'gate', to: 'effect', type: 'control' });
  }
  const verified = validatePatch(next);
  disarm('Mapping changed. Arm MIDI explicitly.');
  mappingDirty = false;
  patch = verified; graph = new ControlGraph(patch); calibrating = undefined;
  lastControl = 0; currentEffect = (node('effect')?.params.parameter ?? 'cutoff') as Effect;
  showPatch(); message('patch-status', 'Mapping applied. Move through the calibrated range, then arm MIDI.');
}
function guarded(id: string, action: () => void | Promise<void>, status = 'patch-status') {
  $(id).onclick = async () => { try { await action(); } catch (e) { message(status, errorText(e)); } };
}
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
guarded('mapping-apply', applyMapping);
guarded('camera-apply', () => {
  const next = structuredClone(patch);
  next.camera.roi = { x: num('roi-x') / 100, y: num('roi-y') / 100, width: num('roi-width') / 100, height: num('roi-height') / 100 };
  next.camera.target = [1,3,5].map(i => parseInt(value('target-color').slice(i, i + 2), 16) / 255) as [number,number,number];
  next.camera.tolerance = num('tolerance'); next.camera.fps = num('fps');
  loadPatch(next);
});
select('preset').onchange = () => {
  const chosen = value('preset');
  loadPatch(starter(chosen as Signal, chosen === 'red' ? 'drive' : chosen === 'motion' ? 'tremolo' : 'cutoff'));
};
for (const id of ['signal','effect','cal-min','cal-max','smoothing','threshold','gate-low','gate-high','midi-output','midi-channel','midi-cc','midi-hz','midi-min','midi-max','roi-x','roi-y','roi-width','roi-height','target-color','tolerance','fps']) {
  $(id).addEventListener('input', () => {
    disarm('Settings edited; apply changes and arm explicitly.'); calibrating = undefined;
    if (!id.startsWith('midi-')) mappingDirty = true;
  });
}
guarded('save-local', () => { patch = editablePatch(); localStorage.setItem('patchcraft-vision-v1', JSON.stringify(patch)); message('patch-status', 'Patch saved on this browser.'); });
guarded('load-local', () => { const saved = localStorage.getItem('patchcraft-vision-v1'); if (!saved) throw new Error('No local patch saved.'); loadPatch(JSON.parse(saved)); });
guarded('export-patch', () => download('patchcraft-vision-patch.json', editablePatch()));
guarded('apply-json', () => loadPatch(JSON.parse($<HTMLTextAreaElement>('graph-json').value)));
field('import-patch').onchange = async () => {
  const file = field('import-patch').files?.[0];
  try { if (file) { if (file.size > 100000) throw new Error('Patch file exceeds 100 KB.'); loadPatch(JSON.parse(await file.text())); } }
  catch (e) { message('patch-status', errorText(e)); }
  field('import-patch').value = '';
};
camera.onStop = reason => { disarm(reason); lastSample = undefined; calibrating = undefined; message('camera-status', reason); message('camera-state', 'OFF'); };
camera.onSample = sample => {
  const now = performance.now();
  if (lastSample && now - lastSample.capturedAt > 500) disarm('Frame delivery stalled; rearm after recovery.');
  if (document.hidden || now - sample.capturedAt > 500) { disarm('Camera data stale or page hidden.'); return; }
  if (lastSample) boundedHistory(history.cadence, sample.capturedAt - lastSample.capturedAt);
  lastSample = sample; lastMeasuredSample = sample;
  boundedHistory(history.processing, sample.processingMs); boundedHistory(history.readback, sample.readbackMs);
  const raw = sample.features[signal()];
  if (calibrating) {
    const c = calibrating;
    if (c.signal !== signal()) calibrating = undefined;
    else {
      c.min = Math.min(c.min, raw); c.max = Math.max(c.max, raw); c.count++;
      message('patch-status', `Calibrating… ${Math.max(0, (c.until - now) / 1000).toFixed(1)} s`);
      if (now >= c.until) {
        calibrating = undefined;
        if (c.max - c.min < 0.01 || c.count < 10) message('patch-status', 'Calibration rejected: signal range is too small. Change the scene and retry.');
        else { field('cal-min').value = c.min.toFixed(4); field('cal-max').value = c.max.toFixed(4); applyMapping(); }
      }
    }
  }
  try {
    const outputs = graph.evaluate(sample.features, sample.capturedAt);
    // Independent output IDs route branches to their approved destinations.
    const liveOutputs = outputs.filter(o => o.id !== 'idle_out');
    const output = liveOutputs[0]; if (!output) return;
    lastControl = output.value; currentEffect = output.effect;
    boundedHistory(history.age, performance.now() - sample.capturedAt);
    midi.send(lastControl, performance.now(), sample.capturedAt);
    rigPanel.rig.dispatch(lastControl, performance.now(), sample.capturedAt);
    for (const result of liveOutputs) rigPanel.rig.dispatch(result.value, performance.now(), sample.capturedAt, result.id);
    if (browserArmed && audio.context) audio.setVisualControls(Object.fromEntries(liveOutputs.filter(o => effects[o.effect].browser).map(o => [o.effect, o.value])));
  } catch (e) { disarm(errorText(e)); message('patch-status', errorText(e)); }
};
guarded('camera-start', async () => {
  if (cameraBusy) return;
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) throw new Error('Use a current desktop Chromium browser for frame callbacks.');
  cameraBusy = true; const request = ++cameraRequest;
  $<HTMLButtonElement>('camera-start').disabled = true;
  message('camera-status', 'Requesting camera…');
  try {
    resetMeasurements();
    camera.config = patch.camera;
    await camera.start(value('camera-device'));
    if (request !== cameraRequest || !camera.stream) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const selected = camera.settings?.deviceId ?? '';
    select('camera-device').replaceChildren(new Option('Default camera', ''), ...devices.filter(d => d.kind === 'videoinput' && d.deviceId).map(d => new Option(d.label || 'Camera', d.deviceId)));
    select('camera-device').value = selected;
    message('camera-status', 'Camera live. Calibrate under your playing conditions.'); message('camera-state', 'LIVE');
  } catch (e) { if (request === cameraRequest) throw e; }
  finally { if (request === cameraRequest) { cameraBusy = false; $<HTMLButtonElement>('camera-start').disabled = false; } }
}, 'camera-status');
guarded('camera-stop', () => { ++cameraRequest; cameraBusy = false; $<HTMLButtonElement>('camera-start').disabled = false; camera.stop(); }, 'camera-status');
select('camera-device').onchange = () => { ++cameraRequest; cameraBusy = false; $<HTMLButtonElement>('camera-start').disabled = false; camera.stop('Camera changed. Start the selected camera.'); };
guarded('calibrate', () => {
  if (!lastSample || performance.now() - lastSample.capturedAt > 500) throw new Error('Start the camera before calibration.');
  disarm('Calibration running; outputs disarmed.');
  calibrating = { until: performance.now() + 5000, min: Infinity, max: -Infinity, signal: signal(), count: 0 };
});
function showPorts() {
  const selected = value('midi-output');
  select('midi-output').replaceChildren(new Option('Choose output explicitly', ''), ...Array.from(midiAccess?.outputs.values() ?? []).filter(p => p.state === 'connected').map(p => new Option(p.name || p.id, p.id)));
  select('midi-output').value = selected;
}
guarded('midi-connect', async () => {
  if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is unavailable here. Open this HTTPS link in desktop Chrome/Chromium.');
  midiAccess = await navigator.requestMIDIAccess({ sysex: false });
  midiAccess.onstatechange = () => {
    if (midi.port && midi.port.state !== 'connected') { disarm('MIDI output disconnected. Select output and rearm.'); midi.select(undefined); }
    rigPanel.portsChanged();
    showPorts();
  };
  rigPanel.portsChanged();
  showPorts(); message('midi-status', 'MIDI ready. Choose a port, map the CC in your DAW, then arm.');
}, 'midi-status');
guarded('midi-arm', async () => {
  if (document.hidden) throw new Error('Keep this tab visible while performing.');
  const confirmed = editablePatch();
  const port = midiAccess?.outputs.get(value('midi-output'));
  midi.select(port);
  const request = ++midiRequest;
  if (port && typeof port.open === 'function') await port.open();
  if (request !== midiRequest) return;
  midi.arm(confirmed.midi, performance.now(), lastSample?.capturedAt ?? -Infinity);
  patch.midi = confirmed.midi;
  message('midi-status', 'Armed. MIDI CC follows the camera.');
}, 'midi-status');
guarded('midi-disarm', () => disarm('Disarmed by user. DAW retains the last value.'), 'midi-status');
function updateAudio() {
  audio.update(num('preview-db'), 1, 2500, field('preview-bypass').checked, field('preview-mute').checked);
  if (browserArmed && effects[currentEffect].browser) audio.setVisualEffect(currentEffect, lastControl);
}
for (const id of ['preview-db','preview-mute','preview-bypass']) $(id).addEventListener('input', updateAudio);
guarded('audio-devices', async () => {
  const permission = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    select('preview-input').replaceChildren(new Option('Synthetic pluck', 'sample'), new Option('Default audio input', ''), ...devices.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default').map(d => new Option(d.label || 'Audio input', d.deviceId)));
    select('preview-output').replaceChildren(new Option('OS default output', ''), ...devices.filter(d => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default').map(d => new Option(d.label || 'Audio output', d.deviceId)));
  } finally { permission.getTracks().forEach(t => t.stop()); }
}, 'audio-status');
audio.onFailure = reason => { ++audioRequest; audioBusy = false; browserArmed = false; message('audio-status', reason); };
guarded('audio-start', async () => {
  if (audioBusy || audio.context) return;
  if (mappingDirty) throw new Error('Apply mapping settings first.');
  if (!effects[value('effect') as Effect].browser) throw new Error('This parameter is MIDI-only. Select cutoff, drive or tremolo for browser preview.');
  const request = ++audioRequest; audioBusy = true;
  field('preview-mute').checked = true;
  try {
    await audio.start({ input: value('preview-input'), output: value('preview-output'), channel: num('preview-channel'), sampleRate: 0 });
    if (request !== audioRequest) return;
    browserArmed = true; updateAudio();
    message('audio-status', 'Audio preview running muted. Unmute with wired headphones and low hardware volume.');
  } catch (e) { if (request === audioRequest) { browserArmed = false; throw e; } }
  finally { if (request === audioRequest) audioBusy = false; }
}, 'audio-status');
guarded('preview-arm', () => {
  if (mappingDirty || !lastSample || performance.now() - lastSample.capturedAt > 500 || !audio.context || !effects[currentEffect].browser) throw new Error('Apply a supported mapping, start camera and audio, then rearm.');
  browserArmed = true; updateAudio(); message('audio-status', 'Camera preview armed.');
}, 'audio-status');
guarded('audio-stop', async () => { ++audioRequest; audioBusy = false; browserArmed = false; await audio.stop(); message('audio-status', 'Audio stopped.'); }, 'audio-status');
for (const id of ['preview-input','preview-output','preview-channel']) $(id).addEventListener('change', () => { ++audioRequest; audioBusy = false; browserArmed = false; void audio.stop(); message('audio-status', 'Audio routing changed. Restart explicitly.'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) disarm('Page hidden. Return and rearm explicitly.'); });
navigator.mediaDevices?.addEventListener('devicechange', () => { disarm('Media devices changed; verify routing and rearm.'); if (audio.context) { ++audioRequest; audioBusy = false; browserArmed = false; void audio.stop(); message('audio-status', 'Media devices changed. Restart audio explicitly.'); } });
window.addEventListener('pagehide', () => { disarm('Page closed.'); camera.stop(); void audio.stop(); });
function render() {
  rigPanel.render();
  const now = performance.now();
  if (lastSample && now - lastSample.capturedAt > 500) disarm('Camera data stale. Recover camera and rearm.');
  for (const s of rawMeters) {
    const v = lastSample?.features[s] ?? 0;
    $<HTMLMeterElement>(`feature-${s}`).value = v; message(`feature-value-${s}`, v.toFixed(3));
  }
  const raw = lastSample?.features[signal()] ?? 0;
  $<HTMLMeterElement>('raw').value = raw; message('raw-value', raw.toFixed(3));
  $<HTMLMeterElement>('control').value = lastControl; message('control-value', lastControl.toFixed(3));
  message('armed', midi.armed ? 'ARMED' : 'DISARMED');
  if (!midi.armed && midi.reason !== 'Disarmed') message('midi-status', midi.reason);
  const duration = camera.stream ? (now - camera.startedAt) / 1000 : 0;
  const age = distribution(history.age), process = distribution(history.processing);
  const cadence = distribution(history.cadence);
  message('diagnostics', `Camera: ${camera.stream ? 'live' : 'off'} · ${camera.frames} processed frames · ${camera.skipped} skipped callbacks · ${duration ? (camera.frames / duration).toFixed(1) : '—'} analysis fps\nReadback → control age p95: ${age.p95?.toFixed(2) ?? '—'} ms · worker processing p95: ${process.p95?.toFixed(2) ?? '—'} ms · analysis interval p95: ${cadence.p95?.toFixed(2) ?? '—'} ms\nMIDI: ${midi.sent} sends · ${midi.suppressed} suppressed · last CC value ${midi.lastValue ?? '—'} · ${midi.reason}\nLocal readback → MIDI call p95: ${distribution(midi.delays).p95?.toFixed(2) ?? '—'} ms · send interval p95: ${distribution(midi.intervals).p95?.toFixed(2) ?? '—'} ms\nExperimental centroid direction x/y: ${lastSample?.features.directionX.toFixed(3) ?? '—'} / ${lastSample?.features.directionY.toFixed(3) ?? '—'} · changed pixels ${((lastSample?.features.changedFraction ?? 0) * 100).toFixed(1)}%\nBrowser audio: ${audio.context?.state ?? 'stopped'} · physical visual-to-effect latency: NOT MEASURED`);
}
setInterval(render, 250);
guarded('report', () => download('patchcraft-session-notes.json', {
  schemaVersion: 1, generatedAt: new Date().toISOString(), userAgent: navigator.userAgent, secureContext: window.isSecureContext,
  patch: structuredClone(patch), pendingMappingEdits: mappingDirty, camera: { active: !!camera.stream, frameCount: camera.frames, skippedCallbacks: camera.skipped, width: camera.settings?.width, height: camera.settings?.height, requestedAnalysisFps: patch.camera.fps, captureFps: camera.settings?.frameRate, analysisResolution: [160,120], elapsedSeconds: camera.startedAt ? ((camera.endedAt || performance.now()) - camera.startedAt) / 1000 : 0, latestFeatures: lastMeasuredSample?.features },
  softwareMeasurements: { processingMs: distribution(history.processing), readbackMs: distribution(history.readback), readbackToControlMs: distribution(history.age), analysisIntervalMs: distribution(history.cadence), readbackToMidiCallMs: distribution(midi.delays), midiSendIntervalMs: distribution(midi.intervals), window: 'Latest 1800 samples per metric. Local readback excludes sensor/exposure/capture delivery latency.' },
  rigMappings: rigPanel.rig.snapshot(),
  midi: { armed: midi.armed, sent: midi.sent, suppressed: midi.suppressed, lastValue: midi.lastValue, reason: midi.reason },
  browserAudio: { state: audio.context?.state ?? 'stopped', sampleRate: audio.context?.sampleRate, telemetry: audio.telemetry, browserBaseLatencySeconds: audio.context?.baseLatency, browserOutputLatencySeconds: audio.context?.outputLatency },
  physicalVisualToEffectLatencyMs: null, physicalAudioRoundTripLatencyMs: null,
  environment: { os: value('env-os'), dawPlugin: value('env-daw'), rig: value('env-rig'), observations: value('env-notes') },
}));
showPatch(); render();
if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { $<HTMLButtonElement>('camera-start').disabled = true; message('camera-status', 'Use HTTPS or localhost in a supported desktop browser.'); }

