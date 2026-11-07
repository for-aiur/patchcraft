import { MidiRig, defaultMapping, learnedCC, validateMappings, validateRig, type Mapping } from './rig';
import type { Patch } from '../control/patch';

type Context = {
  access: () => MIDIAccess | undefined;
  patch: () => Patch;
  snapshot: () => Patch;
  diagnostics: () => unknown;
  loadPatch: (patch: Patch) => void;
  frameAt: () => number;
  disarm: (reason: string) => void;
};
export class RigPanel {
  readonly rig = new MidiRig();
  private generation = 0;
  private dirty = false;
  private ports = new Map<string, string>();
  private learnCleanup?: () => void;
  private learnInputId = '';
  private runStarted = 0;
  private runEnded = 0;
  private outcomes = ['baseline-audio','camera-to-daw','mapping','program','disconnect','background','restore'];
  private context: Context;
  constructor(context: Context) {
    this.context = context;
    document.getElementById('rig-panel')!.innerHTML = `
<div class="section-title"><span>MORE MIDI ROUTES</span><span id="rig-state" class="badge">DISARMED</span></div>
<p>Add more camera controls to your DAW. Each route sends one MIDI message type to a destination you choose.</p>
<div class="fields"><label>Mapping<select id="rig-mapping"><option value="">Add your first mapping</option></select></label><label>Mapping name<input id="rig-map-name" value="Camera control" maxlength="100"></label><label>Message type<select id="rig-type"><option value="cc">Continuous CC</option><option value="program">Program Change · low → high trigger</option></select></label><label>Output device<select id="rig-output"><option value="">Confirm output explicitly</option></select></label><label>Graph output<select id="rig-source"><option value="">Shared first output</option></select></label><label>Channel<input id="rig-channel" type="number" min="1" max="16" value="1"></label><label>CC number<input id="rig-cc" type="number" min="0" max="119" value="74"></label><label>CC minimum<input id="rig-min" type="number" min="0" max="127" value="0"></label><label>CC maximum<input id="rig-max" type="number" min="0" max="127" value="127"></label><label>Maximum sends / second<input id="rig-hz" type="number" min="1" max="60" value="30"></label><label>Program number · displayed 1–128<input id="rig-program" type="number" min="1" max="128" value="1"></label><label>Trigger low<input id="rig-low" type="number" min="0" max="1" step="0.01" value="0.3"></label><label>Trigger high<input id="rig-high" type="number" min="0" max="1" step="0.01" value="0.7"></label></div>
<div class="actions"><button id="rig-add" class="secondary">Add mapping</button><button id="rig-save-map" class="secondary">Apply mapping changes</button><button id="rig-remove" class="secondary">Remove mapping</button></div>
<div class="actions"><button id="rig-confirm" class="secondary">Confirm selected output</button><button id="rig-arm" class="primary">Arm selected mapping</button><button id="rig-disarm" class="secondary">Disarm all outputs</button></div><p id="rig-status" role="status">Enable MIDI above, add a mapping and confirm its output.</p>
<p class="hint">A Program Change sends once after a fresh low → high crossing. Arming on a high value sends nothing. Program 1 is wire value 0. Preset changes may change the sound or level; set the destination rig volume before testing.</p>
<details><summary>Guided DAW mapping & controller MIDI Learn</summary><ol><li>Enable Remote/control input for the selected virtual MIDI port in your DAW.</li><li>Enter the DAW/plugin's MIDI Learn or Map mode and select the parameter.</li><li>Confirm this output, then send the setup message below. The parameter receives the CC minimum, or the selected program. Live outputs are disarmed.</li><li>Leave the DAW's Learn mode, start/calibrate camera and arm this mapping.</li></ol><button id="rig-probe" class="secondary">Send selected setup message</button><p class="hint">DAW target assignment happens inside the DAW. To copy a hardware controller's channel/CC into this mapping, select its input and listen for one CC message.</p><div class="fields"><label>Controller input<select id="rig-input"><option value="">Choose input to learn from</option></select></label></div><div class="actions"><button id="rig-learn" class="secondary">Learn next controller CC</button><button id="rig-learn-cancel" class="secondary">Cancel Learn</button></div><p id="rig-learn-status" role="status">Not listening.</p></details>
<details><summary>Save or restore a rig profile</summary><label>Rig name<input id="rig-name" maxlength="100" value="My live rig"></label><div class="actions"><button id="rig-save" class="secondary">Save rig locally</button><button id="rig-load" class="secondary">Load local rig</button><button id="rig-export" class="secondary">Export rig profile</button></div><label>Import rig profile<input id="rig-import" type="file" accept=".json,application/json"></label><p class="hint">Loading disarms outputs and stops camera capture. Device names are hints; confirm each port and rearm explicitly. Loading this setup stops the camera and clears device selections; confirm them again before sending.</p></details>
<details><summary>Optional session checklist</summary><p>Record one exact setup per run. Record what worked and any problems you noticed while playing. Notes stay in this browser until you save them.</p><div class="fields"><label>DAW and effect<input id="rig-env-daw" maxlength="300"></label><label>Operating system and browser<input id="rig-env-os" maxlength="300"></label><label>Audio interface and camera<input id="rig-env-hardware" maxlength="500"></label><label>MIDI device and route<input id="rig-env-route" maxlength="500"></label></div><div id="rig-checks" class="fields"></div><label>Playing notes<textarea id="rig-observations" maxlength="5000" aria-label="Rig test observations"></textarea></label><div class="actions"><button id="rig-run-start" class="secondary">Start checklist</button><button id="rig-run-stop" class="secondary">Finish checklist</button><button id="rig-report" class="secondary">Save session notes</button></div><p id="rig-run-status" role="status">No run recorded. Physical latency remains unmeasured.</p><a href="/docs/rig-integrations.md" target="_blank" rel="noopener">Optional MIDI setup help ↗</a></details>
<p id="rig-telemetry" class="mini-metrics"></p>`;
    const labels = ['Guitar audio stays in your usual setup', 'Camera → DAW playing response', 'The MIDI mapping responds as expected', 'Program Change and preset level', 'Stopping the camera stops control', 'Returning to the page resumes safely', 'Saved settings load correctly'];
    this.el('rig-checks').innerHTML = this.outcomes.map((id, i) => `<label>${labels[i]}<select id="rig-check-${id}"><option value="not-run">Not run</option><option value="pass">Pass · manually observed</option><option value="fail">Fail · describe below</option></select></label>`).join('');
    this.bind('rig-add', () => {
      const all = this.rig.mappings;
      const mapping = defaultMapping(crypto.randomUUID());
      mapping.name = `Mapping ${all.length + 1}`;
      this.replace([...all, mapping], mapping.id);
    });
    this.bind('rig-save-map', () => {
      const mapping = this.readMapping();
      this.replace(this.rig.mappings.map(m => m.id === mapping.id ? mapping : m), mapping.id);
    });
    this.bind('rig-remove', () => this.replace(this.rig.mappings.filter(m => m.id !== this.value('rig-mapping'))));
    this.el('rig-mapping').addEventListener('change', () => { ++this.generation; this.cancelLearn(); this.showMapping(); });
    for (const id of ['rig-map-name','rig-source','rig-type','rig-channel','rig-cc','rig-min','rig-max','rig-hz','rig-program','rig-low','rig-high']) {
      this.el(id).addEventListener('input', () => { this.context.disarm('Rig settings edited; apply mapping and rearm.'); this.dirty = true; });
    }
    this.el('rig-output').addEventListener('change', () => {
      this.context.disarm('Rig port changed; confirm output and rearm.');
      const id = this.value('rig-mapping');
      if (id) { this.ports.delete(id); this.rig.select(id); }
    });
    this.el('rig-input').addEventListener('change', () => this.cancelLearn());
    this.bind('rig-confirm', async () => {
      this.ensureApplied();
      const id = this.value('rig-mapping');
      const port = this.context.access()?.outputs.get(this.value('rig-output'));
      if (!port || port.state !== 'connected') throw new Error('Choose a connected output from the enabled MIDI ports.');
      this.context.disarm('Output confirmed; rearm explicitly.');
      const request = ++this.generation;
      await port.open?.();
      if (request !== this.generation || id !== this.value('rig-mapping') || port.state !== 'connected') return;
      this.rig.select(id, port); this.ports.set(id, port.id); this.refreshChoices();
      this.status('Output confirmed. Use a setup message or arm the selected mapping.');
    });
    this.bind('rig-arm', () => {
      this.ensureApplied();
      if (document.hidden) throw new Error('Keep this tab visible.');
      const id = this.value('rig-mapping');
      if (this.ports.get(id) !== this.value('rig-output')) throw new Error('Confirm this output first.');
      this.rig.arm(id, performance.now(), this.context.frameAt());
      this.status('Selected mapping armed. Program triggers require a low → high crossing.');
    });
    this.bind('rig-disarm', () => this.context.disarm('Disarmed all outputs by user.'));
    this.bind('rig-probe', () => {
      this.ensureApplied();
      const id = this.value('rig-mapping');
      if (!id || this.ports.get(id) !== this.value('rig-output')) throw new Error('Confirm this output first.');
      this.context.disarm('Setup message requested; live outputs disarmed.');
      this.rig.probe(id, performance.now());
      this.status('Setup message sent. Complete DAW mapping and rearm explicitly.');
    });
    this.bind('rig-learn', () => this.startLearn());
    this.bind('rig-learn-cancel', () => this.cancelLearn());
    this.bind('rig-save', () => { localStorage.setItem('patchcraft-rig-v1', JSON.stringify(this.profile())); this.status('Rig saved on this browser.'); });
    this.bind('rig-load', () => {
      const text = localStorage.getItem('patchcraft-rig-v1');
      if (!text) throw new Error('No local rig profile saved.');
      this.load(JSON.parse(text));
    });
    this.bind('rig-export', () => this.download('patchcraft-rig.json', this.profile()));
    this.el<HTMLInputElement>('rig-import').onchange = async () => {
      try {
        const file = this.el<HTMLInputElement>('rig-import').files?.[0];
        if (file) {
          if (file.size > 150000) throw new Error('Rig profile exceeds 150 KB.');
          this.load(JSON.parse(await file.text()));
        }
      } catch (error) { this.status(this.error(error)); }
      this.el<HTMLInputElement>('rig-import').value = '';
    };
    this.bind('rig-run-start', () => {
      if (!this.rig.snapshot().some(r => r.armed)) throw new Error('Start camera and arm a rig mapping first.');
      this.runStarted = performance.now(); this.runEnded = 0;
      for (const id of this.outcomes) this.el<HTMLSelectElement>(`rig-check-${id}`).value = 'not-run';
      this.el('rig-run-status').textContent = 'Acceptance run started. Play for at least ten minutes and test recovery.';
    });
    this.bind('rig-run-stop', () => {
      if (!this.runStarted) throw new Error('Start the checklist first.');
      this.runEnded = performance.now();
      this.el('rig-run-status').textContent = `Recorded ${this.duration().toFixed(0)} seconds. Outcomes are manual observations.`;
    });
    this.bind('rig-report', () => this.download('patchcraft-session-notes.json', this.report()));
  }
  private el<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
  private value(id: string) { return this.el<HTMLInputElement | HTMLSelectElement>(id).value; }
  private number(id: string) { return Number(this.value(id)); }
  private error(error: unknown) { return error instanceof Error ? error.message : String(error); }
  private status(message: string) { this.el('rig-status').textContent = message; }
  private bind(id: string, action: () => void | Promise<void>) {
    this.el(id).onclick = async () => { try { await action(); } catch (error) { this.status(this.error(error)); } };
  }
  private ensureApplied() {
    if (!this.value('rig-mapping')) throw new Error('Add a mapping first.');
    if (this.dirty) throw new Error('Apply mapping changes first.');
  }
  private readMapping(): Mapping {
    const id = this.value('rig-mapping');
    if (!id) throw new Error('Add a mapping first.');
    return validateMappings([{ id, name: this.value('rig-map-name'), type: this.value('rig-type'),
      channel: this.number('rig-channel'), cc: this.number('rig-cc'), min: this.number('rig-min'), max: this.number('rig-max'),
      hz: this.number('rig-hz'), program: this.number('rig-program') - 1, low: this.number('rig-low'), high: this.number('rig-high'),
      portHint: this.el<HTMLSelectElement>('rig-output').selectedOptions[0]?.text ?? '',
      ...(this.value('rig-source') ? { source:this.value('rig-source') } : {}) }])[0];
  }
  private replace(mappings: unknown, selected = '') {
    const valid = validateMappings(mappings);
    this.context.disarm('Rig mappings changed; confirm ports and rearm.');
    this.rig.replace(valid); this.ports.clear(); this.dirty = false;
    this.el<HTMLSelectElement>('rig-mapping').replaceChildren(...valid.map(m => new Option(m.name, m.id)));
    this.el<HTMLSelectElement>('rig-mapping').value = selected || valid[0]?.id || '';
    this.showMapping();
    this.status('Mappings applied. Confirm each output and arm explicitly.');
  }
  private showMapping() {
    const mapping = this.rig.mappings.find(m => m.id === this.value('rig-mapping'));
    this.dirty = false;
    if (!mapping) return;
    this.el<HTMLInputElement>('rig-map-name').value = mapping.name;
    this.el<HTMLSelectElement>('rig-type').value = mapping.type;
    for (const key of ['channel','cc','min','max','hz','low','high'] as const) this.el<HTMLInputElement>(`rig-${key}`).value = String(mapping[key]);
    this.el<HTMLInputElement>('rig-program').value = String(mapping.program + 1);
    this.refreshChoices();
    this.el<HTMLSelectElement>('rig-source').value = mapping.source ?? '';
  }
  private refreshChoices() {
    const source = this.el<HTMLSelectElement>('rig-source');
    const oldSource = source.value;
    source.replaceChildren(new Option('Shared first output',''),...this.context.snapshot().nodes.filter(n=>n.kind==='output').map(n=>new Option(n.id,n.id)));
    source.value = oldSource;
    const access = this.context.access();
    const output = this.el<HTMLSelectElement>('rig-output');
    const input = this.el<HTMLSelectElement>('rig-input');
    const oldInput = input.value;
    output.replaceChildren(new Option('Confirm output explicitly', ''), ...Array.from(access?.outputs.values() ?? []).filter(p => p.state === 'connected').map(p => new Option(p.name || p.id, p.id)));
    output.value = this.ports.get(this.value('rig-mapping')) ?? '';
    input.replaceChildren(new Option('Choose input to learn from', ''), ...Array.from(access?.inputs?.values() ?? []).filter(p => p.state === 'connected').map(p => new Option(p.name || p.id, p.id)));
    input.value = oldInput;
  }
  portsChanged() {
    this.rig.refreshPorts();
    const outputs = this.context.access()?.outputs;
    for (const [id, port] of this.ports) if (outputs?.get(port)?.state !== 'connected') this.ports.delete(id);
    if (this.learnCleanup && this.context.access()?.inputs?.get(this.learnInputId)?.state !== 'connected') this.cancelLearn();
    this.refreshChoices();
  }
  stop(reason: string) {
    ++this.generation;
    this.rig.disarm(reason); this.cancelLearn(); this.status(reason);
  }
  private async startLearn() {
    this.ensureApplied();
    if (this.value('rig-type') !== 'cc') throw new Error('Controller CC Learn requires a CC mapping.');
    const input = this.context.access()?.inputs?.get(this.value('rig-input'));
    if (!input || input.state !== 'connected') throw new Error('Choose a connected controller input.');
    this.context.disarm('Controller Learn started; all outputs disarmed.');
    const request = ++this.generation;
    const mappingId = this.value('rig-mapping');
    await input.open?.();
    if (request !== this.generation || mappingId !== this.value('rig-mapping') || input.state !== 'connected') return;
    const listener = (event: MIDIMessageEvent) => {
      const found = event.data && learnedCC(event.data);
      if (!found) return;
      this.cancelLearn();
      this.el<HTMLInputElement>('rig-channel').value = String(found.channel);
      this.el<HTMLInputElement>('rig-cc').value = String(found.cc);
      this.dirty = true;
      this.el('rig-learn-status').textContent = `Learned channel ${found.channel}, CC ${found.cc}. Apply mapping changes, confirm output and rearm.`;
    };
    this.learnInputId = input.id;
    input.addEventListener('midimessage', listener);
    const timer = setTimeout(() => { this.cancelLearn(); this.el('rig-learn-status').textContent = 'Learn timed out after 15 seconds. Select input and try again.'; }, 15000);
    this.learnCleanup = () => { clearTimeout(timer); input.removeEventListener('midimessage', listener); };
    this.el('rig-learn-status').textContent = 'Listening for one controller CC for 15 seconds. No messages are forwarded.';
  }
  private cancelLearn() {
    this.learnCleanup?.(); this.learnCleanup = undefined; this.learnInputId = '';
    this.el('rig-learn-status').textContent = 'Not listening.';
  }
  profile() {
    if (this.dirty) throw new Error('Apply mapping changes before saving the rig.');
    const mappings = this.rig.mappings.map(m => ({ ...m, portHint: this.context.access()?.outputs.get(this.ports.get(m.id) ?? '')?.name || m.portHint }));
    return validateRig({ schemaVersion: 1, name: this.value('rig-name'), patch: this.context.patch(), mappings });
  }
  load(input: unknown) {
    const profile = validateRig(input);
    this.context.loadPatch(profile.patch);
    this.replace(profile.mappings);
    this.el<HTMLInputElement>('rig-name').value = profile.name;
    this.runStarted = 0; this.runEnded = 0;
    for (const id of this.outcomes) this.el<HTMLSelectElement>(`rig-check-${id}`).value = 'not-run';
    this.el('rig-run-status').textContent = 'Profile restored. Repeat the checklist if you want to record a new session.';
  }
  private duration() { return this.runStarted ? ((this.runEnded || performance.now()) - this.runStarted) / 1000 : 0; }
  report() {
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), userAgent: navigator.userAgent,
      rig: { name: this.value('rig-name'), patch: this.context.snapshot(), mappings: this.rig.mappings },
      outputs: this.rig.snapshot(), softwareTimings: this.rig.timings(), cameraDiagnostics: this.context.diagnostics(), pendingMappingEdits: this.dirty,
      setup: { osBrowser: this.value('rig-env-os'), dawPlugin: this.value('rig-env-daw'), hardware: this.value('rig-env-hardware'), routing: this.value('rig-env-route') },
      run: { durationSeconds: this.duration(), finished: !!this.runEnded, tenMinuteDurationReached: this.duration() >= 600,
        outcomes: Object.fromEntries(this.outcomes.map(id => [id, this.value(`rig-check-${id}`)])), observations: this.value('rig-observations'), source: 'Manual musician observations; not automatic hardware certification.' },
      physicalVisualToEffectLatencyMs: null, physicalAudioRoundTripLatencyMs: null };
  }
  render() {
    const states = this.rig.snapshot();
    this.el('rig-state').textContent = states.some(s => s.armed) ? 'ARMED' : 'DISARMED';
    this.el('rig-telemetry').textContent = states.map(s => `${s.name} · ${s.type.toUpperCase()} · ${s.armed ? 'ARMED' : 'DISARMED'} · ${s.ccSent} CC / ${s.programsSent} program sends · ${s.reason}`).join('\n') || 'No rig mappings configured.';
    if (this.runStarted && !this.runEnded) this.el('rig-run-status').textContent = `Acceptance run: ${this.duration().toFixed(0)} seconds. Record playing observations and recovery checks.`;
  }
  private download(name: string, data: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
