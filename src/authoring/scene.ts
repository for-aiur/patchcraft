import { ControlGraph, effects, validatePatch, starter, type Effect, type Patch, type PatchNode, type Signal } from '../control/patch.ts';
import { defaultMapping, validateRig, type Mapping, type RigProfile } from '../midi/rig.ts';

export type Target = { id: string; label: string; kind: 'browser' | 'midi'; effect: Effect; channel: number; cc: number; min: number; max: number; hz: number };
export type Processor = { kind: 'normalize' | 'clamp' | 'map' | 'smooth' | 'threshold' | 'rateLimit'; params: Record<string, number> };
export type Branch = { id: string; signal: Signal; effect: Effect; targetId: string; processors: Processor[] };
export type Scene = { version: 1; name: string; camera: Patch['camera']; branches: Branch[]; retainedMappings: Mapping[] };
export type Edit = { action: 'upsert'; branch: Branch } | { action: 'remove'; id: string } | { action:'rename'; name:string } | { action:'camera'; camera:Patch['camera'] };
export type Decision = { kind: 'proposal' | 'clarify'; explanation: string; question: string; edits: Edit[] };
export const browserTargets: Target[] = (['cutoff','drive','tremolo'] as Effect[]).map(effect => ({ id: `browser-${effect}`, label: `Browser ${effect}`, kind: 'browser', effect, channel: 1, cc: 74, min: 0, max: 127, hz: 30 }));
const idPattern = /^[a-zA-Z0-9_-]{1,20}$/;
export function validateTargets(input: unknown): Target[] {
  if (!Array.isArray(input) || input.length > 16) throw new Error('At most sixteen approved targets are supported.');
  const targets = structuredClone(input) as Target[];
  const ids = new Set<string>();
  for (const t of targets) {
    if (!t || !idPattern.test(t.id) || ids.has(t.id) || typeof t.label !== 'string' || !t.label.trim() || t.label.length > 100 || !['browser','midi'].includes(t.kind) || !Object.hasOwn(effects,t.effect)) throw new Error('Invalid approved target.');
    ids.add(t.id);
    if (t.kind === 'browser' && !effects[t.effect].browser) throw new Error('This effect is not supported by browser DSP.');
    validateRig({ schemaVersion:1, name:'target',patch:starter(),mappings:[{...defaultMapping('target'),channel:t.channel,cc:t.cc,min:t.min,max:t.max,hz:t.hz}] });
    if (Object.keys(t).some(key=>!['id','label','kind','effect','channel','cc','min','max','hz'].includes(key))) throw new Error('Unknown target field.');
  }
  return targets;
}
export function compileScene(input: unknown, approved: unknown): { scene: Scene; profile: RigProfile } {
  const targets = validateTargets(approved);
  if (!input || typeof input !== 'object') throw new Error('Scene must be an object.');
  const scene = structuredClone(input) as Scene;
  if (scene.version !== 1 || typeof scene.name !== 'string' || !scene.name.trim() || scene.name.length > 100 || !Array.isArray(scene.branches) || scene.branches.length > 8 || !Array.isArray(scene.retainedMappings) || Object.keys(scene).some(key=>!['version','name','camera','branches','retainedMappings'].includes(key))) throw new Error('Invalid scene structure.');
  const patch = starter(); patch.name = scene.name; patch.camera = scene.camera; patch.nodes=[]; patch.edges=[];
  const mappings = [...scene.retainedMappings];
  const seen = new Set<string>();
  const usedTargets = new Set<string>();
  for (const branch of scene.branches) {
    if (!branch || !idPattern.test(branch.id) || seen.has(branch.id) || !Array.isArray(branch.processors) || branch.processors.length > 4 || Object.keys(branch).some(k=>!['id','signal','effect','targetId','processors'].includes(k))) throw new Error('Invalid or duplicate branch.');
    seen.add(branch.id);
    const target = targets.find(t=>t.id===branch.targetId);
    if (!target || target.effect !== branch.effect || usedTargets.has(target.id)) throw new Error('Use a unique, confirmed target matching each effect.');
    usedTargets.add(target.id);
    let parent = `${branch.id}_input`;
    patch.nodes.push({id:parent,kind:'camera',params:{signal:branch.signal}});
    branch.processors.forEach((processor,index)=>{
      if (!processor || !['normalize','clamp','map','smooth','threshold','rateLimit'].includes(processor.kind) || Object.keys(processor).some(k=>!['kind','params'].includes(k)) || !processor.params || Object.values(processor.params).some(v=>typeof v!=='number'||!Number.isFinite(v))) throw new Error('Invalid processor.');
      const next=`${branch.id}_p${index}`;
      patch.nodes.push({id:next,kind:processor.kind,params:processor.params});
      patch.edges.push({from:parent,to:next,type:'control'}); parent=next;
    });
    const effectId=`${branch.id}_effect`, outputId=`${branch.id}_out`;
    patch.nodes.push({id:effectId,kind:'effect',params:{parameter:branch.effect}},{id:outputId,kind:'output',params:{}});
    patch.edges.push({from:parent,to:effectId,type:'control'},{from:effectId,to:outputId,type:'control'});
    if (target.kind==='midi') mappings.push({...defaultMapping(branch.id),name:target.label,source:outputId,channel:target.channel,cc:target.cc,min:target.min,max:target.max,hz:target.hz});
  }
  // An empty arrangement is a stopped control graph, not an implicit default effect.
  if (!scene.branches.length) {
    patch.nodes=[{id:'idle_input',kind:'camera',params:{signal:'brightness'}},{id:'idle_zero',kind:'map',params:{min:0,max:0.000001}},{id:'idle_out',kind:'output',params:{}}];
    patch.edges=[{from:'idle_input',to:'idle_zero',type:'control'},{from:'idle_zero',to:'idle_out',type:'control'}];
  }
  const profile=validateRig({schemaVersion:1,name:scene.name,patch:validatePatch(patch),mappings});
  return {scene,profile};
}
export function emptyScene(): Scene { return {version:1,name:'My environment patch',camera:starter().camera,branches:[],retainedMappings:[]}; }
export function editScene(current: Scene, decision: unknown, targets: Target[]): Scene {
  if (!decision || typeof decision !== 'object') throw new Error('Missing model decision.');
  const d=decision as Decision;
  if (!['proposal','clarify'].includes(d.kind) || typeof d.explanation!=='string' || d.explanation.length>2000 || typeof d.question!=='string' || d.question.length>1000 || !Array.isArray(d.edits) || d.edits.length>16 || Object.keys(d).some(k=>!['kind','explanation','question','edits'].includes(k))) throw new Error('Invalid agent decision.');
  if (d.kind==='clarify') { if (d.edits.length) throw new Error('Clarification cannot contain edits.'); return structuredClone(current); }
  if (!d.edits.length) throw new Error('A proposal must change the structure or configuration.');
  const next=structuredClone(current);
  for (const edit of d.edits) {
    if (edit.action==='rename') {
      if(Object.keys(edit).some(k=>!['action','name'].includes(k))) throw new Error('Invalid rename operation.');
      next.name=edit.name;
    } else if(edit.action==='camera') {
      if(Object.keys(edit).some(k=>!['action','camera'].includes(k))) throw new Error('Invalid camera operation.');
      next.camera=edit.camera;
    } else if (edit.action==='remove') {
      if (!idPattern.test(edit.id) || Object.keys(edit).some(k=>!['action','id'].includes(k)) || !next.branches.some(b=>b.id===edit.id)) throw new Error('Cannot remove an unknown branch.');
      next.branches=next.branches.filter(b=>b.id!==edit.id);
    } else if (edit.action==='upsert') {
      if (Object.keys(edit).some(k=>!['action','branch'].includes(k))) throw new Error('Invalid edit.');
      const index=next.branches.findIndex(b=>b.id===edit.branch?.id);
      if (index<0) next.branches.push(edit.branch); else next.branches[index]=edit.branch;
    } else throw new Error('Unsupported agent operation.');
  }
  return compileScene(next,targets).scene;
}
export function sceneFromProfile(profile: RigProfile): { scene: Scene; targets: Target[] } {
  const valid=validateRig(profile);
  const scene=emptyScene(); scene.name=valid.name; scene.camera=valid.patch.camera;
  const targets=[...browserTargets];
  const represented = new Set<string>();
  const remap = new Map<string,string>();
  for (const [index,out] of valid.patch.nodes.filter(n=>n.kind==='output').entries()) {
    const chain: PatchNode[]=[]; let node: PatchNode|undefined=out;
    while(node) { chain.unshift(node); node=valid.patch.nodes.find(n=>n.id===valid.patch.edges.find(e=>e.to===node!.id)?.from); }
    const input=chain.find(n=>n.kind==='camera'), effect=chain.find(n=>n.kind==='effect');
    if (!input || !effect) continue;
    const effectName=effect.params.parameter as Effect;
    const bound=valid.mappings.filter(m=>m.type==='cc' && (m.source===out.id || (!m.source && index===0)));
    const destinations=bound.length?bound:[undefined];
    for(const [destinationIndex,mapping] of destinations.entries()) {
      let targetId=`browser-${effectName}`;
      if(mapping) {
        targetId=`midi-${index}-${destinationIndex}`;
        targets.push({id:targetId,label:mapping.name,kind:'midi',effect:effectName,channel:mapping.channel,cc:mapping.cc,min:mapping.min,max:mapping.max,hz:mapping.hz});
        represented.add(mapping.id);
      }
      if(!targets.some(t=>t.id===targetId)) continue;
      if(!remap.has(out.id)) remap.set(out.id,`branch${index}_${destinationIndex}_out`);
      scene.branches.push({id:`branch${index}_${destinationIndex}`,signal:input.params.signal as Signal,effect:effectName,targetId,
        processors:chain.filter(n=>!['camera','effect','output'].includes(n.kind)).map(n=>({kind:n.kind as Processor['kind'],params:n.params as Record<string,number>}))});
    }
  }
  scene.retainedMappings=valid.mappings.filter(m=>!represented.has(m.id)).map(m=>({...m,...(m.source?{source:remap.get(m.source)??m.source}:{})}));
  compileScene(scene,targets);
  return {scene,targets};
}
export type Envelope = { branchId: string; processor: number; parameter: string; min: number; max: number; maxDelta: number };
export function checkAdaptive(before: Scene, after: Scene, envelope: Envelope[]) {
  if(before.retainedMappings.some(m=>m.type==='program')) throw new Error('Disable Program Change routes before enabling adaptive changes.');
  if (!Array.isArray(envelope) || envelope.length<1 || envelope.length>16) throw new Error('Define a bounded adaptive parameter envelope.');
  const permitted = new Set<string>();
  const restored=structuredClone(after);
  for (const e of envelope) {
    if (!e || !Number.isFinite(e.min) || !Number.isFinite(e.max) || !Number.isFinite(e.maxDelta) || e.min>e.max || e.maxDelta<=0) throw new Error('Invalid adaptive bounds.');
    const key=`${e.branchId}/${e.processor}/${e.parameter}`;
    if(permitted.has(key)) throw new Error('Duplicate adaptive parameter.'); permitted.add(key);
    const old=before.branches.find(b=>b.id===e.branchId)?.processors[e.processor]?.params[e.parameter];
    const branch=restored.branches.find(b=>b.id===e.branchId);
    const next=branch?.processors[e.processor]?.params[e.parameter];
    if(typeof old!=='number' || typeof next!=='number' || !Number.isFinite(next) || next<e.min || next>e.max || Math.abs(next-old)>e.maxDelta) throw new Error('Adaptive change exceeds the authorized envelope.');
    branch!.processors[e.processor].params[e.parameter]=old;
  }
  if(JSON.stringify(restored)!==JSON.stringify(before)) throw new Error('Adaptive mode cannot change structure, targets or unapproved fields.');
}
export class RevisionStore {
  revision=0;
  history: {revision:number;scene:Scene}[]=[];
  scene: Scene;
  targets: Target[];
  constructor(scene: Scene, targets: Target[]) { this.scene=compileScene(scene,targets).scene; this.targets=validateTargets(targets); }
  accept(next: Scene, base: number, activate: (profile: RigProfile, adaptive: boolean)=>void, envelope?: Envelope[]) {
    if(base!==this.revision) throw new Error('Patch changed while the agent was working. Generate a new proposal.');
    const compiled=compileScene(next,this.targets);
    if(envelope) checkAdaptive(this.scene,compiled.scene,envelope);
    // Activation is synchronous and prevalidated; a failure leaves the store uncommitted.
    activate(compiled.profile,!!envelope);
    this.history.push({revision:this.revision,scene:structuredClone(this.scene)});
    if(this.history.length>30)this.history.shift();
    this.scene=compiled.scene; this.revision++;
  }
  undo(activate:(profile:RigProfile,adaptive:boolean)=>void) {
    const previous=this.history.at(-1); if(!previous)throw new Error('No earlier revision.');
    activate(compileScene(previous.scene,this.targets).profile,false);
    this.history.pop(); this.scene=previous.scene; this.revision++;
  }
}
