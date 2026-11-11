import { startFrameClock } from './vision/frame-clock';
import { mountBuildInfo } from './build-info';
import { calibrate, validateCalibration, type Calibration } from './control/calibration';
import './visual-lab.css';
import './visual-lab-components.css';
import type { analyze } from './vision/analysis';
import type { Features } from './vision/features';
import { imageModules, validateImageStage, type ImagePipelineSettings, type ImageStage } from './vision/pipeline';
import { ModuleRegistry } from './control/visual-modules';
import { VisualGraphRuntime } from './control/visual-graph';
import { exampleFeatureSource, exampleWeightedMix, exampleResponse } from './control/example-module';
import { MidiOutput } from './midi/output';
import { evaluateControlSignal, validateControlSignal, type ControlSignal, type ControlSignalState } from './control/control-signal';

type Recipe = {
  calibration?: Record<string, Calibration>; schemaVersion: 1; id: string; name: string; tagline: string; description: string;
  image: ImagePipelineSettings; weights: { brightness: number; red: number; motion: number };
  midi: { cc: number; channel: number }; midiRoutes?: Array<{id?:string;name?:string;signalId?:string;cc:number;channel:number;min:number;max:number;enabled:boolean}>; controlSignals?: ControlSignal[]; target: string; targetColor?: string; routes?: Record<string,string>; smoothingMs?: number; steps: string[];
};
const recipes = Object.values(import.meta.glob('./recipes/*.json', { eager: true, import: 'default' })) as Recipe[];
document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="/vision.html">◈ PATCHCRAFT</a><span class="tag">VISUAL SIGNAL LAB</span></header>
<main>
  <div class="layout">
    <section class="panel setup-panel">
      <div class="section-title"><span>1 · CHOOSE A RECIPE</span><div class="recipe-heading-actions"><span id="source-state" class="badge">Choose a source</span><div class="recipe-file-actions" aria-label="Recipe file actions"><button id="load-recipe" class="icon-action" type="button" aria-label="Import recipe JSON" title="Import recipe JSON"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0 4 4m-4-4L8 7M5 17v3h14v-3"/></svg></button><button id="save-recipe" class="icon-action" type="button" aria-label="Download recipe JSON" title="Download recipe JSON"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"/></svg></button></div></div></div>
      <label>Recipe<select id="recipe-select"></select></label>
      <label>Recipe name<input id="recipe-name" type="text" maxlength="80" value="Untitled recipe"></label>
      <input id="recipe-file" type="file" accept="application/json,.json" hidden>
      <p id="recipe-status" class="status" role="status">Start with a blank canvas or adjust a recipe, then download its JSON.</p>
      <details class="recipe-guide"><summary>Recipe guide</summary><h2 id="recipe-title"></h2><p id="recipe-description" class="muted"></p>
      <p id="recipe-tagline" class="promise"></p>
      <ol id="recipe-steps" class="steps"></ol></details>
    </section>
    <section class="panel source-panel">
      <div class="section-title"><span>2 · CAMERA OR VIDEO</span><span id="pipeline-state" class="badge">Camera or video</span></div>
      <div class="video-picker"><button id="video-select-button" class="video-select-button" type="button"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6.5h5l1.4 1.7H17v7.3H3zM3 6.5V4.8h5l1.4 1.7"/></svg><span>Choose video</span></button><span id="video-file-name">No video selected</span><input id="video-file" type="file" accept="video/*" hidden></div>
      <div class="actions"><button id="demo-start" class="secondary">Play demo scene</button><button id="camera-start" class="secondary">Use camera</button><button id="source-stop" class="secondary">Stop</button><label class="check"><input id="video-loop" type="checkbox" checked> Loop</label></div>
      <video id="preview" muted playsinline controls loop></video>
      <p id="source-status" class="status" role="status">Choose a video or start the camera. Video stays in this browser.</p>
      <canvas id="capture" width="160" height="90" hidden></canvas>
      <p class="hint">The worker analyzes a downscaled frame at up to 15 FPS. Old frames are skipped if processing is still busy.</p>
    </section>
    <section class="panel pipeline-panel">
      <div class="section-title"><span>3 · IMAGE PIPELINE</span><span id="module-count" class="badge"></span></div>
      <p class="muted">Each step sends an image to the next step. Some steps also expose measured values that can be routed separately to the signal mixer.</p>
      <div id="pipeline-stages" class="pipeline-stages"></div>
      <div class="pipeline-result"><div><strong>Final processed image</strong><span>Pipeline output · used by visual signal analysis</span></div><canvas id="processed-preview" width="160" height="90" aria-label="Final image passed to visual signal analysis"></canvas></div>
      <div class="actions"><select id="add-filter" aria-label="Image module to add"></select><button id="add-filter-button" class="secondary">Add stage</button></div>
      <input id="target-color" type="color" value="#ff0000" hidden>
    </section>
    <section class="panel signal-panel">
      <div class="section-title"><span>4 · NAMED SIGNAL · <span id="signal-name">Scene Energy</span></span><span id="signal-state" class="badge">No signal yet</span></div>
      <div class="output-rack"><h3>Measured outputs</h3><p class="hint">Live measurements before weights and smoothing. Values are 0–1; region count shows the actual count (MIDI routing clamps it to 0–1). Drag an output to an input.</p><div id="measured-outputs"></div></div>
      <label class="route-label">Input 1<select id="brightness-source" class="signal-source"><option value="">Not connected</option></select></label><div class="signal input-node"><span>Input value</span><meter id="brightness-meter" min="0" max="1" value="0"></meter><output id="brightness-value">0.000</output></div>
      <label class="module-control"><span>Input 1 · weight</span><output id="brightness-weight-label"></output><input id="brightness-weight" type="range" min="0" max="1" step="0.01"></label>
      <label class="route-label">Input 2<select id="red-source" class="signal-source"><option value="">Not connected</option></select></label><div class="signal input-node"><span>Input value</span><meter id="red-meter" min="0" max="1" value="0"></meter><output id="red-value">0.000</output></div>
      <label class="module-control"><span>Input 2 · weight</span><output id="red-weight-label"></output><input id="red-weight" type="range" min="0" max="1" step="0.01"></label>
      <label class="route-label">Input 3<select id="motion-source" class="signal-source"><option value="">Not connected</option></select></label><div class="signal input-node"><span>Input value</span><meter id="motion-meter" min="0" max="1" value="0"></meter><output id="motion-value">0.000</output></div>
      <label class="module-control"><span>Input 3 · weight</span><output id="motion-weight-label"></output><input id="motion-weight" type="range" min="0" max="1" step="0.01"></label>
      <div class="mix-node" hidden><strong id="mix-name"></strong><meter id="mix-meter" min="0" max="1"></meter><output id="mix-value"></output></div>
      <div class="response-node"><div class="mix-node" hidden><strong>Smoothed control output</strong><span>Weighted inputs → smoothing → MIDI CC</span><div class="combined"><meter id="response-meter" min="0" max="1" value="0"></meter><output id="response-value">0.000</output></div></div>
        <label class="module-control" hidden><span>Response curve</span><output id="curve-label">1.00</output><input id="response-curve" type="range" min="0.25" max="4" step="0.05" value="1"></label>
        <label class="module-control"><span>Smoothing</span><output id="smoothing-label">80 ms</output><input id="response-smoothing" type="range" min="0" max="1000" step="1" value="80"></label>
      </div>
      <div class="signal-output-display"><div class="control-knob" id="control-knob" data-signal-output="scene-energy" draggable="true" role="meter" aria-label="MIDI control value" aria-valuemin="0" aria-valuemax="127" aria-valuenow="0"><i></i><span id="knob-value">0</span></div><div class="signal-history"><div class="history-legend"><span>● Raw mix</span><span>● Smoothed output</span><small>Last 20 seconds · normalized 0–1</small></div><canvas id="signal-history" width="640" height="180" aria-label="Raw and smoothed signal over the last twenty seconds"></canvas></div></div><div class="pipe-output"><span>CONTROL OUTPUT</span><b>→ CC mapping</b></div>
    </section>
    <section class="panel wide midi-panel">
      <div class="section-title"><span>5 · MIDI OUTPUT & MAPPING</span><span id="midi-state" class="badge">MIDI off</span></div>
      <p class="muted">Suggested target: <strong id="recipe-target"></strong>. Open MIDI Learn in your plugin or DAW.</p>
      <div class="midi-connection"><label>MIDI output<select id="midi-output"><option value="">Choose MIDI output</option></select></label></div>
      <div id="legacy-midi-settings" hidden><input id="midi-cc" type="number" min="0" max="119" value="74"><input id="midi-channel" type="number" min="1" max="16" value="1"></div>
      <div class="mapping-heading"><div><h3>Active CC mappings</h3><p>Named signal → CC and channel. Click a mapping to focus it for MIDI Learn.</p></div><span id="mapping-count" class="badge">0 mappings</span><button id="add-cc-route" class="add-mapping-button" type="button" aria-label="Add mapping" title="Add mapping"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg></button></div>
      <div id="cc-routes"><div class="cc-route"><label class="route-enabled-label" title="Enable mapping"><input class="route-enabled" type="checkbox" checked><span>On</span></label><label class="mapping-signal-label">Signal<select class="route-signal"></select></label><label class="route-cc-label">CC<input class="route-cc" type="number" min="0" max="119" value="74"></label><label class="route-channel-label">Channel<input class="route-channel" type="number" min="1" max="16" value="1"></label><button type="button" class="remove-cc-route" aria-label="Remove mapping" disabled>×</button></div></div>
      <label class="isolation-toggle"><input id="isolate-cc" type="checkbox"><span class="toggle-track"></span><span><strong>Send focused channel only</strong><small>Turn on when your instrument is learning a parameter.</small></span></label>
      <div class="actions"><button id="midi-toggle" class="primary">Start MIDI output</button></div>
      <p id="midi-status" class="status" role="status">Stop remains active until you choose a MIDI port and start output.</p>
      <p id="diagnostics" class="mini">No frame analyzed yet.</p>
    </section>
  </div>
  <footer></footer>
</main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const preview = el<HTMLVideoElement>('preview');
const capture = el<HTMLCanvasElement>('capture');
const captureContext = capture.getContext('2d', { willReadFrequently: true })!;
const processed = el<HTMLCanvasElement>('processed-preview');
const processedContext = processed.getContext('2d', { willReadFrequently: true })!;
const registry = new ModuleRegistry().register(exampleFeatureSource).register(exampleWeightedMix).register(exampleResponse);
const midi = new MidiOutput();
const routeOutputs: Array<{ id: string; output: MidiOutput }> = [];
let focusedRouteId = '';
let controlSignals: ControlSignal[] = [];
let activeSignalId = 'scene-energy';
const signalStates = new Map<string, ControlSignalState>();
const signalValues = new Map<string, number>();
let graph: VisualGraphRuntime;
let selectedRecipe = recipes[0];
let pipelineStages: ImageStage[] = [];
let worker: Worker | undefined;
let stream: MediaStream | undefined;
let objectUrl: string | undefined;
let pending = false;
let generation = 0;
let lastFrameAt = -Infinity;
let stopFrameClock: (() => void) | undefined;
let previousVideoTime = -1;
let previousDecodedFrames = -1;
let frameLoopActive = false;
let frames = 0, skipped = 0, processingMs = 0;
let latest: Features | undefined;
let latestAt = 0;
let signalHistory: Array<{at:number;raw:number;smoothed:number}>=[];
let calibrations: Record<string, Calibration> = {};
const captures = new Map<string, { min: number; max: number; samples: number }>();
let stageSignals: Array<ReturnType<typeof analyze>> = [];
const lastValidMeasurements = new Map<string,{value:number;at:number}>();
let target = [1, 0, 0] as [number, number, number];

function activeSettings(): ImagePipelineSettings {
  return { stages: pipelineStages.map(stage => ({ ...stage, parameters: { ...stage.parameters } })) };
}
function makeGraph() {
  graph?.dispose();
  graph = new VisualGraphRuntime({ schemaVersion: 1, nodes: [
    { id: 'brightness', module: exampleFeatureSource.id, version: 1, parameters: { feature: 'brightness' } },
    { id: 'red', module: exampleFeatureSource.id, version: 1, parameters: { feature: 'color' } },
    { id: 'motion', module: exampleFeatureSource.id, version: 1, parameters: { feature: 'motion' } },
    { id: 'scene-energy', module: exampleWeightedMix.id, version: 1, parameters: { weightA: Number(input('brightness-weight').value), weightB: Number(input('red-weight').value), weightC: Number(input('motion-weight').value) } },
    { id: 'response', module: exampleResponse.id, version: 1, parameters: { curve: Number(input('response-curve').value), smoothingMs: Number(input('response-smoothing').value) } },
  ], edges: [
    { from: 'brightness', output: 'value', to: 'scene-energy', input: 'a' },
    { from: 'red', output: 'value', to: 'scene-energy', input: 'b' },
    { from: 'motion', output: 'value', to: 'scene-energy', input: 'c' },
    { from: 'scene-energy', output: 'value', to: 'response', input: 'input' },
  ] }, registry);
}
function syncGraph(at: number) {
  for(const key of signalKeys){const raw=rawValue(key),capture=captures.get(key);if(capture&&el<HTMLSelectElement>(`${key}-source`).value){capture.min=Math.min(capture.min,raw);capture.max=Math.max(capture.max,raw);capture.samples++;}el(`${key}-cal-values`).textContent=`${raw.toFixed(3)} → ${routedValue(key).toFixed(3)}`;el<HTMLMeterElement>(`${key}-meter`).value=routedValue(key);el(`${key}-value`).textContent=routedValue(key).toFixed(3);}

  if (!latest) return;
  signalValues.clear();
  for (const signal of controlSignals) {
    const state = signalStates.get(signal.id) ?? {};
    signalStates.set(signal.id, state);
    const value = evaluateControlSignal(signal, source=>measurementValue(source,signal.id), at, state);
    signalValues.set(signal.id, value);
    const tab = document.querySelector<HTMLElement>(`[data-signal-id="${signal.id}"] .named-signal-tab-value`);
    if(tab)tab.textContent=String(Math.round(value*127));
  }
  const control = signalValues.get('scene-energy') ?? 0;
  const combined = control;
  el<HTMLMeterElement>('mix-meter').value = combined;
  el<HTMLMeterElement>('response-meter').value = control;
  el('mix-value').textContent = combined.toFixed(3);
  signalHistory.push({at,raw:combined,smoothed:control});signalHistory=signalHistory.filter(point=>point.at>=at-20000).slice(-400);drawSignalHistory(at);
  el('response-value').textContent = control.toFixed(3);
  el('control-knob').style.setProperty('--angle', `${-135+control*270}deg`); el('knob-value').textContent=String(Math.round(control*127)); el('control-knob').setAttribute('aria-valuenow',String(Math.round(control*127)));
  if (midi.armed) { for (const route of routeOutputs) { const row=[...document.querySelectorAll<HTMLElement>('.cc-route')].find(item=>item.dataset.routeId===route.id);if(!row||!route.output.armed||!row.querySelector<HTMLInputElement>('.route-enabled')!.checked||(input('isolate-cc').checked&&route.id!==focusedRouteId))continue;const signalId=row.querySelector<HTMLSelectElement>('.route-signal')!.value;if(!controlSignals.find(signal=>signal.id===signalId)?.enabled)continue;route.output.send(signalValues.get(signalId)??0,performance.now(),at); } el('midi-state').textContent = midi.armed ? 'SENDING' : 'MIDI off'; }
  el('midi-status').textContent = midi.reason;
  el('diagnostics').textContent = `Frames ${frames} · skipped ${skipped} · worker ${processingMs.toFixed(2)} ms · frame age ${(performance.now() - at).toFixed(1)} ms · MIDI sends ${midi.sent}`;
}
function drawSignalHistory(now:number){const canvas=el<HTMLCanvasElement>('signal-history'),ctx=canvas.getContext('2d')!,w=canvas.width,h=canvas.height,left=30,right=w-12,top=12,bottom=h-26;ctx.clearRect(0,0,w,h);ctx.font='11px system-ui';ctx.lineWidth=1;for(const value of [0,.25,.5,.75,1]){const y=bottom-value*(bottom-top);ctx.strokeStyle='#39414d';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillStyle='#a0aabc';ctx.fillText(String(value),2,y+4);}for(const seconds of [20,15,10,5,0]){const x=right-seconds/20*(right-left);ctx.fillStyle='#a0aabc';ctx.fillText(seconds===0?'now':`−${seconds}s`,Math.max(left,x-12),h-7);}for(const [key,color] of [['raw','#8194b8'],['smoothed','#c8ff52']] as const){ctx.strokeStyle=color;ctx.lineWidth=key==='raw'?1.3:2.5;ctx.beginPath();signalHistory.forEach((point,index)=>{const x=right-(now-point.at)/20000*(right-left),y=bottom-point[key]*(bottom-top);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();}}
function drawRegionOverlay(canvas: HTMLCanvasElement, analysis: ReturnType<typeof analyze>) {
  const bounds=analysis.largestBounds;if(!bounds)return;
  const ctx=canvas.getContext('2d')!,x=analysis.values.largestX*(canvas.width-1),y=analysis.values.largestY*(canvas.height-1);
  ctx.save();ctx.strokeStyle='#c8ff52';ctx.lineWidth=1;
  ctx.strokeRect(bounds.left+.5,bounds.top+.5,bounds.right-bounds.left+1,bounds.bottom-bounds.top+1);
  ctx.strokeStyle='#ff69bd';ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);ctx.moveTo(x,y-4);ctx.lineTo(x,y+4);ctx.stroke();ctx.restore();
}
function setupWorker() {
  pending = false;
  worker?.terminate(); worker = new Worker(new URL('./vision/pipeline-worker.ts', import.meta.url), { type: 'module' });
  const current = ++generation;
  worker.onmessage = event => {
    const result = event.data as { generation: number; capturedAt: number; error?: string; features?: Features; processed?: Uint8ClampedArray; stageOutputs?: Array<{ index: number; pixels: Uint8ClampedArray; analysis: ReturnType<typeof analyze> }>; processingMs?: number };
    if (result.generation !== generation || result.generation !== current) return;
    pending = false;
    if (result.error || !result.features || !result.processed) { el('pipeline-state').textContent = result.error ?? 'Processing failed'; return; }
    stageSignals = (result.stageOutputs ?? []).map(output => output.analysis);
    if (performance.now() - result.capturedAt > 500) return;
    processingMs = result.processingMs ?? 0; latest = result.features; latestAt = result.capturedAt;
    processedContext.putImageData(new ImageData(result.processed as Uint8ClampedArray<ArrayBuffer>, capture.width, capture.height), 0, 0);
    for (const output of result.stageOutputs ?? []) {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-stage-preview="${output.index}"]`);
      if (!canvas) continue;
      canvas.getContext('2d')!.putImageData(new ImageData(output.pixels as Uint8ClampedArray<ArrayBuffer>, capture.width, capture.height), 0, 0);
      if(imageModules.get(pipelineStages[output.index].module,pipelineStages[output.index].version).outputKind==='mask' && pipelineStages[output.index].enabled) {drawRegionOverlay(canvas,output.analysis);if(output.index===pipelineStages.length-1)drawRegionOverlay(processed,output.analysis);}
      canvas.closest('.stage-preview')?.classList.add('has-frame');
      const histogram=document.querySelector<HTMLCanvasElement>(`[data-histogram="${output.index}"]`);
      if(histogram){const ctx=histogram.getContext('2d')!;ctx.clearRect(0,0,160,40);ctx.fillStyle='#c8ff52';const max=Math.max(1,...output.analysis.histogram);output.analysis.histogram.forEach((v,i)=>ctx.fillRect(i*5,40-v/max*38,4,v/max*38));}
      const stats=document.querySelector<HTMLElement>(`[data-stage-stats="${output.index}"]`);
      if(stats){
        const stage=pipelineStages[output.index],module=stage?imageModules.get(stage.module,stage.version):undefined,v=output.analysis.values;
        if(module?.scalarOutputs?.includes('meanR'))stats.textContent=`Mean R ${v.meanR.toFixed(3)} · G ${v.meanG.toFixed(3)} · B ${v.meanB.toFixed(3)}`;
        else if(module?.scalarOutputs?.includes('mean'))stats.textContent=`Mean luminance ${v.mean.toFixed(3)} · normalized 0–1`;
        else if(module?.scalarOutputs?.includes('motion'))stats.textContent=`Frame difference ${v.motion.toFixed(3)} · normalized 0–1`;
        else if(module?.scalarOutputs?.includes('coverage'))stats.textContent=v.positionValid?`Mask area ${(v.coverage*100).toFixed(1)}% · center X ${v.x.toFixed(2)} · Y ${v.y.toFixed(2)} · ${v.blobs} regions`:`Mask area ${(v.coverage*100).toFixed(1)}% · no region detected · X/Y unavailable`;
        else if(module?.outputKind==='mask')stats.textContent=v.positionValid?`Mask ${(v.coverage*100).toFixed(1)}% · largest X ${v.largestX.toFixed(3)} · Y ${v.largestY.toFixed(3)}`:'No region detected · X/Y unavailable';
        else stats.textContent=`Mean luminance ${v.mean.toFixed(3)} · normalized 0–1`;
      }
    }
    for (const node of document.querySelectorAll<HTMLElement>('[data-measurement-value]')) {
      const [id, port] = node.dataset.measurementValue!.split('|');
      const index = pipelineStages.findIndex(stage => stage.id === id);
      const value = stageSignals[index]?.values[port as keyof ReturnType<typeof analyze>['values']];
      const positionUnavailable = ['x','y'].includes(port) && !stageSignals[index]?.values.positionValid;
      const largestUnavailable = ['largestX','largestY'].includes(port) && !stageSignals[index]?.values.largestValid;
      node.textContent = value === undefined || positionUnavailable || largestUnavailable ? 'No region' : typeof value !== 'number' ? '—' : port === 'blobs' ? String(value) : value.toFixed(3);
    }
    el('pipeline-state').textContent = 'Analyzing · 15 fps max';
    el('pipeline-state').classList.add('live'); el('signal-state').textContent = signalKeys.some(key=>el<HTMLSelectElement>(`${key}-source`).value)?'Signal connected':'Connect a filter output'; el('signal-state').classList.add('live'); syncGraph(result.capturedAt);
  };
  worker.onerror = () => { pending = false; stopSource('Image pipeline worker failed.'); };
}
function requestImageSettingsReset() {
  if (worker) setupWorker();
  stageSignals=[];
  graph.reset(); latest = undefined;
  if (!preview.paused && !frameLoopActive) { frameLoopActive = true; stopFrameClock?.(); stopFrameClock = startFrameClock(() => frameLoop(performance.now())); }
}
function clearStagePreviews() {
  document.querySelectorAll<HTMLCanvasElement>('[data-stage-preview]').forEach(canvas => canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height));
  document.querySelectorAll<HTMLElement>('.stage-preview').forEach(preview => preview.classList.remove('has-frame'));
}
function stopSource(message: string) {
  stopFrameClock?.(); stopFrameClock = undefined; previousVideoTime = -1; previousDecodedFrames = -1; pending = false;
  frameLoopActive = false;
  stream?.getTracks().forEach(track => track.stop()); stream = undefined;
  preview.pause(); preview.srcObject = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = undefined;
  worker?.terminate(); worker = undefined; generation++;
  midi.disarm(message); el('midi-state').textContent = 'MIDI off'; el('midi-state').classList.remove('live');
  el('source-state').textContent = 'Choose a source'; el('source-state').classList.remove('live');
  el('pipeline-state').textContent = 'Source stopped'; el('pipeline-state').classList.remove('live');
  el('signal-state').textContent = 'Waiting for frames'; el('signal-state').classList.remove('live');
  clearStagePreviews(); processedContext.clearRect(0, 0, processed.width, processed.height);
  el('source-status').textContent = message;
}
function frameLoop(now: number) {
  if (preview.paused || preview.ended || preview.currentTime === previousVideoTime) return;
  const decoded = preview.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
  if (decoded > 0 && decoded === previousDecodedFrames) return;
  if (stream?.getVideoTracks().some(track => track.muted || track.readyState === 'ended')) return;
  if (now - lastFrameAt >= 1000 / 15) {
    lastFrameAt = now;
    if (pending) skipped++;
    else if (preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && worker) {
      previousVideoTime = preview.currentTime;
      previousDecodedFrames = decoded;
      const capturedAt = performance.now();
      captureContext.drawImage(preview, 0, 0, capture.width, capture.height);
      const image = captureContext.getImageData(0, 0, capture.width, capture.height);
      pending = true; frames++;
      worker.postMessage({ pixels: image.data, width: capture.width, height: capture.height, settings: activeSettings(), target, tolerance: 0.35, key: `${selectedRecipe.id}:${JSON.stringify(activeSettings())}:${target.join(',')}`, capturedAt, generation }, [image.data.buffer]);
    }
  }
}
function beginAnalysis(label: string) {
  signalHistory=[];drawSignalHistory(performance.now());
  setupWorker(); graph.reset(); latest = undefined; frames = 0; skipped = 0; lastFrameAt = -Infinity;
  clearStagePreviews(); processedContext.clearRect(0, 0, processed.width, processed.height);
  el('source-state').textContent = label==='VIDEO LOOP'?'Video playing':'Camera active'; el('source-state').classList.add('live');
  el('source-status').textContent = label === 'VIDEO LOOP' ? 'Looping local video. Frames stay in this browser.' : 'Camera is live. Image processing runs locally.';
  midi.disarm('Source is live. Choose a MIDI output and start sending.');
  if (!frameLoopActive) { frameLoopActive = true; stopFrameClock?.(); stopFrameClock = startFrameClock(() => frameLoop(performance.now())); }
}
function validateMeasurements(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 16 || value.some(port => typeof port !== 'string' || !Object.hasOwn(outputLabels, port))) throw new Error('Invalid stage measurements.');
  return [...new Set(value)] as string[];
}
function migrateMeasurements(recipe: Recipe): Recipe {
  const routes = { ...recipe.routes }, stages: ImageStage[] = [];
  for (const original of recipe.image.stages) {
    const stage = { ...original, id: original.id ?? crypto.randomUUID(), parameters: { ...original.parameters }, measurements: [...(original.measurements ?? [])] };
    const module = imageModules.get(stage.module, stage.version);
    if (module.scalarOutputs && !module.outputKind && stages.length) {
      const previous = stages[stages.length - 1];
      previous.measurements = [...new Set([...(previous.measurements ?? []), ...(stage.enabled ? module.scalarOutputs : [])])];
      for (const key of Object.keys(routes)) if (routes[key]?.startsWith(`${stage.id}|`)) routes[key] = `${previous.id}|${routes[key].split('|')[1]}`;
    } else stages.push(stage);
  }
  return { ...recipe, routes, image: { stages } };
}
function availableMeasurements(kind: ImageKind) {
  return kind === 'mask' ? ['coverage','x','y','valid','largest','largestX','largestY','blobs','motion'] : kind === 'grayscale' ? ['mean','motion'] : ['meanR','meanG','meanB','mean','motion'];
}
function legacyControlSignal(recipe:Recipe):ControlSignal{return {id:'scene-energy',name:recipe.name,enabled:true,smoothingMs:recipe.smoothingMs??80,inputs:legacySignalKeys.map((key,index)=>({id:`input-${index+1}`,source:recipe.routes?.[key]??'',weight:recipe.weights[key as keyof Recipe['weights']],calibration:recipe.calibration?.[key]??{min:0,max:(recipe.routes?.[key]??'').endsWith('|blobs')?10:1,invert:false}}))};}
function showRecipe(recipe: Recipe) {
  signalHistory=[];drawSignalHistory(performance.now());
  lastValidMeasurements.clear();
  midi.disarm('Recipe changed. Choose the MIDI output and start again to confirm the new mapping.');
  midi.select(undefined); input('midi-output').value = '';
  el('midi-state').textContent = 'MIDI off'; el('midi-state').classList.remove('live');
  recipe = migrateMeasurements(recipe);
  selectedRecipe = recipe;
  controlSignals = (recipe.controlSignals ?? [legacyControlSignal(recipe)]).map(signal => validateControlSignal(signal));
  if(!controlSignals.some(signal=>signal.id==='scene-energy'))controlSignals.unshift(legacyControlSignal(recipe));
  activeSignalId='';signalStates.clear();
  captures.clear(); calibrations = { ...recipe.calibration };
  input('recipe-name').value = recipe.name;
  el('recipe-title').textContent = recipe.name; el('recipe-description').textContent = recipe.description; el('recipe-tagline').textContent = recipe.tagline;
  el('recipe-target').textContent = recipe.target;
  el('recipe-steps').replaceChildren(...recipe.steps.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  pipelineStages = recipe.image.stages.map(stage => ({ ...stage, id: stage.id ?? crypto.randomUUID(), parameters: { ...stage.parameters } }));
  for (const key of ['brightness', 'red', 'motion'] as const) input(`${key}-weight`).value = String(recipe.weights[key]);
  input('midi-cc').value = String(recipe.midi.cc); input('midi-channel').value = String(recipe.midi.channel);
  input('target-color').value = recipe.targetColor ?? '#ff0000'; target = hexTarget(input('target-color').value);
  drawPipeline();
  renderNamedSignals();activateSignal('scene-energy');
  renderMappings(recipe.midiRoutes??[{id:'mapping-main',name:'Vital · Filter cutoff',signalId:'scene-energy',cc:recipe.midi.cc,channel:recipe.midi.channel,min:0,max:127,enabled:true}]);
  input('response-curve').value='1';
  makeGraph(); requestImageSettingsReset(); revealConnectedInputs();
}
function validateRecipeImport(value: unknown): Recipe {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a recipe JSON object.');
  const raw = value as Record<string, unknown>;
  const text = (field: string, max: number) => {
    const candidate = raw[field];
    if (typeof candidate !== 'string' || candidate.length > max) throw new Error(`Invalid ${field}.`);
    return candidate;
  };
  if (raw.schemaVersion !== 1) throw new Error('Unsupported recipe schema version. Expected version 1.');
  const id = text('id', 80), name = text('name', 80), tagline = text('tagline', 200), description = text('description', 1000), targetName = text('target', 120);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !name.trim()) throw new Error('Recipe ID and name are required.');
  const image = raw.image as { stages?: unknown } | null;
  if (!image || typeof image !== 'object' || !Array.isArray(image.stages) || image.stages.length > 16) throw new Error('Recipe image stages must be an array with at most 16 items.');
  const stages = image.stages.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`Invalid image stage ${index + 1}.`);
    const stage = candidate as ImageStage;
    if (typeof stage.module !== 'string' || !Number.isInteger(stage.version) || typeof stage.enabled !== 'boolean' || !stage.parameters || typeof stage.parameters !== 'object' || Array.isArray(stage.parameters)) throw new Error(`Invalid image stage ${index + 1}.`);
    validateImageStage(stage);
    return { id: typeof stage.id==='string' ? stage.id : crypto.randomUUID(), module: stage.module, version: stage.version, enabled: stage.enabled, parameters: { ...stage.parameters }, measurements: validateMeasurements(stage.measurements) };
  });
  const weights = raw.weights as Record<string, unknown> | null;
  if (!weights || typeof weights !== 'object' || ['brightness', 'red', 'motion'].some(key => typeof weights[key] !== 'number' || !Number.isFinite(weights[key]) || Number(weights[key]) < 0 || Number(weights[key]) > 1)) throw new Error('Signal weights must be normalized numbers from 0 to 1.');
  const midiSettings = raw.midi as Record<string, unknown> | null;
  if (!midiSettings || typeof midiSettings !== 'object' || !Number.isInteger(midiSettings.cc) || Number(midiSettings.cc) < 0 || Number(midiSettings.cc) > 119 || !Number.isInteger(midiSettings.channel) || Number(midiSettings.channel) < 1 || Number(midiSettings.channel) > 16) throw new Error('MIDI CC or channel is outside the supported range.');
  if (!Array.isArray(raw.steps) || raw.steps.length > 20 || raw.steps.some(step => typeof step !== 'string' || step.length > 240)) throw new Error('Recipe steps must contain up to 20 short text items.');
  const targetColor = raw.targetColor === undefined ? '#ff0000' : raw.targetColor;
  if (typeof targetColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(targetColor)) throw new Error('Target color must be a six-digit hex color.');
  const routes:Record<string,string>={};if(raw.routes&&typeof raw.routes==='object')for(const key of ['brightness','red','motion']){const value=(raw.routes as Record<string,unknown>)[key];if(typeof value==='string'&&value.length<160)routes[key]=value;}
  const controlSignalsRaw=raw.controlSignals;const controlSignals=Array.isArray(controlSignalsRaw)?controlSignalsRaw.map(signal=>validateControlSignal(signal)):undefined;if(controlSignals&&new Set(controlSignals.map(signal=>signal.id)).size!==controlSignals.length)throw new Error('Control Signal IDs must be unique.');
  if(controlSignals)for(const signal of controlSignals)for(const source of signal.inputs.map(item=>item.source).filter(Boolean)){const [stageId,port]=source.split('|'),stage=stages.find(item=>item.id===stageId);if(!stage||!stage.measurements?.includes(port))throw new Error(`Control Signal '${signal.name}' refers to a missing measured output.`);}
  const signalIds=new Set(['scene-energy',...(controlSignals??[]).map(signal=>signal.id)]);const midiRoutesRaw=raw.midiRoutes;const midiRoutes=Array.isArray(midiRoutesRaw)?midiRoutesRaw.map((route,index)=>{if(!route||typeof route!=='object'||!Number.isInteger((route as any).cc)||(route as any).cc<0||(route as any).cc>119||!Number.isInteger((route as any).channel)||(route as any).channel<1||(route as any).channel>16||!Number.isInteger((route as any).min)||(route as any).min<0||(route as any).min>127||!Number.isInteger((route as any).max)||(route as any).max<0||(route as any).max>127||(route as any).min>(route as any).max||typeof (route as any).enabled!=='boolean'||(route as any).id!==undefined&&!/^[a-zA-Z0-9_-]{1,40}$/.test((route as any).id)||(route as any).name!==undefined&&(typeof (route as any).name!=='string'||!(route as any).name.trim()||(route as any).name.length>80)||(route as any).signalId!==undefined&&!signalIds.has((route as any).signalId))throw new Error(`Invalid MIDI destination ${index+1}.`);return {id:(route as any).id,name:(route as any).name,signalId:(route as any).signalId??'scene-energy',cc:(route as any).cc,channel:(route as any).channel,min:(route as any).min,max:(route as any).max,enabled:(route as any).enabled};}):undefined;if(midiRoutes&&(!midiRoutes.length||midiRoutes.length>64))throw new Error('A project must contain between 1 and 64 MIDI mappings.');
  const smoothingMs=raw.smoothingMs??80;if(typeof smoothingMs!=='number'||!Number.isFinite(smoothingMs)||smoothingMs<0||smoothingMs>1000)throw new Error('Invalid smoothing time.');
  const calibration: Record<string, Calibration> = {};
  if(raw.calibration !== undefined) { if(!raw.calibration || typeof raw.calibration !== 'object' || Array.isArray(raw.calibration)) throw new Error('Invalid calibration settings.'); for(const key of ['brightness','red','motion']) { const value=(raw.calibration as Record<string,unknown>)[key];if(value !== undefined)calibration[key]=validateCalibration(value); }}
  return { schemaVersion: 1, calibration, routes, smoothingMs, midiRoutes, controlSignals, id, name: name.trim(), tagline, description, target: targetName, targetColor, image: { stages }, weights: { brightness: Number(weights.brightness), red: Number(weights.red), motion: Number(weights.motion) }, midi: { cc: Number(midiSettings.cc), channel: Number(midiSettings.channel) }, steps: raw.steps as string[] };
}
function updatePipeline() {
  requestImageSettingsReset();
  drawWires();
}
type ImageKind = 'image' | 'grayscale' | 'mask';
function kindName(kind: ImageKind) { return kind === 'mask' ? 'Binary mask' : kind === 'grayscale' ? 'Grayscale image' : 'Color image'; }
function pipelineFlows() {
  let kind: ImageKind = 'image';
  return pipelineStages.map(stage => {
    const module = imageModules.get(stage.module, stage.version);
    const inputKind = kind;
    const mismatch = Boolean(stage.enabled && module.inputKind && module.inputKind !== inputKind);
    if (stage.enabled && !mismatch) {
      const { parameters } = validateImageStage(stage);
      kind = module.outputKind ?? (module.scalarOutputs || module.id.endsWith('roi-crop')
        ? kind
        : Number(parameters.applyChannel) > 0 ? 'image' : kind === 'mask' ? 'grayscale' : kind);
    }
    return { inputKind, outputKind: kind, mismatch, requiredKind: module.inputKind };
  });
}
function drawPipeline() {
  const container = el('pipeline-stages'); container.replaceChildren();el('measured-outputs').replaceChildren();
  const flows = pipelineFlows();
  if (pipelineStages.length === 0) {
    const empty = document.createElement('div'); empty.className = 'empty-pipeline';
    empty.innerHTML = '<strong>Start with a clean image.</strong><span>Add a filter when you are ready. Your camera or video remains visible in the source preview.</span>';
    container.append(empty);
  }
  pipelineStages.forEach((stage, index) => {
    const module = imageModules.get(stage.module, stage.version);
    const card = document.createElement('article'); card.className = 'stage-card';
    const header = document.createElement('div'); header.className = 'stage-header';
    const title = document.createElement('strong'); title.textContent = `${index + 1}. ${module.label}`;
    const enabled = document.createElement('label'); enabled.className = 'check'; const enabledInput = document.createElement('input'); enabledInput.type = 'checkbox'; enabledInput.checked = stage.enabled; enabled.append(enabledInput, document.createTextNode('On'));
    enabledInput.addEventListener('change', () => { stage.enabled = enabledInput.checked; drawPipeline(); updatePipeline(); });
    const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.setAttribute('aria-label', `Move ${module.label} up`); up.disabled = index === 0;
    const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.setAttribute('aria-label', `Move ${module.label} down`); down.disabled = index === pipelineStages.length - 1;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${module.label}`);
    up.addEventListener('click', () => { [pipelineStages[index - 1], pipelineStages[index]] = [pipelineStages[index], pipelineStages[index - 1]]; drawPipeline(); updatePipeline(); });
    down.addEventListener('click', () => { [pipelineStages[index + 1], pipelineStages[index]] = [pipelineStages[index], pipelineStages[index + 1]]; drawPipeline(); updatePipeline(); });
    remove.addEventListener('click', () => { pipelineStages.splice(index, 1); drawPipeline(); updatePipeline(); });
    header.append(title, enabled, up, down, remove); card.append(header);
    const description = document.createElement('p'); description.textContent = module.description; description.className = 'stage-description'; card.append(description);
    const controls = document.createElement('div'); controls.className = 'stage-controls';
    const flow = flows[index];
    for (const [key, spec] of Object.entries(module.parameters)) {
      if (spec.hidden) continue;
      const label = document.createElement('label'); label.className = 'module-control'; const name = document.createElement('span'); name.textContent = spec.label; label.append(name);
      const control = document.createElement('input'); control.type = typeof spec.default === 'boolean' ? 'checkbox' : 'range';
      if (control.type === 'checkbox') (control as HTMLInputElement).checked = Boolean(stage.parameters[key] ?? spec.default);
      else { control.min = String(spec.min); control.max = String(spec.max); control.step = String(spec.step ?? 0.01); control.value = String(stage.parameters[key] ?? spec.default); }
      control.addEventListener('input', () => {
        stage.parameters[key] = control.type === 'checkbox' ? (control as HTMLInputElement).checked : Number(control.value);
        if (module.id === 'org.patchcraft.image.roi-crop' && ['x','y','width','height'].includes(key)) {
          const x = Number(stage.parameters.x), y = Number(stage.parameters.y), width = Number(stage.parameters.width), height = Number(stage.parameters.height);
          if (x + width > 1) { const other = controls.querySelectorAll('input[type=range]')[2] as HTMLInputElement; if (key === 'width') { stage.parameters.x = 1 - width; (controls.querySelectorAll('input[type=range]')[0] as HTMLInputElement).value = String(1 - width); } else { stage.parameters.width = 1 - x; other.value = String(1 - x); } }
          if (y + height > 1) { if (key === 'height') { stage.parameters.y = 1 - height; (controls.querySelectorAll('input[type=range]')[1] as HTMLInputElement).value = String(1 - height); } else { stage.parameters.height = 1 - y; (controls.querySelectorAll('input[type=range]')[3] as HTMLInputElement).value = String(1 - y); } }
        }
        updatePipeline();
      });
      if(spec.options){
        const select=document.createElement('select');select.setAttribute('aria-label',spec.label);
        const options = key === 'applyChannel' && flow.inputKind !== 'image'
          ? [flow.inputKind === 'mask' ? 'Mask intensity' : 'Grayscale · luminance']
          : spec.options;
        if(key === 'applyChannel' && flow.inputKind !== 'image') stage.parameters[key] = 0;
        select.replaceChildren(...options.map((option,i)=>new Option(option,String(i))));select.value=String(stage.parameters[key]??spec.default);select.addEventListener('change',()=>{stage.parameters[key]=Number(select.value);drawPipeline();updatePipeline();});label.append(select);
      }else label.append(control); controls.append(label);
    }
    const stageBody = document.createElement('div'); stageBody.className = 'stage-body'; stageBody.append(controls);
    const stagePreview = document.createElement('div'); stagePreview.className = 'stage-preview';
    const stageCanvas = document.createElement('canvas'); stageCanvas.width = capture.width; stageCanvas.height = capture.height; stageCanvas.dataset.stagePreview = String(index); stageCanvas.setAttribute('aria-label', `Live frame after stage ${index + 1}: ${module.label}`);
    const caption = document.createElement('span'); caption.textContent = `OUTPUT · ${index + 1}`;
    const histogram=document.createElement('canvas');histogram.width=160;histogram.height=40;histogram.dataset.histogram=String(index);histogram.setAttribute('aria-label','Output luminance histogram');
    const stats=document.createElement('small');stats.dataset.stageStats=String(index);stats.textContent='Waiting for an image';
    const explanation=document.createElement('small');explanation.textContent=stage.module.endsWith('threshold')?'Incoming channel histogram · horizontal: 0 → 1 · height: pixel count':'Output luminance histogram · left: dark, right: bright · height: pixel count';stagePreview.append(stageCanvas, histogram, explanation, stats, caption); stageBody.append(stagePreview); card.append(stageBody);
    const measurements = document.createElement('details'); measurements.className = 'stage-measurements';
    const summary = document.createElement('summary'); summary.textContent = `＋ Measure${stage.measurements?.length ? ` · ${stage.measurements.length} selected` : ''}`; measurements.append(summary);
    const measurementActions = document.createElement('div'); measurementActions.className = 'actions';
    for (const [label, ports] of [['Add all', availableMeasurements(flow.outputKind)], ['Clear all', []]] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => { stage.measurements = [...ports]; drawPipeline(); updatePipeline(); }); measurementActions.append(button);
    }
    measurements.append(measurementActions);
    for (const port of availableMeasurements(flow.outputKind)) {
      const label = document.createElement('label'); label.className = 'check';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = stage.measurements?.includes(port) ?? false;
      checkbox.addEventListener('change', () => { stage.measurements = checkbox.checked ? [...(stage.measurements ?? []), port] : (stage.measurements ?? []).filter(item => item !== port); drawPipeline(); updatePipeline(); });
      label.append(checkbox, document.createTextNode(outputLabels[port])); measurements.append(label);
    }
    card.append(measurements);
    const ports=document.createElement('div');ports.className='output-ports';
    for(const [port,label] of Object.entries(outputLabels).filter(([port])=>stage.measurements?.includes(port))){const button=document.createElement('button');button.className='output-port';button.type='button';button.draggable=true;button.dataset.connection=`${stage.id}|${port}`;button.textContent=`● ${label}`;const reading=document.createElement('output');reading.dataset.measurementValue=`${stage.id}|${port}`;reading.className='measurement-value';reading.textContent='—';reading.setAttribute('aria-label',`${label} before weighting and smoothing`);button.append(reading);button.title='Drag this output onto a signal input';button.addEventListener('dragstart',event=>{event.dataTransfer!.setData('text/patchcraft-output',button.dataset.connection!);event.dataTransfer!.effectAllowed='link';});ports.append(button);}
    if(stage.enabled&&stage.measurements?.length){const group=document.createElement('section');group.className='measurement-group';const name=document.createElement('strong');name.textContent=`${index+1}. ${module.label}`;group.append(name,ports);el('measured-outputs').append(group);}
    const type=document.createElement('div');type.className=`image-type${flow.mismatch?' incompatible':''}`;
    if (!stage.enabled) type.textContent=`Bypassed · sends the incoming ${kindName(flow.inputKind).toLowerCase()} unchanged${stage.measurements?.length?'; measured outputs are off':''}.`;
    else if (flow.mismatch) type.textContent=`Needs ${kindName(flow.requiredKind!)} · currently receives ${kindName(flow.inputKind).toLowerCase()}.`;
    else type.textContent=`Image flow · ${kindName(flow.inputKind)} → ${kindName(flow.outputKind)} to next step.`;
    if(stage.enabled&&stage.measurements?.length){const measured=document.createElement('span');measured.className='measured-note';measured.textContent=`Measured signal${stage.measurements!.length>1?'s':''} · ${stage.measurements!.map(port=>outputLabels[port]).join(', ')}`;type.append(measured);}
    card.append(type);container.append(card);
    if (index < pipelineStages.length - 1) { const arrow = document.createElement('div'); arrow.className = 'stage-arrow'; arrow.textContent = '↓'; container.append(arrow); }
  });
  refreshSignalSources();
  requestAnimationFrame(drawWires);
  el('module-count').textContent = `${pipelineStages.length} STAGES`;
}
const outputLabels:Record<string,string>={meanR:'Mean R',meanG:'Mean G',meanB:'Mean B',motion:'Frame difference',mean:'Mean luminance',coverage:'Mask area',x:'Mask center X',y:'Mask center Y',valid:'Region detected',largest:'Largest region area',largestX:'Largest region X',largestY:'Largest region Y',blobs:'Region count (clamped to 1 for CC)'};
function measurementValue(selection:string,signalId=activeSignalId){if(!selection)return 0;const [id,port]=selection.split('|'),cacheKey=`${signalId}:${selection}`;const index=pipelineStages.findIndex(stage=>stage.id===id),values=stageSignals[index]?.values;if(!values)return 0;const invalid=(['x','y'].includes(port)&&!values.positionValid)||(['largestX','largestY'].includes(port)&&!values.largestValid);if(invalid){const previous=lastValidMeasurements.get(cacheKey);return previous&&latestAt-previous.at<=500?previous.value:0;}const value=values[port as keyof typeof values] as number;if(Number.isFinite(value))lastValidMeasurements.set(cacheKey,{value,at:latestAt});return Number.isFinite(value)?value:0;}
function rawValue(key:string){return measurementValue(el<HTMLSelectElement>(`${key}-source`).value,activeSignalId);}
function calibrationFor(key:string): Calibration { return calibrations[key] ?? { min:0, max:el<HTMLSelectElement>(`${key}-source`).value.endsWith('|blobs')?10:1, invert:false }; }
function routedValue(key:string){return el<HTMLSelectElement>(`${key}-source`).value ? calibrate(rawValue(key),calibrationFor(key)) : 0;}
function refreshCalibration(key:string){const c=calibrationFor(key);input(`${key}-cal-min`).value=String(c.min);input(`${key}-cal-max`).value=String(c.max);input(`${key}-cal-invert`).checked=c.invert;}
function effectiveWeight(key:string){if(!el<HTMLSelectElement>(`${key}-source`).value)return 0;return Number(input(`${key}-weight`).value);}
function measurementOptions(){return pipelineStages.flatMap((stage,index)=>Object.entries(outputLabels).filter(([port])=>stage.enabled&&stage.measurements?.includes(port)).map(([port,label])=>new Option(`${index+1}. ${imageModules.get(stage.module,stage.version).label} → ${label}`,`${stage.id}|${port}`)));}
function signalOptions(){return controlSignals.map(signal=>[signal.id,signal.name] as [string,string]);}
function refreshMappingSignalOptions(){for(const row of document.querySelectorAll<HTMLElement>('.cc-route')){const select=row.querySelector<HTMLSelectElement>('.route-signal')!,value=select.value;select.replaceChildren(...signalOptions().map(([id,name])=>new Option(name,id)));select.value=signalOptions().some(([id])=>id===value)?value:'scene-energy';}}
function renderNamedSignals(){const host=el('named-signal-tabs');host.replaceChildren();for(const signal of controlSignals){const button=document.createElement('button');button.type='button';button.className=`named-signal-tab${signal.enabled?'':' muted'}`;button.dataset.signalId=signal.id;button.dataset.signalOutput=signal.id;button.draggable=true;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(signal.id===activeSignalId));button.setAttribute('aria-label',`${signal.name}${signal.enabled?'':' (muted)'}; use the pencil icon to rename`);const dot=document.createElement('span');dot.className='signal-enabled-dot';dot.setAttribute('aria-hidden','true');const title=document.createElement('span');title.className='named-signal-title';title.textContent=signal.name;const rename=document.createElement('span');rename.className='rename-signal';rename.textContent='✎';rename.setAttribute('aria-hidden','true');const value=document.createElement('output');value.className='named-signal-tab-value';value.textContent=String(Math.round((signalValues.get(signal.id)??0)*127));button.append(dot,title,rename,value);button.addEventListener('click',event=>{if((event.target as HTMLElement).closest('.rename-signal')){event.preventDefault();event.stopPropagation();editSignalTab(signal.id,button,title);return;}activateSignal(signal.id);});button.addEventListener('dblclick',event=>{event.preventDefault();editSignalTab(signal.id,button,title);});button.addEventListener('dragstart',event=>{event.dataTransfer?.setData('text/patchcraft-signal',signal.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='link';});host.append(button);}refreshMappingSignalOptions();updateSignalControlState();}
function editSignalTab(id:string,tab:HTMLButtonElement,title:HTMLElement){const signal=signalById(id);if(!signal||tab.querySelector('input'))return;const editor=document.createElement('input');editor.className='signal-tab-editor';editor.value=signal.name;editor.maxLength=80;editor.setAttribute('aria-label','Rename signal');title.replaceWith(editor);editor.focus();editor.select();let done=false;const finish=(save:boolean)=>{if(done)return;done=true;if(save){signal.name=editor.value.trim()||'Untitled signal';input('active-signal-name').value=signal.name;syncActiveSignalFromUI();}else renderNamedSignals();};editor.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();finish(true);}if(event.key==='Escape'){event.preventDefault();finish(false);}});editor.addEventListener('blur',()=>finish(true));}
function signalById(id=activeSignalId){return controlSignals.find(signal=>signal.id===id);}
function activateSignal(id:string){if(activeSignalId)syncActiveSignalFromUI();const signal=signalById(id);if(!signal)return;activeSignalId=id;for(const [index,key] of signalKeys.entries()){const item=signal.inputs[index]??{id:`input-${index+1}`,source:'',weight:0,calibration:{min:0,max:1,invert:false}};el<HTMLSelectElement>(`${key}-source`).value=item.source;input(`${key}-weight`).value=String(item.weight);calibrations[key]=item.calibration;refreshCalibration(key);}input('response-smoothing').value=String(signal.smoothingMs);el('smoothing-label').textContent=`${signal.smoothingMs} ms`;input('active-signal-name').value=signal.name;el('signal-name').textContent=signal.name;for(const key of signalKeys)el(`${key}-weight-label`).textContent=`${Math.round(Number(input(`${key}-weight`).value)*100)}%`;revealConnectedInputs();updateSignalControlState();for(const tab of document.querySelectorAll<HTMLButtonElement>('.named-signal-tab'))tab.setAttribute('aria-selected',String(tab.dataset.signalId===id));makeGraph();graph.reset();drawWires();}
function updateSignalControlState(){const signal=signalById();if(!signal)return;input('active-signal-enabled').checked=signal.enabled;el('signal-name').textContent=signal.name;el('active-signal-enabled').setAttribute('aria-label',signal.enabled?'Disable signal':'Enable signal');el('active-signal-enabled').closest('label')!.title=signal.enabled?'Signal enabled · click to mute':'Signal muted · click to enable';el('active-signal-enabled').closest('label')!.querySelector('.signal-enable-label')!.textContent=signal.enabled?'Enabled':'Muted';el<HTMLButtonElement>('remove-active-signal').disabled=signal.id==='scene-energy'||controlSignals.length<=1;const status=el('signal-state');status.textContent=signal.enabled?'Signal enabled':'Signal muted';status.classList.toggle('live',signal.enabled);for(const tab of document.querySelectorAll<HTMLElement>('.named-signal-tab')){const current=signalById(tab.dataset.signalId);tab.classList.toggle('muted',Boolean(current&&!current.enabled));if(current)tab.setAttribute('aria-label',`${current.name}${current.enabled?'':' (muted)'}; use the pencil icon to rename`);}}
function syncActiveSignalFromUI(){const signal=signalById();if(!signal)return;signal.name=input('active-signal-name').value.trim()||'Untitled signal';signal.enabled=input('active-signal-enabled').checked;signal.smoothingMs=Number(input('response-smoothing').value);signal.inputs=signalKeys.map((key,index)=>({id:signal.inputs[index]?.id??`input-${index+1}`,source:el<HTMLSelectElement>(`${key}-source`).value,weight:Number(input(`${key}-weight`).value),calibration:calibrationFor(key)}));signalStates.delete(signal.id);renderNamedSignals();}

function refreshSignalSources(){const options=measurementOptions();for(const key of signalKeys){const select=el<HTMLSelectElement>(`${key}-source`),previous=select.value;select.replaceChildren(new Option('Not connected',''),...options.map(option=>option.cloneNode(true) as HTMLOptionElement));if([...select.options].some(o=>o.value===previous))select.value=previous;}if(typeof document!=='undefined'&&document.getElementById('named-signal-tabs'))renderNamedSignals();}
const mappingTemplate=el<HTMLElement>('cc-routes').firstElementChild!.cloneNode(true) as HTMLElement;
function renderMappings(mappings: NonNullable<Recipe['midiRoutes']>){const host=el('cc-routes');host.replaceChildren();if(!mappings.length)mappings=[{cc:74,channel:1,min:0,max:127,enabled:true}];mappings.forEach(mapping=>{const row=mappingTemplate.cloneNode(true) as HTMLElement;row.dataset.routeId=mapping.id??crypto.randomUUID();row.querySelector<HTMLInputElement>('.route-enabled')!.checked=mapping.enabled;row.querySelector<HTMLInputElement>('.route-cc')!.value=String(mapping.cc);row.querySelector<HTMLInputElement>('.route-channel')!.value=String(mapping.channel);row.querySelector<HTMLButtonElement>('.remove-cc-route')!.disabled=false;const select=row.querySelector<HTMLSelectElement>('.route-signal')!;select.replaceChildren(...signalOptions().map(([id,name])=>new Option(name,id)));select.value=mapping.signalId??'scene-energy';host.append(row);});const rows=[...host.querySelectorAll<HTMLElement>('.cc-route')];if(!rows.some(row=>row.dataset.routeId===focusedRouteId))focusedRouteId=rows[0]?.dataset.routeId??'';rows.forEach(row=>row.classList.toggle('focused',row.dataset.routeId===focusedRouteId));const first=host.querySelector<HTMLButtonElement>('.remove-cc-route');if(first)first.disabled=true;updateMappingCount();drawSignalMappingWires();}
function updateMappingCount(){const count=document.querySelectorAll('.cc-route').length;el('mapping-count').textContent=`${count} ${count===1?'mapping':'mappings'}`;}
const signalMapSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');signalMapSvg.id='signal-mapping-wires';document.querySelector('.layout')!.append(signalMapSvg);
function drawSignalMappingWires(){const layout=signalMapSvg.parentElement!,base=layout.getBoundingClientRect();signalMapSvg.setAttribute('width',String(layout.clientWidth));signalMapSvg.setAttribute('height',String(layout.scrollHeight));signalMapSvg.replaceChildren();for(const row of document.querySelectorAll<HTMLElement>('.cc-route')){const signalId=row.querySelector<HTMLSelectElement>('.route-signal')?.value,source=signalId?document.querySelector<HTMLElement>(`[data-signal-output="${signalId}"]`):undefined,dest=row.querySelector<HTMLSelectElement>('.route-signal');if(!source||!dest)continue;const a=source.getBoundingClientRect(),b=dest.getBoundingClientRect();const x1=a.right-base.left,y1=a.top+a.height/2-base.top,x2=b.left-base.left,y2=b.top+b.height/2-base.top;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M ${x1} ${y1} C ${x1+70} ${y1}, ${x2-70} ${y2}, ${x2} ${y2}`);path.classList.add('signal-map-wire');if(!row.querySelector<HTMLInputElement>('.route-enabled')!.checked)path.classList.add('muted');signalMapSvg.append(path);}}
function hexTarget(hex: string): [number, number, number] { return [1,3,5].map(index => parseInt(hex.slice(index,index+2),16)/255) as [number,number,number]; }

const legacySignalKeys=['brightness','red','motion'];
const signalKeys=[...legacySignalKeys,...Array.from({length:5},(_,index)=>`input-${index+4}`)];
let selectedWire: string | undefined;
const workspace = document.createElement('div'); workspace.className = 'connection-workspace';
const rack = document.querySelector<HTMLElement>('.output-rack')!; rack.before(workspace); workspace.append(rack);
const connectionToolbar = document.createElement('div'); connectionToolbar.className = 'connection-toolbar';
connectionToolbar.innerHTML = '<strong>Inputs</strong><label class="active-signal-enabled" title="Signal enabled · click to mute"><input id="active-signal-enabled" type="checkbox" checked><span class="signal-enable-track"></span><span class="signal-enable-label">Enabled</span></label><button id="add-signal-input" type="button" aria-label="Add signal input"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg><span>Add input</span></button><button id="remove-active-signal" type="button">Remove</button><button id="remove-wire" type="button" hidden>Remove connection</button>';
workspace.prepend(connectionToolbar);
const inputColumn = document.createElement('div'); inputColumn.className = 'connection-inputs';
const signalTabsBar = document.createElement('div'); signalTabsBar.className = 'named-signal-bar'; workspace.before(signalTabsBar);
signalTabsBar.innerHTML = '<div class="signal-tab-head"><div><strong>Named signals</strong><span>Each tab owns its own inputs and response.</span></div><button id="add-control-signal" type="button" aria-label="Add named signal" title="Add named signal"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg></button></div><div id="named-signal-tabs" role="tablist" aria-label="Named control signals"></div>';
inputColumn.innerHTML = '<input id="active-signal-name" type="hidden" value="Scene Energy"><p id="input-limit" class="hint"></p><div id="signal-inputs"></div>';
workspace.append(inputColumn);
const wires = document.createElementNS('http://www.w3.org/2000/svg','svg'); wires.id = 'signal-wires'; workspace.append(wires);
function disconnectInput(key: string) {
  el<HTMLSelectElement>(`${key}-source`).value = '';
  el(`${key}-source`).closest<HTMLElement>('.signal-input-group')!.hidden = true;
  selectedWire = undefined; el('remove-wire').hidden = true;
  syncActiveSignalFromUI(); makeGraph(); updateInputButton(); drawWires();
}
el('remove-wire').addEventListener('click', () => { if(selectedWire) disconnectInput(selectedWire); });

for(const [index,key] of signalKeys.slice(3).entries()){
  const number=index+4;
  const source=document.createElement('label');source.className='route-label';source.innerHTML=`Input ${number}<select id="${key}-source" class="signal-source"><option value="">Not connected</option></select>`;
  const meter=document.createElement('div');meter.className='signal input-node';meter.innerHTML=`<span>Input value</span><meter id="${key}-meter" min="0" max="1" value="0"></meter><output id="${key}-value">0.000</output>`;
  const weight=document.createElement('label');weight.className='module-control';weight.innerHTML=`<span>Input ${number} · weight</span><output id="${key}-weight-label">0%</output><input id="${key}-weight" type="range" min="0" max="1" step="0.01" value="0">`;
  el('signal-inputs').append(source,meter,weight);
}
for(const key of signalKeys){const start=el(`${key}-source`).closest('label')!,group=document.createElement('div');group.className='signal-input-group';el('signal-inputs').append(group);const meter=el(`${key}-meter`).closest<HTMLElement>('.signal')!,weight=el(`${key}-weight`).closest<HTMLLabelElement>('label')!;start.firstChild!.textContent='Source';meter.querySelector('span')!.textContent='IN';meter.setAttribute('aria-label','Measured input value');weight.querySelector('span')!.textContent='Weight';group.append(start,meter,weight);group.dataset.signalKey=key;const remove=document.createElement('button');remove.className='remove-signal-input';remove.textContent='×';remove.setAttribute('aria-label','Remove input');remove.title='Remove input';remove.type='button';remove.addEventListener('click',()=>{disconnectInput(key);});group.append(remove);group.hidden=true;}
for(const key of signalKeys){
  const box=document.createElement('details');box.className='calibration';
  box.innerHTML=`<summary>Calibration <output id="${key}-cal-values">0 → 0</output></summary><div class="calibration-fields"><label>Min<input id="${key}-cal-min" type="number" step="any" value="0"></label><label>Max<input id="${key}-cal-max" type="number" step="any" value="1"></label><label class="check"><input id="${key}-cal-invert" type="checkbox">Invert</label><button id="${key}-cal-capture" type="button">Capture 5s</button></div><small id="${key}-cal-status" role="status"></small>`;
  el(`${key}-source`).closest('.signal-input-group')!.append(box);
  box.addEventListener('toggle',()=>{if(box.open)refreshCalibration(key);});
  for(const suffix of ['min','max','invert'])input(`${key}-cal-${suffix}`).addEventListener('change',()=>{try{calibrations[key]=validateCalibration({min:Number(input(`${key}-cal-min`).value),max:Number(input(`${key}-cal-max`).value),invert:input(`${key}-cal-invert`).checked});el(`${key}-cal-status`).textContent='';graph.reset();}catch(error){el(`${key}-cal-status`).textContent=(error as Error).message;}});
  el(`${key}-cal-capture`).addEventListener('click',()=>{if(captures.has(key))return;const selection=el<HTMLSelectElement>(`${key}-source`).value;const sample={min:Infinity,max:-Infinity,samples:0};captures.set(key,sample);el(`${key}-cal-status`).textContent='Move through the desired range…';setTimeout(()=>{if(captures.get(key)!==sample)return;captures.delete(key);if(el<HTMLSelectElement>(`${key}-source`).value!==selection)return;if(sample.samples>1&&sample.max-sample.min>0.000001){calibrations[key]={...calibrationFor(key),min:sample.min,max:sample.max};refreshCalibration(key);graph.reset();el(`${key}-cal-status`).textContent='Range captured and fixed.';}else el(`${key}-cal-status`).textContent='No changing signal captured. Previous range kept.';},5000);});
}
function updateInputButton(){const count=document.querySelectorAll('.signal-input-group:not([hidden])').length;el<HTMLButtonElement>('add-signal-input').disabled=count>=8;el('input-limit').textContent=count>=8?'Maximum of eight inputs reached. Remove an input to replace it.':'';}
function revealConnectedInputs(){for(const key of signalKeys){const group=el(`${key}-source`).closest<HTMLElement>('.signal-input-group')!;group.hidden=!el<HTMLSelectElement>(`${key}-source`).value;}updateInputButton();}
el('add-signal-input').addEventListener('click',()=>{const group=document.querySelector<HTMLElement>('.signal-input-group[hidden]');if(group){group.hidden=false;const key=group.dataset.signalKey!;input(`${key}-weight`).value='1';el(`${key}-weight-label`).textContent='100%';syncActiveSignalFromUI();}updateInputButton();});
for(const key of signalKeys){const select=el<HTMLSelectElement>(`${key}-source`),target=select.closest('label')!;target.classList.add('signal-drop');target.title='Drop a measured output here to connect';target.addEventListener('dragover',event=>{event.preventDefault();target.classList.add('drop-hover');});target.addEventListener('dragleave',()=>target.classList.remove('drop-hover'));target.addEventListener('drop',event=>{event.preventDefault();target.classList.remove('drop-hover');const connection=event.dataTransfer?.getData('text/patchcraft-output');if(connection&&[...select.options].some(option=>option.value===connection)){select.value=connection;delete calibrations[key];captures.delete(key);refreshCalibration(key);if(Number(input(`${key}-weight`).value)===0)input(`${key}-weight`).value='1';syncActiveSignalFromUI();makeGraph();graph.reset();drawWires();}});select.addEventListener('change',()=>{delete calibrations[key];captures.delete(key);refreshCalibration(key);syncActiveSignalFromUI();makeGraph();graph.reset();drawWires();});}
function drawWires() {
  const svg=el('signal-wires'),layout=svg.parentElement!,base=layout.getBoundingClientRect();
  svg.setAttribute('width',String(layout.clientWidth));svg.setAttribute('height',String(layout.scrollHeight));svg.replaceChildren();
  for(const key of signalKeys){
    const select=el<HTMLSelectElement>(`${key}-source`);
    if(select.closest<HTMLElement>('.signal-input-group')!.hidden)continue;
    const source=[...document.querySelectorAll<HTMLElement>('[data-connection]')].find(node=>node.dataset.connection===select.value);if(!source)continue;
    const a=source.getBoundingClientRect(),b=select.getBoundingClientRect();
    const x1=a.right-base.left,y1=a.top+a.height/2-base.top,x2=b.left-base.left,y2=b.top+b.height/2-base.top;
    const d=`M ${x1} ${y1} C ${x1+45} ${y1}, ${x2-45} ${y2}, ${x2} ${y2}`;
    const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',d);line.classList.add('wire-line');if(selectedWire===key)line.classList.add('selected');svg.append(line);
    const hit=document.createElementNS('http://www.w3.org/2000/svg','path');hit.setAttribute('d',d);hit.classList.add('wire-hit');hit.setAttribute('tabindex','0');hit.setAttribute('role','button');hit.setAttribute('aria-label',`Select connection to Input ${signalKeys.indexOf(key)+1}`);
    const choose=()=>{selectedWire=key;el('remove-wire').hidden=false;drawWires();};
    hit.addEventListener('click',choose);hit.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ') {event.preventDefault();choose();}else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();disconnectInput(key);}});svg.append(hit);
  }
}
new ResizeObserver(()=>{drawWires();drawSignalMappingWires();}).observe(document.querySelector('.layout')!);window.addEventListener('resize',()=>{drawWires();drawSignalMappingWires();});
const recipeSelect = el<HTMLSelectElement>('recipe-select');
const simpleIds = ['color-focus','motion-pulse','light-sweep','scene-energy'];
const simpleGroup = document.createElement('optgroup'); simpleGroup.label = 'Simple recipes';
const exploreGroup = document.createElement('optgroup'); exploreGroup.label = 'Explore';
for(const recipe of recipes) (simpleIds.includes(recipe.id)?simpleGroup:exploreGroup).append(new Option(recipe.name,recipe.id));
recipeSelect.replaceChildren(new Option('＋ Blank canvas · start fresh', '__blank'), simpleGroup, exploreGroup);
for (const key of signalKeys) input(`${key}-weight`).addEventListener('input', () => {
  el(`${key}-weight-label`).textContent = `${Math.round(Number(input(`${key}-weight`).value) * 100)}%`;
  syncActiveSignalFromUI();
  makeGraph(); requestImageSettingsReset();
  if (latest) syncGraph(performance.now());
});
for (const key of ['response-curve','response-smoothing']) input(key).addEventListener('input', () => {
  el('curve-label').textContent = Number(input('response-curve').value).toFixed(2);
  el('smoothing-label').textContent = `${input('response-smoothing').value} ms`;
  syncActiveSignalFromUI();
  makeGraph(); requestImageSettingsReset();
  if (latest) syncGraph(performance.now());
});
input('target-color').addEventListener('input', () => { target = hexTarget(input('target-color').value); requestImageSettingsReset(); });
recipeSelect.addEventListener('change', () => {
  if (recipeSelect.value === '__blank') {
    showRecipe({ schemaVersion: 1, id: 'untitled-recipe', name: 'Untitled recipe', tagline: 'Build a visual instrument from a blank slate.', description: 'Add image stages, shape the camera signals, then name and download your recipe.', image: { stages: [] }, weights: { brightness: 1, red: 0, motion: 0 }, midi: { cc: 74, channel: 1 }, target: 'Your instrument parameter', steps: [] });
    el('recipe-steps').replaceChildren();
    el('recipe-status').textContent = 'Blank canvas ready. Add image stages, adjust the signal and name the recipe when you are happy.';
    return;
  }
  const recipe = recipes.find(item => item.id === recipeSelect.value); if (recipe) { showRecipe(recipe); el('recipe-status').textContent = `Loaded ${recipe.name}.`; }
});
input('recipe-name').addEventListener('input', () => {
  const name = input('recipe-name').value.trim() || 'Untitled recipe';
  selectedRecipe.name = name; el('recipe-title').textContent = name;
});
input('active-signal-name').addEventListener('input',()=>{syncActiveSignalFromUI();el('signal-name').textContent=signalById()?.name??'';});
input('active-signal-enabled').addEventListener('change',()=>{const signal=signalById();if(signal){signal.enabled=input('active-signal-enabled').checked;signalStates.delete(signal.id);updateSignalControlState();}});
el('add-control-signal').addEventListener('click',()=>{const id=`signal-${crypto.randomUUID().slice(0,24)}`,signal:ControlSignal={id,name:`Control ${controlSignals.length+1}`,enabled:true,smoothingMs:80,inputs:signalKeys.map((_,index)=>({id:`input-${index+1}`,source:'',weight:0,calibration:{min:0,max:1,invert:false}}))};controlSignals.push(signal);renderNamedSignals();activateSignal(id);const firstInput=el('brightness-source').closest<HTMLElement>('.signal-input-group')!;firstInput.hidden=false;input('brightness-weight').value='1';el('brightness-weight-label').textContent='100%';syncActiveSignalFromUI();updateInputButton();drawWires();el('named-signal-tabs').lastElementChild?.scrollIntoView({block:'nearest',inline:'end',behavior:'smooth'});});
el('remove-active-signal').addEventListener('click',()=>{if(activeSignalId==='scene-energy'||controlSignals.length<=1)return;const removed=activeSignalId;controlSignals=controlSignals.filter(signal=>signal.id!==removed);signalStates.delete(removed);const fallback=controlSignals[0];for(const row of document.querySelectorAll<HTMLElement>('.cc-route'))if(row.querySelector<HTMLSelectElement>('.route-signal')!.value===removed)row.querySelector<HTMLSelectElement>('.route-signal')!.value=fallback.id;renderNamedSignals();activateSignal(fallback.id);drawSignalMappingWires();});
el('load-recipe').addEventListener('click', () => input('recipe-file').click());
input('recipe-file').addEventListener('change', async () => {
  const file = input('recipe-file').files?.[0]; if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Recipe files must be smaller than 1 MB.');
    const parsed = validateRecipeImport(JSON.parse(await file.text()));
    showRecipe(parsed);
    recipeSelect.replaceChildren(new Option('＋ Blank canvas · start fresh', '__blank'), ...recipes.filter(recipe => recipe.id !== parsed.id).map(recipe => new Option(recipe.name, recipe.id)), new Option(parsed.name, parsed.id));
    recipeSelect.value = parsed.id;
    el('recipe-status').textContent = `Loaded “${parsed.name}”. MIDI is stopped; select an output and start it again to send.`;
  } catch (error) {
    el('recipe-status').textContent = error instanceof Error ? `Could not load recipe: ${error.message}` : 'Could not load this recipe JSON.';
  } finally { input('recipe-file').value = ''; }
});
el('save-recipe').addEventListener('click', () => {
  syncActiveSignalFromUI();
  const name = input('recipe-name').value.trim();
  if (!name) { el('recipe-status').textContent = 'Enter a recipe name before downloading.'; input('recipe-name').focus(); return; }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'patchcraft-recipe';
  const recipe: Recipe = { ...selectedRecipe, controlSignals, calibration: Object.fromEntries(legacySignalKeys.map(key=>[key,calibrationFor(key)])), id: slug, name, routes:Object.fromEntries(legacySignalKeys.map(key=>[key,el<HTMLSelectElement>(`${key}-source`).value])), smoothingMs:Number(input('response-smoothing').value), targetColor: input('target-color').value, image: activeSettings(), weights: { brightness: Number(input('brightness-weight').value), red: Number(input('red-weight').value), motion: Number(input('motion-weight').value) }, midi: { cc: Number(input('midi-cc').value), channel: Number(input('midi-channel').value) }, midiRoutes:[...document.querySelectorAll<HTMLElement>('.cc-route')].map(row=>({id:row.dataset.routeId,signalId:row.querySelector<HTMLSelectElement>('.route-signal')!.value,cc:Number(row.querySelector<HTMLInputElement>('.route-cc')!.value),channel:Number(row.querySelector<HTMLInputElement>('.route-channel')!.value),min:0,max:127,enabled:row.querySelector<HTMLInputElement>('.route-enabled')!.checked})) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${slug}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  el('recipe-status').textContent = `Downloaded ${name}.json. Add it to src/recipes/ to include it in the next local build.`;
});
const addFilter = el<HTMLSelectElement>('add-filter');
addFilter.replaceChildren(...imageModules.list().filter(module => !module.scalarOutputs || module.outputKind).map(module => new Option(module.label, module.id)));
el('add-filter-button').addEventListener('click', () => {
  const module = imageModules.list().find(item => item.id === addFilter.value); if (!module || pipelineStages.length>=16) return;
  pipelineStages.push({ id: crypto.randomUUID(), module: module.id, version: module.version, enabled: true, parameters: Object.fromEntries(Object.entries(module.parameters).map(([key, spec]) => [key, spec.default])) });
  drawPipeline(); updatePipeline();
});
for (const name of legacySignalKeys) el(`${name}-weight-label`).textContent = `${Math.round(Number(input(`${name}-weight`).value) * 100)}%`;
el('source-stop').addEventListener('click', () => stopSource('Source stopped.'));
el('video-select-button').addEventListener('click',()=>input('video-file').click());
el('demo-start').addEventListener('click', async () => {
  stopSource('Loading the built-in demo scene…');
  preview.srcObject = null; preview.src = '/recipes/demo-scene.webm'; preview.loop = input('video-loop').checked;
  try { await preview.play(); beginAnalysis('VIDEO LOOP'); }
  catch (error) { stopSource(error instanceof Error ? error.message : 'Could not play the demo scene.'); }
});
el<HTMLInputElement>('video-loop').addEventListener('change', () => { preview.loop = input('video-loop').checked; });
el<HTMLInputElement>('video-file').addEventListener('change', async () => {
  const file = input('video-file').files?.[0]; if (!file) return;
  el('video-file-name').textContent=file.name;
  stopSource('Loading local video…'); objectUrl = URL.createObjectURL(file); preview.srcObject = null; preview.src = objectUrl; preview.loop = input('video-loop').checked;
  try { await preview.play(); beginAnalysis('VIDEO LOOP'); } catch (error) { stopSource(error instanceof Error ? error.message : 'Could not play this video.'); }
});
el('camera-start').addEventListener('click', async () => {
  stopSource('Starting camera…');
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); preview.src = ''; preview.srcObject = stream; preview.loop = false; await preview.play(); beginAnalysis('CAMERA LIVE'); }
  catch (error) { stopSource(error instanceof Error ? error.message : 'Camera access failed.'); }
});
preview.addEventListener('play', () => {
  if (worker && !frameLoopActive) {
    frameLoopActive = true;
    stopFrameClock?.(); stopFrameClock = startFrameClock(() => frameLoop(performance.now()));
  }
});
input('midi-output').addEventListener('change', () => { midi.disarm('MIDI output changed; start again to confirm.'); midi.select(undefined); });
el('add-cc-route').addEventListener('click',()=>{const routes=[...document.querySelectorAll<HTMLElement>('.cc-route')].map(row=>({id:row.dataset.routeId,signalId:row.querySelector<HTMLSelectElement>('.route-signal')!.value,cc:Number(row.querySelector<HTMLInputElement>('.route-cc')!.value),channel:Number(row.querySelector<HTMLInputElement>('.route-channel')!.value),min:0,max:127,enabled:row.querySelector<HTMLInputElement>('.route-enabled')!.checked}));routes.push({id:crypto.randomUUID(),signalId:'scene-energy',cc:74,channel:1,min:0,max:127,enabled:true});focusedRouteId=routes[routes.length-1].id!;renderMappings(routes);});
el('cc-routes').addEventListener('click',event=>{const target=event.target as HTMLElement,row=target.closest<HTMLElement>('.cc-route');if(!row)return;if(target.matches('.remove-cc-route')&&!target.hasAttribute('disabled')){row.remove();const rows=[...el('cc-routes').querySelectorAll<HTMLElement>('.cc-route')];if(!rows.some(item=>item.dataset.routeId===focusedRouteId))focusedRouteId=rows[0]?.dataset.routeId??'';rows.forEach(item=>item.classList.toggle('focused',item.dataset.routeId===focusedRouteId));const first=el('cc-routes').querySelector<HTMLButtonElement>('.remove-cc-route');if(first)first.disabled=true;updateMappingCount();drawSignalMappingWires();return;}focusedRouteId=row.dataset.routeId!;for(const item of el('cc-routes').querySelectorAll<HTMLElement>('.cc-route'))item.classList.toggle('focused',item===row);});
el('cc-routes').addEventListener('keydown',event=>{const key=event as KeyboardEvent,target=key.target as HTMLElement;if(target.matches('.cc-route')&&(key.key==='Enter'||key.key===' ')){key.preventDefault();(target as HTMLElement).click();}});
el('cc-routes').addEventListener('change',event=>{const target=event.target as HTMLElement;if(target.matches('.route-signal'))drawSignalMappingWires();});
el('cc-routes').addEventListener('dragover',event=>{if((event as DragEvent).dataTransfer?.types.includes('text/patchcraft-signal'))event.preventDefault();});
el('cc-routes').addEventListener('drop',event=>{const drag=event as DragEvent,signalId=drag.dataTransfer?.getData('text/patchcraft-signal');if(!signalId)return;const target=drag.target as HTMLElement,row=target.closest<HTMLElement>('.cc-route');if(!row)return;drag.preventDefault();const select=row.querySelector<HTMLSelectElement>('.route-signal')!;select.value=signalId;drawSignalMappingWires();});
el('isolate-cc').addEventListener('change',()=>drawSignalMappingWires());
el('midi-toggle').addEventListener('click', async () => {
  if (midi.armed) { midi.disarm('Stopped by user.'); routeOutputs.forEach(route=>route.output.disarm('Stopped by user.')); el('midi-state').textContent = 'MIDI off'; return; }
  try {
    if (!latest || performance.now() - latestAt > 500) throw new Error('Start the camera or video and wait for a fresh frame.');
    if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is unavailable. Use desktop Chromium.');
    const access = await navigator.requestMIDIAccess({ sysex: false });
    const outputs = [...access.outputs.values()].filter(port => port.state === 'connected');
    const select = input('midi-output'); const current = select.value;
    select.replaceChildren(new Option('Choose MIDI output',''), ...outputs.map(port => new Option(port.name || port.id, port.id)));
    if (current && outputs.some(port => port.id === current)) select.value = current;
    const port = access.outputs.get(select.value);
    if (!port || port.state !== 'connected') { el('midi-status').textContent = 'MIDI ports loaded. Choose LoopBe or another output, then start again.'; return; }
    await port.open(); midi.select(port);
    const now = performance.now(); const firstRoute=document.querySelector<HTMLElement>('.cc-route');if(!firstRoute)throw new Error('Add a MIDI mapping before starting output.');midi.arm({ channel: Number(firstRoute.querySelector<HTMLInputElement>('.route-channel')!.value), cc: Number(firstRoute.querySelector<HTMLInputElement>('.route-cc')!.value), hz: 15, min: 0, max: 127 }, now, latestAt);
    routeOutputs.splice(0);
    const routes=[...document.querySelectorAll<HTMLElement>('.cc-route')];
    routes.forEach(row=>{const output=new MidiOutput();output.select(port);output.arm({channel:Number(row.querySelector<HTMLInputElement>('.route-channel')!.value),cc:Number(row.querySelector<HTMLInputElement>('.route-cc')!.value),hz:15,min:0,max:127},now,latestAt);routeOutputs.push({id:row.dataset.routeId!,output});});
    if(![...document.querySelectorAll<HTMLElement>('.cc-route')].some(row=>row.dataset.routeId===focusedRouteId))focusedRouteId=document.querySelector<HTMLElement>('.cc-route')?.dataset.routeId??'';
    el('midi-state').textContent = 'SENDING'; el('midi-state').classList.add('live'); el('midi-status').textContent = `Sending ${routes.filter(row=>row.querySelector<HTMLInputElement>('.route-enabled')!.checked).length} enabled mapping(s). Move the scene while your instrument listens.`;
  } catch (error) { midi.disarm(error instanceof Error ? error.message : String(error)); el('midi-status').textContent = midi.reason; }
});
// Focus changes are normal when playing an external instrument. Do not disarm.

setInterval(() => {
  if (midi.armed && midi.port?.state !== 'connected') { midi.disarm('MIDI disconnected. Select the port and start again.'); el('midi-state').textContent = 'MIDI off'; }
  if (midi.armed && performance.now() - latestAt > 500) { el('midi-state').textContent = 'Waiting for frames'; el('midi-status').textContent = 'No fresh frames: no MIDI is sent. Sending resumes when this source delivers fresh frames. Stop cancels output.'; }
}, 100);
window.addEventListener('pagehide', () => { stopSource('Page closed.'); graph.dispose(); });
const recipeIds = new Set<string>();
for (const recipe of recipes) {
  try { validateRecipeImport(recipe); if(recipeIds.has(recipe.id)) throw new Error('Duplicate recipe ID'); recipeIds.add(recipe.id); }
  catch(error) { throw new Error(`Invalid bundled recipe '${recipe.id}': ${(error as Error).message}`); }
}
recipeSelect.value = recipes[0].id;
showRecipe(recipes[0]);

mountBuildInfo();
