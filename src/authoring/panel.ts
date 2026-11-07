import { RevisionStore, browserTargets, emptyScene, compileScene, sceneFromProfile, validateTargets, type Scene, type Target, type Decision, type Envelope } from './scene';
import type { RigProfile } from '../midi/rig';
type Proposal={id:string;baseRevision:number;decision:Decision;scene:Scene;metrics:unknown};
type Context={profile:()=>RigProfile;activate:(profile:RigProfile,adaptive:boolean)=>void;observations:()=>Record<string,number>};
export class AuthorPanel {
  private store=new RevisionStore(emptyScene(),browserTargets);
  private candidate?:Proposal;
  private abort?:AbortController;
  private messages:{role:'user'|'assistant';text:string}[]=[];
  private activeProfile='';
  private adaptive?:{envelope:Envelope[];until:number;goal:string;revision:number};
  private timer?:ReturnType<typeof setTimeout>;
  constructor(private context:Context){
    this.el('author-panel').innerHTML=`<div class="section-title"><span>CONVERSATIONAL PATCH LAB</span><span id="agent-state" class="badge">GEMINI</span></div>
<h2>Describe your sound.</h2><p>Build the entire camera → processors → effects arrangement in conversation. Review each proposal, then apply it. Outputs require explicit rearming.</p>
<label><input id="agent-consent" type="checkbox"> Send my text, patch and approved targets to Google Gemini. Camera frames and audio stay here.</label>
<label><input id="agent-trace" type="checkbox"> Allow this conversation and patch context in configured Langfuse traces (optional).</label>
<div id="agent-chat" role="log" aria-live="polite"></div><label>Your request<textarea id="agent-prompt" rows="3" maxlength="4000" placeholder="Işık arttıkça filtre açılsın, hareket tremolo olsun, kırmızı ışık drive eklesin."></textarea></label>
<div class="actions"><button id="agent-send" class="primary">Propose arrangement</button><button id="agent-cancel" class="secondary">Cancel</button><button id="agent-apply" class="secondary" disabled>Apply reviewed proposal</button><button id="agent-undo" class="secondary">Undo last application</button></div><p id="agent-status" role="status">Checking local authoring backend…</p>
<div class="fields"><div><h3>Applied arrangement</h3><pre id="agent-applied"></pre></div><div><h3>Candidate arrangement</h3><pre id="agent-candidate">No proposal.</pre></div></div>
<details><summary>Approved destinations & current rig</summary><p>Default destinations control the browser preview. For Ableton, map a CC to an existing effect first and approve the exact channel and CC here. This does not insert plugins or select MIDI ports.</p><div class="actions"><button id="agent-import" class="secondary">Import current rig into conversation</button><button id="agent-targets" class="secondary">Approve target registry</button></div><label>Target registry · advanced JSON<textarea id="agent-target-json" rows="7"></textarea></label><p class="hint">MIDI target example: {"id":"ableton-filter","label":"Ableton filter","kind":"midi","effect":"cutoff","channel":1,"cc":74,"min":0,"max":127,"hz":30}</p></details>
<details><summary>Optional adaptive session · bounded numeric changes</summary><p>Authorize a processor parameter envelope. No graph rewiring, new targets or Program Change in adaptive mode. At most one request per 10 seconds; session expires after 60 seconds.</p><label>Goal<input id="agent-goal" maxlength="1000" placeholder="Adapt smoothing slightly as lighting changes"></label><label>Authorized envelope JSON<textarea id="agent-envelope" rows="3" placeholder='[{"branchId":"light","processor":0,"parameter":"ms","min":50,"max":200,"maxDelta":20}]'></textarea></label><div class="actions"><button id="agent-adapt" class="secondary">Authorize 60-second session</button><button id="agent-stop" class="secondary">Stop adaptive session</button></div></details>
<details><summary>Retrieval, traces & test diagnostics</summary><div class="actions"><button id="agent-index" class="secondary">Index built-in catalog locally</button><button id="agent-embed" class="secondary">Embed catalog with Gemini</button><button id="agent-retrieve" class="secondary">Inspect retrieval for request</button><button id="agent-eval" class="secondary">Run fixture evaluations</button><button id="agent-real-eval" class="secondary">Run real Gemini evaluations</button><button id="agent-report" class="secondary">Export authoring report</button></div><pre id="agent-debug">No runs yet.</pre><p class="hint">Authoring duration is model/network time. It is not audio latency or physically measured camera-to-DAW latency.</p></details>`;
    const initial=sceneFromProfile(this.context.profile());this.store=new RevisionStore(initial.scene,initial.targets);this.activeProfile=this.fingerprint();
    this.area('agent-target-json').value=JSON.stringify(this.store.targets,null,2);
    this.bind('agent-send',()=>this.request(false));
    this.bind('agent-cancel',()=>{this.abort?.abort();this.stopAdaptive();this.status('Request cancelled; applied arrangement preserved.');});
    this.bind('agent-apply',()=>{if(!this.candidate)throw new Error('No candidate.');this.stopAdaptive();this.ensureCurrent();this.store.accept(this.candidate.scene,this.candidate.baseRevision,this.context.activate);this.activeProfile=this.fingerprint();this.candidate=undefined;this.render();this.status('Applied. Restart camera if stopped, confirm MIDI ports and explicitly arm outputs.');});
    this.bind('agent-undo',()=>{this.stopAdaptive();this.ensureCurrent();this.store.undo(this.context.activate);this.activeProfile=this.fingerprint();this.candidate=undefined;this.render();this.status('Previous arrangement restored; outputs require rearming.');});
    this.bind('agent-import',()=>{this.stopAdaptive();const imported=sceneFromProfile(this.context.profile());this.store=new RevisionStore(imported.scene,imported.targets);this.activeProfile=this.fingerprint();this.candidate=undefined;this.area('agent-target-json').value=JSON.stringify(imported.targets,null,2);this.messages=[];this.render();this.status('Current rig imported. Review and approve the destination registry before cloud authoring.');this.input('agent-consent').checked=false;});
    this.bind('agent-targets',()=>{const targets=validateTargets(JSON.parse(this.area('agent-target-json').value));compileScene(this.store.scene,targets);this.stopAdaptive();this.store.targets=targets;this.store.revision++;this.candidate=undefined;this.render();this.status('Target registry approved.');});
    this.bind('agent-adapt',()=>{this.ensureCurrent();const envelope=JSON.parse(this.area('agent-envelope').value);this.store.accept(this.store.scene,this.store.revision,()=>{},envelope);this.adaptive={envelope,until:Date.now()+60000,goal:this.input('agent-goal').value,revision:this.store.revision};this.schedule();this.status('Adaptive session authorized for 60 seconds.');});
    this.bind('agent-stop',()=>{this.stopAdaptive();this.status('Adaptive session stopped.');});
    this.bind('agent-index',()=>this.index(false));this.bind('agent-embed',()=>this.index(true));
    this.bind('agent-retrieve',async()=>{this.debug(await this.post('/api/retrieve',{query:this.area('agent-prompt').value}));});
    this.bind('agent-eval',async()=>this.debug(await this.post('/api/evaluate',{mode:'fixtures'})));
    this.bind('agent-real-eval',async()=>{if(!this.input('agent-consent').checked)throw new Error('Approve Gemini context first.');this.status('Running three real Gemini evaluation cases…');this.debug(await this.post('/api/evaluate',{mode:'gemini',consent:true}));this.status('Evaluation finished; inspect the deterministic pass/fail results.');});
    this.bind('agent-report',()=>{const blob=new Blob([JSON.stringify({generatedAt:new Date().toISOString(),revision:this.store.revision,scene:this.store.scene,targets:this.store.targets,history:this.store.history,lastProposal:this.candidate,realRoundTripMs:null,measurement:'Authoring software diagnostics; no physical timing measurement.'},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='patchcraft-m4-authoring-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.abort?.abort();this.stopAdaptive();}});
    this.render();void fetch('/api/health').then(r=>r.ok?r.json():Promise.reject()).then(h=>this.status(h.configured?`Gemini backend ready · ${h.model}`:'Set GEMINI_API_KEY in .env and restart the authoring backend. Manual controls remain available.')).catch(()=>this.status('Authoring backend unavailable. Run docker compose up --build locally. Manual controls remain available.'));
  }
  private el(id:string){return document.getElementById(id)!;}
  private area(id:string){return this.el(id) as HTMLTextAreaElement;}
  private input(id:string){return this.el(id) as HTMLInputElement;}
  private status(text:string){this.el('agent-status').textContent=text;}
  private debug(value:unknown){this.el('agent-debug').textContent=JSON.stringify(value,null,2);}
  private bind(id:string,fn:()=>unknown){this.el(id).addEventListener('click',()=>{void Promise.resolve().then(fn).catch(e=>{this.stopAdaptive();this.status(e instanceof Error?e.message:'Operation failed.');});});}
  private fingerprint(){const p=this.context.profile();return JSON.stringify({patch:p.patch,mappings:p.mappings.map(({portHint,...m})=>m)});}
  private ensureCurrent(){if(this.activeProfile&&this.activeProfile!==this.fingerprint()){this.candidate=undefined;this.stopAdaptive();this.render();throw new Error('Manual patch or mapping changes detected. Import current rig before continuing.');}}
  browserOutput(id:string){if(!this.activeProfile)return true;const branch=this.store.scene.branches.find(b=>`${b.id}_out`===id);return !branch||this.store.targets.find(t=>t.id===branch.targetId)?.kind==='browser';}
  private render(){const describe=(scene:Scene)=>scene.branches.map(b=>`${b.id}: ${b.signal} → ${b.processors.map(p=>`${p.kind}(${Object.entries(p.params).map(([k,v])=>`${k}=${v}`).join(', ')}) → `).join('')}${b.effect} → ${this.store.targets.find(t=>t.id===b.targetId)?.label??b.targetId}`).join('\n')||'No active branches.';this.el('agent-applied').textContent=`Revision ${this.store.revision}\n${describe(this.store.scene)}`;this.el('agent-candidate').textContent=this.candidate?`${this.candidate.decision.explanation}\n${describe(this.candidate.scene)}`:'No proposal.';(this.el('agent-apply') as HTMLButtonElement).disabled=!this.candidate||this.candidate.decision.kind!=='proposal';}
  private async post(path:string,body:unknown,signal?:AbortSignal){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});const data=await r.json();if(!r.ok)throw new Error(data.error||'Backend failed.');return data;}
  private async request(adaptive:boolean){
    if(this.abort)throw new Error('Wait for or cancel the current authoring request.');
    if(!this.input('agent-consent').checked)throw new Error('Approve sending text and patch context to Gemini first.');
    this.ensureCurrent();
    if(!adaptive)this.stopAdaptive();
    const session=this.adaptive;
    if(adaptive&&(!session||Date.now()>session.until)) {this.stopAdaptive();return;}
    const observations=adaptive?this.context.observations():undefined;
    if(adaptive&&(!observations||observations.ageMs>500)){this.stopAdaptive();throw new Error('Camera is stale. Adaptive session stopped.');}
    const prompt=adaptive?session!.goal:this.area('agent-prompt').value;
    const controller=new AbortController();this.abort=controller;
    const base=this.store.revision;
    this.status('Gemini is proposing a validated change…');
    try{
      const result=await this.post('/api/propose',{prompt,scene:this.store.scene,targets:this.store.targets,revision:base,history:this.messages.slice(-10),consent:true,traceConsent:this.input('agent-trace').checked,...(adaptive?{envelope:session!.envelope,observations}:{})},controller.signal) as Proposal;
      this.ensureCurrent();if(base!==this.store.revision)throw new Error('Stale proposal discarded.');
      if(adaptive){if(this.adaptive!==session||Date.now()>session!.until)throw new Error('Adaptive authorization expired.');if(result.decision.kind==='proposal'){this.store.accept(result.scene,base,this.context.activate,session!.envelope);this.activeProfile=this.fingerprint();}}
      else {this.candidate=result;this.messages.push({role:'user',text:prompt.slice(0,2000)},{role:'assistant',text:(result.decision.explanation+' '+result.decision.question).slice(0,2000)});this.messages=this.messages.slice(-12);const line=document.createElement('p');line.textContent=`You: ${prompt}\nPatchcraft: ${result.decision.explanation} ${result.decision.question}`;this.el('agent-chat').append(line);while(this.el('agent-chat').children.length>12)this.el('agent-chat').firstElementChild?.remove();}
      this.debug({id:result.id,metrics:result.metrics,adaptive});this.render();this.status(result.decision.kind==='clarify'?result.decision.question:adaptive?'Bounded numeric adaptation applied.':'Review candidate against applied arrangement before applying.');
    } finally{this.abort=undefined;if(adaptive&&this.adaptive===session)this.schedule();}
  }
  private schedule(){clearTimeout(this.timer);if(!this.adaptive)return;this.timer=setTimeout(()=>{void this.request(true).catch(e=>{this.stopAdaptive();this.status(e instanceof Error?e.message:'Adaptive request failed.');});},10000);}
  private stopAdaptive(){this.adaptive=undefined;clearTimeout(this.timer);}
  private async index(semantic:boolean){if(semantic&&!this.input('agent-consent').checked)throw new Error('Approve Gemini access before embedding.');this.debug(await this.post('/api/ingest',{semantic,consent:this.input('agent-consent').checked}));this.status('Catalog indexed.');}
}
