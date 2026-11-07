import './style.css';
import { AudioEngine } from './audio/engine';

// EVR-94 / EVR-98 / EVR-107: a single-purpose local audio test surface.
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><a class="brand" href="/">◈ PATCHCRAFT <span>YNY LABS</span></a><a href="/vision.html">M2 · Camera → MIDI lab ↗</a><span class="tag">LIVE AUDIO LAB / 01</span></header>
<main>
  <div class="intro"><p class="eyebrow">PLUG IN. PLAY. MEASURE.</p><h1>Your guitar.<br><em>A clearer signal.</em></h1>
  <p>Test a live browser audio chain with your own interface.<br>Audio stays on this device.</p></div>
  <div class="workspace">
  <section class="panel setup"><div class="section-title"><span>01 / SIGNAL CHAIN</span><span id="state" class="badge">STOPPED</span></div>
    <p class="notice">Use wired headphones. Turn interface direct monitoring off. Start with your hardware volume low.</p>
    <button id="devices" class="secondary">Allow audio & find devices</button>
    <div class="fields">
      <label>Audio input<select id="input"><option value="">System default input</option><option value="sample">Synthetic pluck · no microphone</option></select></label>
      <label>Input channel<select id="channel"><option value="0">Channel 1 · mono</option><option value="1">Channel 2 · mono</option></select></label>
      <label>Audio output<select id="output"><option value="">System default output</option></select></label>
      <label>Requested sample rate<select id="rate"><option value="0">Device default</option><option value="48000">48,000 Hz</option><option value="44100">44,100 Hz</option></select></label>
    </div>
    <p id="output-support" class="hint"></p>
    <div class="transport"><button id="start" class="primary">Start monitoring ↗</button><button id="stop" class="secondary" disabled>Stop</button></div>
    <p id="status" role="status" aria-live="polite">Ready when you are. Nothing is recording.</p>
  </section>
  <section class="panel controls"><div class="section-title"><span>02 / TONE & LEVEL</span><span class="badge">LOCAL DSP</span></div>
    <div class="signal"><span>INPUT</span><i>→</i><span>WORKLET</span><i>→</i><span>LOW-PASS</span><i>→</i><span>OUTPUT</span></div>
    <label class="slider">Output level <output id="level-value">−24 dB</output><input id="level" type="range" min="-60" max="-6" value="-24" step="1"></label>
    <label class="slider">Low-pass cutoff <output id="cutoff-value">2500 Hz</output><input id="cutoff" type="range" min="80" max="18000" value="2500" step="10"></label>
    <label class="slider">Wet mix <output id="wet-value">50%</output><input id="wet" type="range" min="0" max="100" value="50"></label>
    <div class="toggles"><label><input id="bypass" type="checkbox" checked> Bypass effect</label><label><input id="mute" type="checkbox"> Mute output</label></div>
    <p class="hint">Bypass keeps the safe output level. It does not bypass browser or interface latency. Space toggles mute outside form controls.</p>
    <label class="meter-label">Input peak <meter id="peak" min="0" max="1" low="0.01" high="0.9" optimum="0.4" value="0"></meter><span id="peak-value">—</span></label>
  </section>
  <section class="panel diagnostics"><div class="section-title"><span>03 / DIAGNOSTICS</span><button id="export" class="text-button">Export report ↓</button></div>
    <div class="metrics">
      <div><p>Browser base latency</p><strong id="base">—</strong><small>API-reported · excludes input path</small></div>
      <div><p>Browser output latency</p><strong id="out-latency">—</strong><small>API-reported · support varies</small></div>
      <div class="physical"><p>Physical round-trip</p><strong>Not measured</strong><small>Requires wired loopback test below</small></div>
    </div>
    <dl id="details"></dl>
    <p class="hint">Frame discontinuities and telemetry age are indicators, not a count of audible glitches. Browser APIs cannot prove glitch-free playback. Camera/control metrics: not applicable in this PoC.</p>
  </section>
  <section class="panel guide"><div class="section-title"><span>04 / REAL-WORLD CHECK</span><span class="badge">WIRED LOOPBACK</span></div>
    <h2>Listen first. Measure the whole path.</h2>
    <ol><li>Select your USB interface and the guitar input channel. Disable direct monitoring and DAW input monitoring.</li>
    <li>Start in bypass at −24 dB. Play, then try the low-pass. Check for dropouts and stop/restart behavior.</li>
    <li>For physical latency, split an external test pulse into a reference recorder channel and Patchcraft input. Record Patchcraft output on a second, synchronized channel.</li>
    <li>With monitoring isolated from the reference recorder, compare pulse onset sample positions. Repeat at least 10 times: Δ samples / recorder sample rate × 1000 = ms.</li></ol>
    <p class="hint">Never connect speaker-level outputs to interface inputs. Use line-level routing and leave phantom power off. A feedback loop can be loud: consult the procedure before wiring.</p>
    <a href="/docs/loopback.md" target="_blank" rel="noopener">Read the full loopback & Erdem test procedure ↗</a>
  </section>
  </div><footer>PATCHCRAFT / YNY LABS <span>Milestone 01 · No hardware latency claims yet.</span></footer>
</main>`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = element<HTMLSelectElement>('input');
const output = element<HTMLSelectElement>('output');
const channel = element<HTMLSelectElement>('channel');
const rate = element<HTMLSelectElement>('rate');
const level = element<HTMLInputElement>('level');
const cutoff = element<HTMLInputElement>('cutoff');
const wet = element<HTMLInputElement>('wet');
const bypass = element<HTMLInputElement>('bypass');
const mute = element<HTMLInputElement>('mute');
const start = element<HTMLButtonElement>('start');
const stop = element<HTMLButtonElement>('stop');
const devicesButton = element<HTMLButtonElement>('devices');
const engine = new AudioEngine();
let busy = false;
let sessionRequest = 0;
let lastError = '';
let sessionStarted = 0;
let lastSnapshot: Record<string, unknown> = {};
let uiMaxGap = 0;
let lastTick = performance.now();
let visibleSinceTick = !document.hidden;
let deviceChangeCount = 0;
const sinkSupported = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
output.disabled = !sinkSupported;
element('output-support').textContent = sinkSupported
  ? 'Output selection is available. Stop monitoring before changing devices.'
  : 'This browser uses the OS default output. Change the output in system settings; try desktop Chromium for device selection.';

function status(message: string, error = false) {
  element('status').textContent = message;
  element('status').classList.toggle('error', error);
  if (error) lastError = message;
}
function transport(running: boolean, pending = false) {
  busy = pending;
  start.disabled = running || pending;
  stop.disabled = !running && !pending;
  devicesButton.disabled = running || pending;
  for (const select of [input, output, channel, rate]) select.disabled = running || pending;
  if (!running && !pending) output.disabled = !sinkSupported;
  element('state').textContent = pending ? 'STARTING' : running ? 'LIVE' : 'STOPPED';
  element('state').classList.toggle('live', running);
}
function update() {
  element('level-value').textContent = `${level.value} dB`;
  element('cutoff-value').textContent = `${cutoff.value} Hz`;
  element('wet-value').textContent = `${wet.value}%`;
  engine.update(+level.value, +wet.value / 100, +cutoff.value, bypass.checked, mute.checked);
}
for (const control of [level, cutoff, wet, bypass, mute]) control.addEventListener('input', update);

function resetChoices(select: HTMLSelectElement, fixed: [string, string][], devices: MediaDeviceInfo[]) {
  const selected = select.value;
  select.replaceChildren();
  for (const [value, name] of [...fixed, ...devices.map((device, i) =>
    [device.deviceId, device.label || `Device ${i + 1}`] as [string, string])]) {
    select.add(new Option(name, value));
  }
  if (Array.from(select.options).some(option => option.value === selected)) select.value = selected;
}
async function enumerate() {
  const devices = (await navigator.mediaDevices.enumerateDevices())
    .filter(device => device.deviceId && device.deviceId !== 'default');
  if (busy || engine.context) return;
  resetChoices(input, [['', 'System default input'], ['sample', 'Synthetic pluck · no microphone']], devices.filter(d => d.kind === 'audioinput'));
  resetChoices(output, [['', 'System default output']], devices.filter(d => d.kind === 'audiooutput'));
}
devicesButton.onclick = async () => {
  devicesButton.disabled = true;
  try {
    const permission = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    try {
      await enumerate();
      if (!busy && !engine.context) status('Devices found. Select your interface and input channel.');
    } finally {
      permission.getTracks().forEach(track => track.stop());
    }
  } catch (error) { status(`Device access failed: ${error instanceof Error ? error.message : error}`, true); }
  finally { devicesButton.disabled = busy || !!engine.context; }
};
engine.onFailure = message => {
  ++sessionRequest;
  status(message, true);
  transport(false);
};
start.onclick = async () => {
  if (busy || engine.context) return;
  const request = ++sessionRequest;
  transport(false, true);
  status('Starting audio…');
  lastError = '';
  try {
    await engine.start({ input: input.value, output: output.value, channel: +channel.value, sampleRate: +rate.value });
    if (request !== sessionRequest) return;
    transport(true);
    sessionStarted = performance.now();
    uiMaxGap = 0;
    update();
    status(input.value === 'sample' ? 'Synthetic sample running. This does not test live input latency.' : 'Live monitoring. Raise hardware volume slowly.');
  } catch (error) {
    if (request !== sessionRequest) return;
    transport(false);
    status(`Could not start: ${error instanceof Error ? error.message : error}`, true);
  }
};
stop.onclick = async () => {
  const request = ++sessionRequest;
  await engine.stop();
  if (request !== sessionRequest) return;
  transport(false);
  status('Stopped. Audio input released.');
};
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && !/INPUT|SELECT|BUTTON|TEXTAREA/.test((event.target as HTMLElement).tagName)) {
    event.preventDefault(); mute.checked = !mute.checked; update();
  }
});
navigator.mediaDevices?.addEventListener('devicechange', () => {
  deviceChangeCount++;
  // Device changes do not silently reroute live audio to speakers.
  if (engine.context || busy) {
    ++sessionRequest;
    void engine.stop(); transport(false);
    status('Audio devices changed. Check routing and start again.', true);
  }
  void enumerate().catch(() => {});
});
window.addEventListener('pagehide', () => { void engine.stop(); });

const ms = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value)
  ? `${(value * 1000).toFixed(2)} ms` : 'Not available';
function renderDiagnostics() {
  const now = performance.now();
  if (!document.hidden && visibleSinceTick && engine.context) uiMaxGap = Math.max(uiMaxGap, Math.max(0, now - lastTick - 500));
  visibleSinceTick = !document.hidden;
  lastTick = now;
  const context = engine.context;
  const telemetry = engine.telemetry;
  element('base').textContent = ms(context?.baseLatency);
  element('out-latency').textContent = ms(context?.outputLatency);
  const peak = telemetry?.peak ?? 0;
  element<HTMLMeterElement>('peak').value = Math.min(1, peak);
  element('peak-value').textContent = peak ? `${(20 * Math.log10(peak)).toFixed(1)} dBFS` : 'Silent / no data';
  const telemetryAge = engine.lastTelemetry ? now - engine.lastTelemetry : undefined;
  const rows: Record<string, string> = {
    'Audio state': context?.state ?? 'stopped',
    'Actual context sample rate': context ? `${context.sampleRate} Hz` : '—',
    'Capture sample rate': engine.settings?.sampleRate ? `${engine.settings.sampleRate} Hz` : 'Not reported / sample',
    'Capture processing': engine.settings ? `Echo ${engine.settings.echoCancellation ?? '?'} / noise ${engine.settings.noiseSuppression ?? '?'} / AGC ${engine.settings.autoGainControl ?? '?'}` : '—',
    'Session duration': context ? `${((now - sessionStarted) / 1000).toFixed(0)} s` : '—',
    'Worklet render blocks': `${telemetry?.blocks ?? 0}`,
    'Render frame discontinuities': `${telemetry?.frameGaps ?? 0} (not physical glitches)`,
    'Input clipped / invalid samples': `${telemetry?.clippedSamples ?? 0} / ${telemetry?.invalidSamples ?? 0}`,
    'Telemetry age (UI delivery)': telemetryAge === undefined ? 'Waiting / stopped' : `${telemetryAge.toFixed(0)} ms${context && telemetryAge > 2500 ? ' · delayed; inspect playback' : ''}`,
    'Largest visible UI timer delay': `${uiMaxGap.toFixed(0)} ms (not audio latency)`,
    'Context interruptions / device changes': `${engine.interruptions} / ${deviceChangeCount}`,
    'Page visibility': document.visibilityState,
  };
  element('details').replaceChildren(...Object.entries(rows).flatMap(([label, value]) => {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    return [dt, dd];
  }));
  if (context) lastSnapshot = {
    contextState: context.state, contextSampleRate: context.sampleRate,
    browserBaseLatencySeconds: context.baseLatency ?? null,
    browserOutputLatencySeconds: context.outputLatency ?? null,
    captureSettings: engine.settings ?? null, telemetry: telemetry ?? null,
    telemetryAgeMs: telemetryAge ?? null, visibleUiTimerDelayMs: uiMaxGap,
    contextInterruptions: engine.interruptions, deviceChangeCount,
    durationSeconds: (now - sessionStarted) / 1000,
  };
}
setInterval(renderDiagnostics, 500);
renderDiagnostics();
element('export').onclick = () => {
  renderDiagnostics();
  const report = {
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent, platform: navigator.platform,
    secureContext: window.isSecureContext, outputSelectionSupported: sinkSupported,
    selectedInput: input.selectedOptions[0]?.text, selectedOutput: output.selectedOptions[0]?.text,
    selectedChannel: +channel.value + 1, requestedSampleRate: +rate.value || 'default',
    controls: { outputDb: +level.value, wet: +wet.value / 100, cutoffHz: +cutoff.value, bypass: bypass.checked, mute: mute.checked },
    currentState: engine.context?.state ?? 'stopped', lastSessionSnapshot: lastSnapshot, lastError,
    physicalRoundTripLatencyMs: null,
    physicalMeasurement: 'Not measured. Follow docs/loopback.md; browser latency is not physical RTT.',
    manualEnvironment: { osVersion: '', interfaceModel: '', driverVersion: '', hardwareBuffer: '',
      directMonitoringDisabled: null, audibleGlitches: null, playingExperience: '', loopbackMethod: '', loopbackSamples: [] },
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'patchcraft-local-report.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
if (!window.isSecureContext || typeof AudioContext === 'undefined' || !navigator.mediaDevices?.getUserMedia || !('audioWorklet' in AudioContext.prototype)) {
  start.disabled = true; devicesButton.disabled = true;
  status('This test needs HTTPS or localhost and a browser supporting Web Audio / AudioWorklet.', true);
}
