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

type Recipe = {
  calibration?: Record<string, Calibration>; schemaVersion: 1; id: string; name: string; tagline: string; description: string;
  image: ImagePipelineSettings; weights: { brightness: number; red: number; motion: number };
  midi: { cc: number; channel: number }; target: string; targetColor?: string; routes?: Record<string,string>; smoothingMs?: number; steps: string[];
};
const recipes = Object.values(import.meta.glob('./recipes/*.json', { eager: true, import: 'default' })) as Recipe[];
document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="/vision.html">◈ PATCHCRAFT</a><span class="tag">VISUAL SIGNAL LAB</span></header>
<main>
  <div class="layout">
    <section class="panel">
      <div class="section-title"><span>1 · CHOOSE A RECIPE</span><span id="source-state" class="badge">Choose a source</span></div>
      <label>Recipe<select id="recipe-select"></select></label>
      <label>Recipe name<input id="recipe-name" type="text" maxlength="80" value="Untitled recipe"></label>
      <div class="actions"><button id="load-recipe" class="secondary">Load JSON</button><button id="save-recipe" class="secondary">Download JSON</button><input id="recipe-file" type="file" accept="application/json,.json" hidden></div>
      <p id="recipe-status" class="status" role="status">Start with a blank canvas or adjust a recipe, then download its JSON.</p>
      <details class="recipe-guide"><summary>Recipe guide</summary><h2 id="recipe-title"></h2><p id="recipe-description" class="muted"></p>
      <p id="recipe-tagline" class="promise"></p>
      <ol id="recipe-steps" class="steps"></ol></details>
    </section>
    <section class="panel">
      <div class="section-title"><span>2 · CAMERA OR VIDEO</span><span id="pipeline-state" class="badge">Camera or video</span></div>
      <label>Choose a local video<input id="video-file" type="file" accept="video/*"></label>
      <div class="actions"><button id="demo-start" class="secondary">Play demo scene</button><button id="camera-start" class="secondary">Use camera</button><button id="source-stop" class="secondary">Stop</button><label class="check"><input id="video-loop" type="checkbox" checked> Loop</label></div>
      <video id="preview" muted playsinline controls loop></video>
      <p id="source-status" class="status" role="status">Choose a video or start the camera. Video stays in this browser.</p>
      <canvas id="capture" width="160" height="90" hidden></canvas>
      <p class="hint">The worker analyzes a downscaled frame at up to 15 FPS. Old frames are skipped if processing is still busy.</p>
    </section>
    <section class="panel">
      <div class="section-title"><span>3 · IMAGE PIPELINE</span><span id="module-count" class="badge"></span></div>
      <p class="muted">Each step sends an image to the next step. Some steps also expose measured values that can be routed separately to the signal mixer.</p>
      <div id="pipeline-stages" class="pipeline-stages"></div>
      <div class="actions"><select id="add-filter" aria-label="Image module to add"></select><button id="add-filter-button" class="secondary">Add stage</button></div>
      <input id="target-color" type="color" value="#ff0000" hidden>
    </section>
    <section class="panel">
      <div class="section-title"><span>4 · NAMED SIGNAL · <span id="signal-name">Scene Energy</span></span><span id="signal-state" class="badge">No signal yet</span></div>
      <div class="pipeline-result"><div><strong>Final processed image</strong><span>After all steps · sent to visual signal analysis</span></div><canvas id="processed-preview" width="160" height="90" aria-label="Final image passed to visual signal analysis"></canvas></div>
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
      <div class="control-knob" id="control-knob" role="meter" aria-label="MIDI control value" aria-valuemin="0" aria-valuemax="127" aria-valuenow="0"><i></i><span id="knob-value">0</span></div><div class="signal-history" style="margin:14px 0;padding:12px;background:#141820;border:1px solid #394250;border-radius:10px;min-width:0"><div class="history-legend" style="display:flex;flex-wrap:wrap;gap:12px;font-size:11px"><span style="color:#8194b8">● Raw mix</span><span style="color:#c8ff52">● Smoothed output</span><small>Last 20 seconds · normalized 0–1</small></div><canvas style="display:block;width:100%;max-width:100%;height:auto;margin-top:10px" id="signal-history" width="640" height="180" aria-label="Raw and smoothed signal over the last twenty seconds"></canvas></div><div class="pipe-output"><span>CONTROL OUTPUT</span><b>→ CC mapping</b></div>
    </section>
    <section class="panel wide">
      <div class="section-title"><span>5 · SEND TO YOUR EFFECT</span><span id="midi-state" class="badge">MIDI off</span></div>
      <p class="muted">Suggested target: <strong id="recipe-target"></strong>. Open MIDI Learn in your plugin or DAW.</p>
      <div class="fields"><label>MIDI output<select id="midi-output"><option value="">Choose MIDI output</option></select></label><label>CC number<input id="midi-cc" type="number" min="0" max="119" value="74"></label><label>Channel<input id="midi-channel" type="number" min="1" max="16" value="1"></label></div>
      <div class="actions"><button id="midi-toggle" class="primary">Start MIDI output</button></div>
      <p id="midi-status" class="status" role="status">Stop remains active until you choose a MIDI port and start output.</p>
      <p id="diagnostics" class="mini">No frame analyzed yet.</p>
    </section>
  </div>
  <footer>LOCAL TEST TOOL · Videos are processed in your browser and are never uploaded.</footer>
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
let graph: VisualGraphRuntime;
let selectedRecipe = recipes[0];
let pipelineStages: ImageStage[] = [];
let worker: Worker | undefined;
let stream: MediaStream | undefined;
let objectUrl: string | undefined;
let pending = false;
let generation = 0;
let lastFrameAt = -Infinity;
let nextFrameId = 0;
let frameLoopActive = false;
let frames = 0, skipped = 0, processingMs = 0;
let latest: Features | undefined;
let latestAt = 0;
let signalHistory: Array<{at:number;raw:number;smoothed:number}>=[];
let calibrations: Record<string, Calibration> = {};
const captures = new Map<string, { min: number; max: number; samples: number }>();
let stageSignals: Array<ReturnType<typeof analyze>> = [];
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
  for(const key of ['brightness','red','motion']){const raw=rawValue(key),capture=captures.get(key);if(capture&&el<HTMLSelectElement>(`${key}-source`).value){capture.min=Math.min(capture.min,raw);capture.max=Math.max(capture.max,raw);capture.samples++;}el(`${key}-cal-values`).textContent=`${raw.toFixed(3)} → ${routedValue(key).toFixed(3)}`;}

  const features = latest;
  if (!features) return;
  const mixNode=graph.graph.nodes.find(node=>node.id==='scene-energy')!;mixNode.parameters={weightA:effectiveWeight('brightness'),weightB:effectiveWeight('red'),weightC:effectiveWeight('motion')};
  const values = graph.evaluate({ at, features: { brightness: routedValue('brightness'), color: routedValue('red'), motion: routedValue('motion') } });
  const mixed = values.get('scene-energy')?.value;
  const output = values.get('response')?.value;
  const combined = mixed?.type === 'scalar/f32' ? mixed.value : 0;
  const control = output?.type === 'scalar/f32' ? output.value : 0;
  el<HTMLMeterElement>('brightness-meter').value = routedValue('brightness');
  el<HTMLMeterElement>('red-meter').value = routedValue('red');
  el<HTMLMeterElement>('motion-meter').value = routedValue('motion');
  el<HTMLMeterElement>('mix-meter').value = combined;
  el<HTMLMeterElement>('response-meter').value = control;
  el('brightness-value').textContent = routedValue('brightness').toFixed(3);
  el('red-value').textContent = routedValue('red').toFixed(3);
  el('motion-value').textContent = routedValue('motion').toFixed(3);
  el('mix-value').textContent = combined.toFixed(3);
  signalHistory.push({at,raw:combined,smoothed:control});signalHistory=signalHistory.filter(point=>point.at>=at-20000).slice(-400);drawSignalHistory(at);
  el('response-value').textContent = control.toFixed(3);
  el('control-knob').style.setProperty('--angle', `${-135+control*270}deg`); el('knob-value').textContent=String(Math.round(control*127)); el('control-knob').setAttribute('aria-valuenow',String(Math.round(control*127)));
  if (midi.armed) midi.send(control, performance.now(), at);
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
        else if(module?.scalarOutputs?.includes('coverage'))stats.textContent=`Mask area ${(v.coverage*100).toFixed(1)}% · center X ${v.x.toFixed(2)} · Y ${v.y.toFixed(2)} · ${v.blobs} regions`;
        else if(module?.outputKind==='mask')stats.textContent=v.valid?`Mask ${(v.coverage*100).toFixed(1)}% · largest X ${v.largestX.toFixed(3)} · Y ${v.largestY.toFixed(3)}`:'No region detected · X/Y = 0';
        else stats.textContent=`Mean luminance ${v.mean.toFixed(3)} · normalized 0–1`;
      }
    }
    for (const node of document.querySelectorAll<HTMLElement>('[data-measurement-value]')) {
      const [id, port] = node.dataset.measurementValue!.split('|');
      const index = pipelineStages.findIndex(stage => stage.id === id);
      const value = stageSignals[index]?.values[port as keyof ReturnType<typeof analyze>['values']];
      node.textContent = value === undefined ? '—' : port === 'blobs' ? String(value) : value.toFixed(3);
    }
    el('pipeline-state').textContent = 'Analyzing · 15 fps max';
    el('pipeline-state').classList.add('live'); el('signal-state').textContent = ['brightness','red','motion'].some(key=>el<HTMLSelectElement>(`${key}-source`).value)?'Signal connected':'Connect a filter output'; el('signal-state').classList.add('live'); syncGraph(result.capturedAt);
  };
  worker.onerror = () => { pending = false; stopSource('Image pipeline worker failed.'); };
}
function requestImageSettingsReset() {
  if (worker) setupWorker();
  stageSignals=[];
  graph.reset(); latest = undefined;
  if (!preview.paused && !frameLoopActive) { frameLoopActive = true; nextFrameId = requestAnimationFrame(frameLoop); }
}
function clearStagePreviews() {
  document.querySelectorAll<HTMLCanvasElement>('[data-stage-preview]').forEach(canvas => canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height));
  document.querySelectorAll<HTMLElement>('.stage-preview').forEach(preview => preview.classList.remove('has-frame'));
}
function stopSource(message: string) {
  cancelAnimationFrame(nextFrameId); pending = false;
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
  if (preview.paused) { frameLoopActive = false; return; }
  if (now - lastFrameAt >= 1000 / 15) {
    lastFrameAt = now;
    if (pending) skipped++;
    else if (preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && worker) {
      const capturedAt = performance.now();
      captureContext.drawImage(preview, 0, 0, capture.width, capture.height);
      const image = captureContext.getImageData(0, 0, capture.width, capture.height);
      pending = true; frames++;
      worker.postMessage({ pixels: image.data, width: capture.width, height: capture.height, settings: activeSettings(), target, tolerance: 0.35, key: `${selectedRecipe.id}:${JSON.stringify(activeSettings())}:${target.join(',')}`, capturedAt, generation }, [image.data.buffer]);
    }
  }
  nextFrameId = requestAnimationFrame(frameLoop);
}
function beginAnalysis(label: string) {
  signalHistory=[];drawSignalHistory(performance.now());
  setupWorker(); graph.reset(); latest = undefined; frames = 0; skipped = 0; lastFrameAt = -Infinity;
  clearStagePreviews(); processedContext.clearRect(0, 0, processed.width, processed.height);
  el('source-state').textContent = label==='VIDEO LOOP'?'Video playing':'Camera active'; el('source-state').classList.add('live');
  el('source-status').textContent = label === 'VIDEO LOOP' ? 'Looping local video. Frames stay in this browser.' : 'Camera is live. Image processing runs locally.';
  midi.disarm('Source is live. Choose a MIDI output and start sending.');
  if (!frameLoopActive) { frameLoopActive = true; nextFrameId = requestAnimationFrame(frameLoop); }
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
function showRecipe(recipe: Recipe) {
  signalHistory=[];drawSignalHistory(performance.now());
  midi.disarm('Recipe changed. Choose the MIDI output and start again to confirm the new mapping.');
  midi.select(undefined); input('midi-output').value = '';
  el('midi-state').textContent = 'MIDI off'; el('midi-state').classList.remove('live');
  recipe = migrateMeasurements(recipe);
  selectedRecipe = recipe;
  captures.clear(); calibrations = { ...recipe.calibration };
  input('recipe-name').value = recipe.name;
  el('recipe-title').textContent = recipe.name; el('recipe-description').textContent = recipe.description; el('recipe-tagline').textContent = recipe.tagline;
  el('recipe-target').textContent = recipe.target; el('signal-name').textContent = recipe.name;
  el('recipe-steps').replaceChildren(...recipe.steps.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  pipelineStages = recipe.image.stages.map(stage => ({ ...stage, id: stage.id ?? crypto.randomUUID(), parameters: { ...stage.parameters } }));
  for (const key of ['brightness', 'red', 'motion'] as const) input(`${key}-weight`).value = String(recipe.weights[key]);
  input('midi-cc').value = String(recipe.midi.cc); input('midi-channel').value = String(recipe.midi.channel);
  input('target-color').value = recipe.targetColor ?? '#ff0000'; target = hexTarget(input('target-color').value);
  drawPipeline();
  for(const key of ['brightness','red','motion']){const select=el<HTMLSelectElement>(`${key}-source`);select.value=recipe.routes?.[key]??'';el(`${key}-weight-label`).textContent=`${Math.round(Number(input(`${key}-weight`).value)*100)}%`;}
  for(const key of ['brightness','red','motion']) { refreshCalibration(key); el(`${key}-cal-status`).textContent=''; }
  input('response-smoothing').value=String(recipe.smoothingMs??80);input('response-curve').value='1';el('smoothing-label').textContent=`${input('response-smoothing').value} ms`;
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
  const smoothingMs=raw.smoothingMs??80;if(typeof smoothingMs!=='number'||!Number.isFinite(smoothingMs)||smoothingMs<0||smoothingMs>1000)throw new Error('Invalid smoothing time.');
  const calibration: Record<string, Calibration> = {};
  if(raw.calibration !== undefined) { if(!raw.calibration || typeof raw.calibration !== 'object' || Array.isArray(raw.calibration)) throw new Error('Invalid calibration settings.'); for(const key of ['brightness','red','motion']) { const value=(raw.calibration as Record<string,unknown>)[key];if(value !== undefined)calibration[key]=validateCalibration(value); }}
  return { schemaVersion: 1, calibration, routes, smoothingMs, id, name: name.trim(), tagline, description, target: targetName, targetColor, image: { stages }, weights: { brightness: Number(weights.brightness), red: Number(weights.red), motion: Number(weights.motion) }, midi: { cc: Number(midiSettings.cc), channel: Number(midiSettings.channel) }, steps: raw.steps as string[] };
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
function rawValue(key:string){const selection=el<HTMLSelectElement>(`${key}-source`).value;if(!selection)return 0;const [id,port]=selection.split('|');const index=pipelineStages.findIndex(stage=>stage.id===id);return stageSignals[index]?.values[port as keyof ReturnType<typeof analyze>['values']]??0;}
function calibrationFor(key:string): Calibration { return calibrations[key] ?? { min:0, max:el<HTMLSelectElement>(`${key}-source`).value.endsWith('|blobs')?10:1, invert:false }; }
function routedValue(key:string){return el<HTMLSelectElement>(`${key}-source`).value ? calibrate(rawValue(key),calibrationFor(key)) : 0;}
function refreshCalibration(key:string){const c=calibrationFor(key);input(`${key}-cal-min`).value=String(c.min);input(`${key}-cal-max`).value=String(c.max);input(`${key}-cal-invert`).checked=c.invert;}
function effectiveWeight(key:string){if(!el<HTMLSelectElement>(`${key}-source`).value)return 0;return Number(input(`${key}-weight`).value);}
function refreshSignalSources(){for(const key of ['brightness','red','motion']){const select=el<HTMLSelectElement>(`${key}-source`),previous=select.value;select.replaceChildren(new Option('Not connected',''),...pipelineStages.flatMap((stage,index)=>Object.entries(outputLabels).filter(([port])=>stage.enabled&&stage.measurements?.includes(port)).map(([port,label])=>new Option(`${index+1}. ${imageModules.get(stage.module,stage.version).label} → ${label}`,`${stage.id}|${port}`))));if([...select.options].some(o=>o.value===previous))select.value=previous;}}
function hexTarget(hex: string): [number, number, number] { return [1,3,5].map(index => parseInt(hex.slice(index,index+2),16)/255) as [number,number,number]; }

const signalKeys=['brightness','red','motion'];
let selectedWire: string | undefined;
const workspace = document.createElement('div'); workspace.className = 'connection-workspace';
const rack = document.querySelector<HTMLElement>('.output-rack')!; rack.before(workspace); workspace.append(rack);
const inputColumn = document.createElement('div'); inputColumn.className = 'connection-inputs';
inputColumn.innerHTML = '<div class="connection-toolbar"><strong>Signal inputs</strong><button id="add-signal-input" type="button">＋ Add input</button><button id="remove-wire" type="button" hidden>Remove connection</button></div><p id="input-limit" class="hint"></p><div id="signal-inputs"></div>';
workspace.append(inputColumn);
const wires = document.createElementNS('http://www.w3.org/2000/svg','svg'); wires.id = 'signal-wires'; workspace.append(wires);
function disconnectInput(key: string) {
  el<HTMLSelectElement>(`${key}-source`).value = '';
  el(`${key}-source`).closest<HTMLElement>('.signal-input-group')!.hidden = true;
  selectedWire = undefined; el('remove-wire').hidden = true;
  makeGraph(); updateInputButton(); drawWires();
}
el('remove-wire').addEventListener('click', () => { if(selectedWire) disconnectInput(selectedWire); });

for(const key of signalKeys){const start=el(`${key}-source`).closest('label')!,group=document.createElement('div');group.className='signal-input-group';el('signal-inputs').append(group);group.append(start,el(`${key}-meter`).closest('.signal')!,el(`${key}-weight`).closest('label')!);group.dataset.signalKey=key;const remove=document.createElement('button');remove.className='remove-signal-input';remove.textContent='Remove input';remove.type='button';remove.addEventListener('click',()=>{disconnectInput(key);});group.prepend(remove);group.hidden=true;}
for(const key of signalKeys){
  const box=document.createElement('details');box.className='calibration';
  box.innerHTML=`<summary>Calibration <output id="${key}-cal-values">0 → 0</output></summary><div class="calibration-fields"><label>Min<input id="${key}-cal-min" type="number" step="any" value="0"></label><label>Max<input id="${key}-cal-max" type="number" step="any" value="1"></label><label class="check"><input id="${key}-cal-invert" type="checkbox">Invert</label><button id="${key}-cal-capture" type="button">Capture 5s</button></div><small id="${key}-cal-status" role="status"></small>`;
  el(`${key}-source`).closest('.signal-input-group')!.append(box);
  box.addEventListener('toggle',()=>{if(box.open)refreshCalibration(key);});
  for(const suffix of ['min','max','invert'])input(`${key}-cal-${suffix}`).addEventListener('change',()=>{try{calibrations[key]=validateCalibration({min:Number(input(`${key}-cal-min`).value),max:Number(input(`${key}-cal-max`).value),invert:input(`${key}-cal-invert`).checked});el(`${key}-cal-status`).textContent='';graph.reset();}catch(error){el(`${key}-cal-status`).textContent=(error as Error).message;}});
  el(`${key}-cal-capture`).addEventListener('click',()=>{if(captures.has(key))return;const selection=el<HTMLSelectElement>(`${key}-source`).value;const sample={min:Infinity,max:-Infinity,samples:0};captures.set(key,sample);el(`${key}-cal-status`).textContent='Move through the desired range…';setTimeout(()=>{if(captures.get(key)!==sample)return;captures.delete(key);if(el<HTMLSelectElement>(`${key}-source`).value!==selection)return;if(sample.samples>1&&sample.max-sample.min>0.000001){calibrations[key]={...calibrationFor(key),min:sample.min,max:sample.max};refreshCalibration(key);graph.reset();el(`${key}-cal-status`).textContent='Range captured and fixed.';}else el(`${key}-cal-status`).textContent='No changing signal captured. Previous range kept.';},5000);});
}
function updateInputButton(){const count=document.querySelectorAll('.signal-input-group:not([hidden])').length;el<HTMLButtonElement>('add-signal-input').disabled=count>=3;el('input-limit').textContent=count>=3?'Three inputs connected to this mixer. Remove an input to replace it.':'';}
function revealConnectedInputs(){for(const key of ['brightness','red','motion']){const group=el(`${key}-source`).closest<HTMLElement>('.signal-input-group')!;group.hidden=!el<HTMLSelectElement>(`${key}-source`).value;}updateInputButton();}
el('add-signal-input').addEventListener('click',()=>{const group=document.querySelector<HTMLElement>('.signal-input-group[hidden]');if(group){group.hidden=false;const key=group.dataset.signalKey!;input(`${key}-weight`).value='1';el(`${key}-weight-label`).textContent='100%';}updateInputButton();});
for(const key of ['brightness','red','motion']){const select=el<HTMLSelectElement>(`${key}-source`),target=select.closest('label')!;target.classList.add('signal-drop');target.title='Drop a filter output here to connect';target.addEventListener('dragover',event=>{event.preventDefault();target.classList.add('drop-hover');});target.addEventListener('dragleave',()=>target.classList.remove('drop-hover'));target.addEventListener('drop',event=>{event.preventDefault();target.classList.remove('drop-hover');const connection=event.dataTransfer?.getData('text/patchcraft-output');if(connection&&[...select.options].some(option=>option.value===connection)){select.value=connection;delete calibrations[key];captures.delete(key);refreshCalibration(key);if(Number(input(`${key}-weight`).value)===0)input(`${key}-weight`).value='1';makeGraph();graph.reset();drawWires();}});select.addEventListener('change',()=>{delete calibrations[key];captures.delete(key);refreshCalibration(key);makeGraph();graph.reset();drawWires();});}
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
new ResizeObserver(()=>drawWires()).observe(document.querySelector('.layout')!);window.addEventListener('resize',drawWires);
const recipeSelect = el<HTMLSelectElement>('recipe-select');
const simpleIds = ['color-focus','motion-pulse','light-sweep','scene-energy'];
const simpleGroup = document.createElement('optgroup'); simpleGroup.label = 'Simple recipes';
const exploreGroup = document.createElement('optgroup'); exploreGroup.label = 'Explore';
for(const recipe of recipes) (simpleIds.includes(recipe.id)?simpleGroup:exploreGroup).append(new Option(recipe.name,recipe.id));
recipeSelect.replaceChildren(new Option('＋ Blank canvas · start fresh', '__blank'), simpleGroup, exploreGroup);
for (const key of ['brightness-weight','red-weight','motion-weight']) el(key).addEventListener('input', () => {
  for (const name of ['brightness','red','motion']) el(`${name}-weight-label`).textContent = `${Math.round(Number(input(`${name}-weight`).value) * 100)}%`;
  makeGraph(); requestImageSettingsReset();
  if (latest) syncGraph(performance.now());
});
for (const key of ['response-curve','response-smoothing']) input(key).addEventListener('input', () => {
  el('curve-label').textContent = Number(input('response-curve').value).toFixed(2);
  el('smoothing-label').textContent = `${input('response-smoothing').value} ms`;
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
  selectedRecipe.name = name; el('recipe-title').textContent = name; el('signal-name').textContent = name;
});
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
  const name = input('recipe-name').value.trim();
  if (!name) { el('recipe-status').textContent = 'Enter a recipe name before downloading.'; input('recipe-name').focus(); return; }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'patchcraft-recipe';
  const recipe: Recipe = { ...selectedRecipe, calibration: Object.fromEntries(signalKeys.map(key=>[key,calibrationFor(key)])), id: slug, name, routes:Object.fromEntries(['brightness','red','motion'].map(key=>[key,el<HTMLSelectElement>(`${key}-source`).value])), smoothingMs:Number(input('response-smoothing').value), targetColor: input('target-color').value, image: activeSettings(), weights: { brightness: Number(input('brightness-weight').value), red: Number(input('red-weight').value), motion: Number(input('motion-weight').value) }, midi: { cc: Number(input('midi-cc').value), channel: Number(input('midi-channel').value) } };
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
for (const name of ['brightness','red','motion']) el(`${name}-weight-label`).textContent = `${Math.round(Number(input(`${name}-weight`).value) * 100)}%`;
el('source-stop').addEventListener('click', () => stopSource('Source stopped.'));
el('demo-start').addEventListener('click', async () => {
  stopSource('Loading the built-in demo scene…');
  preview.srcObject = null; preview.src = '/recipes/demo-scene.webm'; preview.loop = input('video-loop').checked;
  try { await preview.play(); beginAnalysis('VIDEO LOOP'); }
  catch (error) { stopSource(error instanceof Error ? error.message : 'Could not play the demo scene.'); }
});
el<HTMLInputElement>('video-loop').addEventListener('change', () => { preview.loop = input('video-loop').checked; });
el<HTMLInputElement>('video-file').addEventListener('change', async () => {
  const file = input('video-file').files?.[0]; if (!file) return;
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
    nextFrameId = requestAnimationFrame(frameLoop);
  }
});
input('midi-output').addEventListener('change', () => { midi.disarm('MIDI output changed; start again to confirm.'); midi.select(undefined); });
el('midi-toggle').addEventListener('click', async () => {
  if (midi.armed) { midi.disarm('Stopped by user.'); el('midi-state').textContent = 'MIDI off'; return; }
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
    const now = performance.now(); midi.arm({ channel: Number(input('midi-channel').value), cc: Number(input('midi-cc').value), hz: 15, min: 0, max: 127 }, now, latestAt);
    el('midi-state').textContent = 'SENDING'; el('midi-state').classList.add('live'); el('midi-status').textContent = `Sending CC ${input('midi-cc').value} on channel ${input('midi-channel').value}. Move the scene while Vital listens.`;
  } catch (error) { midi.disarm(error instanceof Error ? error.message : String(error)); el('midi-status').textContent = midi.reason; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && midi.armed) { midi.disarm('Page hidden. Start MIDI again when visible.'); el('midi-state').textContent = 'MIDI off'; } });
setInterval(() => {
  if (midi.armed && performance.now() - latestAt > 500) { midi.disarm('Image input is stale. MIDI output stopped; restart the source and rearm.'); el('midi-state').textContent = 'MIDI off'; el('midi-state').classList.remove('live'); el('midi-status').textContent = midi.reason; }
}, 100);
window.addEventListener('pagehide', () => { stopSource('Page closed.'); graph.dispose(); });
const recipeIds = new Set<string>();
for (const recipe of recipes) {
  try { validateRecipeImport(recipe); if(recipeIds.has(recipe.id)) throw new Error('Duplicate recipe ID'); recipeIds.add(recipe.id); }
  catch(error) { throw new Error(`Invalid bundled recipe '${recipe.id}': ${(error as Error).message}`); }
}
recipeSelect.value = recipes[0].id;
showRecipe(recipes[0]);
