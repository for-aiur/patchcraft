import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,browserTargets,compileScene,editScene,checkAdaptive,RevisionStore,sceneFromProfile} from '../src/authoring/scene.ts';
import {ControlGraph,starter} from '../src/control/patch.ts';
import {defaultMapping,MidiRig} from '../src/midi/rig.ts';
import {Retrieval} from '../server/retrieval.ts';
import {propose} from '../server/agent.ts';
import {catalogVersion,seedDocuments} from '../server/catalog.ts';
const branch=(id,signal,effect)=>({id,signal,effect,targetId:`browser-${effect}`,processors:[{kind:'smooth',params:{ms:80}}]});
const decision=edits=>({kind:'proposal',explanation:'Fixture proposal, not real provider evidence.',question:'',edits});
const arrangement=()=>editScene(emptyScene(),decision([branch('light','brightness','cutoff'),branch('move','motion','tremolo'),branch('red','red','drive')].map(branch=>({action:'upsert',branch}))),browserTargets);
test('whole arrangement compiles independent branches and preserves unrelated branches on revision',()=>{
 const scene=arrangement(),next=editScene(scene,decision([{action:'remove',id:'red'}]),browserTargets);
 assert.equal(scene.branches.length,3);assert.equal(next.branches.length,2);assert.deepEqual(scene.branches[0],next.branches[0]);
 const {profile}=compileScene(scene,browserTargets),graph=new ControlGraph(profile.patch);
 const outputs=graph.evaluate({brightness:.2,motion:.7,red:.9,green:0,blue:0,color:0},0);
 assert.deepEqual(outputs.map(o=>[o.id,o.value]),[['light_out',.2],['move_out',.7],['red_out',.9]]);
});
test('unknown targets, duplicate branches and hidden model fields cannot activate',()=>{
 const scene=arrangement();scene.branches[0].targetId='invented';assert.throws(()=>compileScene(scene,browserTargets));
 const duplicate=arrangement();duplicate.branches.push(duplicate.branches[0]);assert.throws(()=>compileScene(duplicate,browserTargets));
 assert.throws(()=>editScene(arrangement(),{...decision([{action:'remove',id:'red'}]),code:'alert()'},browserTargets));
});
test('revision guard, failed activation and undo retain the last valid state',()=>{
 const store=new RevisionStore(arrangement(),browserTargets),next=editScene(store.scene,decision([{action:'remove',id:'red'}]),browserTargets);
 assert.throws(()=>store.accept(next,2,()=>{}));assert.equal(store.revision,0);
 assert.throws(()=>store.accept(next,0,()=>{throw Error('activation failed');}));assert.equal(store.scene.branches.length,3);
 store.accept(next,0,()=>{});assert.equal(store.scene.branches.length,2);store.undo(()=>{});assert.equal(store.scene.branches.length,3);assert.equal(store.revision,2);
});
test('adaptive changes require numeric envelope and cannot rewire or drift beyond authorization',()=>{
 const scene=arrangement(),next=structuredClone(scene),envelope=[{branchId:'light',processor:0,parameter:'ms',min:50,max:150,maxDelta:20}];
 next.branches[0].processors[0].params.ms=90;checkAdaptive(scene,next,envelope);
 next.branches[0].processors[0].params.ms=110;assert.throws(()=>checkAdaptive(scene,next,envelope));
 next.branches[0].processors[0].params.ms=90;next.branches[1].signal='blue';assert.throws(()=>checkAdaptive(scene,next,envelope));
});
test('M3 import preserves MIDI targets and Program Change routes without sending messages',()=>{
 const mapping={...defaultMapping('filter'),name:'Ableton Filter',cc:74};
 const pc={...defaultMapping('scene'),type:'program',program:2};
 const imported=sceneFromProfile({schemaVersion:1,name:'Existing',patch:starter(),mappings:[mapping,pc]});
 const {profile}=compileScene(imported.scene,imported.targets);
 assert.equal(profile.mappings.length,2);assert.ok(profile.mappings.some(m=>m.type==='program'));
 assert.ok(profile.mappings.find(m=>m.type==='cc').source);
});
test('bounded agent retries one invalid decision and then fails closed',async()=>{
 let calls=0;const request={prompt:'Create a light filter',scene:emptyScene(),targets:browserTargets,revision:0};
 const result=await propose(request,new Retrieval(),async()=>{calls++;return calls===1?{bad:true}:decision([{action:'upsert',branch:branch('light','brightness','cutoff')}]);},AbortSignal.timeout(10000));
 assert.equal(calls,2);assert.equal(result.scene.branches.length,1);
 let failed=0;await assert.rejects(()=>propose(request,new Retrieval(),async()=>{failed++;return {bad:true};},AbortSignal.timeout(10000)));assert.equal(failed,2);
});
test('catalog retrieval is deterministic and rejects unprovenanced ingestion',async()=>{
 const rag=new Retrieval();const a=await rag.search('brightness filter'),b=await rag.search('brightness filter');assert.deepEqual(a,b);assert.ok(a.evidence.length);
 await assert.rejects(()=>rag.ingest([{id:'a',content:'x'}],catalogVersion,''));
 await rag.ingest(seedDocuments,catalogVersion,'');const indexed=await rag.search('tremolo');assert.ok(indexed.evidence.every(e=>e.source&&e.version&&e.license));
});
