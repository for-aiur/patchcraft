import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MidiRig, defaultMapping, validateRig, validateMappings, learnedCC } from '../src/midi/rig.ts';
import { starter } from '../src/control/patch.ts';
const port = id => ({id,name:id,state:'connected',messages:[],send(bytes){this.messages.push(bytes)},clear(){}});

test('rig output nodes fan out validated controls and lose device bindings on restore', () => {
  const rig = new MidiRig();
  const first = defaultMapping('filter');
  const second = {...defaultMapping('drive'),channel:2,cc:20,min:10,max:50};
  rig.replace([first,second]);
  const a=port('DAW A'), b=port('DAW B');
  rig.select(first.id,a); rig.select(second.id,b);
  rig.arm(first.id,100,100); rig.arm(second.id,100,100);
  rig.dispatch(0.5,100,100);
  assert.deepEqual(a.messages,[[0xb0,74,64]]);
  assert.deepEqual(b.messages,[[0xb1,20,30]]);
  rig.replace(rig.mappings);
  assert.ok(rig.snapshot().every(r=>!r.armed && r.portName===null));
  assert.throws(()=>rig.arm(first.id,200,200));
});

test('Program Change requires a low-high crossing, has a send cap and never fires on arm', () => {
  const rig=new MidiRig();
  rig.replace([{...defaultMapping('preset'),type:'program',program:127,channel:16}]);
  const p=port('Pedal'); rig.select('preset',p); rig.arm('preset',100,100);
  rig.dispatch(1,100,100); assert.equal(p.messages.length,0);
  rig.dispatch(0,110,110); rig.dispatch(1,120,120); rig.dispatch(1,130,130);
  assert.deepEqual(p.messages,[[0xcf,127]]);
  rig.dispatch(0,140,140); rig.dispatch(1,150,150); assert.equal(p.messages.length,1);
  rig.dispatch(1,400,400); assert.equal(p.messages.length,2);
  rig.disarm('Stop'); rig.arm('preset',500,500); rig.dispatch(1,500,500);
  assert.equal(p.messages.length,2);
  rig.dispatch(0,510,510); rig.dispatch(1,1200,510);
  assert.equal(rig.snapshot()[0].armed,false);
  assert.equal(p.messages.length,2);
});

test('explicit setup messages stay disarmed and disconnect never silently restores output', () => {
  const rig=new MidiRig(); rig.replace([defaultMapping('map')]);
  const p=port('test'); rig.select('map',p);
  rig.probe('map',100);
  assert.deepEqual(p.messages,[[0xb0,74,0]]);
  assert.equal(rig.snapshot()[0].armed,false);
  assert.throws(()=>rig.probe('map',110));
  rig.arm('map',400,400); p.state='disconnected'; rig.refreshPorts();
  p.state='connected'; rig.dispatch(1,500,500);
  assert.equal(p.messages.length,1); assert.throws(()=>rig.arm('map',500,500));
});

test('rig profiles retain M2 patches and reject invalid or executable metadata', () => {
  const profile={schemaVersion:1,name:'My rig',patch:starter(),mappings:[defaultMapping('a')]};
  assert.deepEqual(validateRig(JSON.parse(JSON.stringify(profile))),profile);
  for(const mutate of [p=>p.schemaVersion=2,p=>p.mappings[0].program=128,p=>p.mappings[0].channel=0,p=>p.mappings[0].low=0.9,p=>p.mappings[0].script='run()',p=>p.mappings.push({...p.mappings[0]})]) {
    const copy=structuredClone(profile); mutate(copy); assert.throws(()=>validateRig(copy));
  }
  assert.throws(()=>validateMappings(Array.from({length:9},(_,i)=>defaultMapping(String(i)))));
});

test('controller MIDI Learn accepts one bounded CC and ignores notes, realtime and channel mode', () => {
  assert.deepEqual(learnedCC([0xb2,21,127]),{channel:3,cc:21});
  for(const bytes of [[0x90,21,127],[0xf8],[0xb0,123,0],[0xb0,20,200],[0xc0,1],[0xb0,20]]) assert.equal(learnedCC(bytes),undefined);
});
