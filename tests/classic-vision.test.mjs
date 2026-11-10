import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { processImagePipeline } from '../src/vision/pipeline.ts';
const rgba = values => new Uint8ClampedArray(values.flatMap(v=>[v,v,v,255]));
const step=(name,parameters={},id=name)=>({id,module:`org.patchcraft.image.${name}`,version:1,enabled:true,parameters});
const run=(pixels,w,h,stages,states=new Map())=>processImagePipeline(pixels,w,h,{stages},undefined,undefined,states);

test('Sobel rejects a flat field and responds to a spatial edge',()=>{
 const flat=rgba(Array(25).fill(80));assert.ok([...run(flat,5,5,[step('sobel')])].every((v,i)=>i%4===3?v===255:v===0));
 const edge=rgba(Array.from({length:25},(_,i)=>i%5<2?0:255));assert.ok(run(edge,5,5,[step('sobel')]).some((v,i)=>i%4!==3&&v>0));
});
test('Otsu separates a bimodal scene and invert complements its mask',()=>{
 const input=rgba([10,10,220,220]),a=run(input,4,1,[step('otsu')]),b=run(input,4,1,[step('otsu',{invert:true})]);
 assert.deepEqual([a[0],a[4],a[8],a[12]],[0,0,255,255]);for(let i=0;i<a.length;i+=4)assert.equal(a[i]+b[i],255);
});
test('adaptive threshold tolerates a uniform exposure offset without clipping',()=>{
 const values=Array.from({length:49},(_,i)=>60+(i%7)*10+(Math.floor(i/7)%2)*20);
 assert.deepEqual(run(rgba(values),7,7,[step('adaptive-threshold')]),run(rgba(values.map(v=>v+30)),7,7,[step('adaptive-threshold')]));
});
test('median removes an isolated impulse',()=>{
 const values=Array(25).fill(0);values[12]=255;assert.equal(run(rgba(values),5,5,[step('median')])[12*4],0);
});
test('temporal masks start empty, detect changes and reset per session',()=>{
 for(const module of ['motion-mask','background-subtract']){
 const states=new Map(),stages=[step(module)],dark=rgba([0,0,0,0]),bright=rgba([255,255,255,255]);
 assert.equal(run(dark,2,2,stages,states)[0],0);assert.equal(run(dark,2,2,stages,states)[0],0);assert.equal(run(bright,2,2,stages,states)[0],255);
 states.clear();assert.equal(run(bright,2,2,stages,states)[0],0);
 }
 const states=new Map(),stages=[step('background-subtract',{learningRate:.2})];run(rgba([0]),1,1,stages,states);
 for(let i=0;i<40;i++)run(rgba([255]),1,1,stages,states);assert.equal(run(rgba([255]),1,1,stages,states)[0],0);
});
test('cleaned Motion Pulse and Color Focus preserve legacy frames and routed measurement frames',()=>{
 for(const name of ['motion-pulse','color-focus']){
 const legacy=JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}-legacy.json`,import.meta.url))),clean=JSON.parse(fs.readFileSync(new URL(`../src/recipes/${name}.json`,import.meta.url)));
 assert.deepEqual(clean.weights,legacy.weights);assert.deepEqual(clean.midi,legacy.midi);assert.equal(clean.smoothingMs,legacy.smoothingMs);
 for(let frame=0;frame<2;frame++){
 const input=new Uint8ClampedArray(16*12*4).map((_,i)=>i%4===3?255:(i*17+frame*31)%256),oldOutputs=new Map(),newOutputs=new Map();
 const oldFrame=processImagePipeline(input,16,12,legacy.image,undefined,(s,_i,p)=>oldOutputs.set(s.id,p.slice()));
 const newFrame=processImagePipeline(input,16,12,clean.image,undefined,(s,_i,p)=>newOutputs.set(s.id,p.slice()));assert.deepEqual(oldFrame,newFrame);
 for(const key of Object.keys(legacy.routes)){if(!legacy.routes[key])continue;const [oldId,oldPort]=legacy.routes[key].split('|'),[newId,newPort]=clean.routes[key].split('|');assert.equal(oldPort,newPort);assert.deepEqual(oldOutputs.get(oldId),newOutputs.get(newId));}
 }
 }
});
test('every bundled recipe has active steps, valid routes and executable pipelines',()=>{
 const names=new Set();for(const file of fs.readdirSync(new URL('../src/recipes',import.meta.url)).filter(f=>f.endsWith('.json'))){
 const recipe=JSON.parse(fs.readFileSync(new URL(`../src/recipes/${file}`,import.meta.url)));assert.ok(!names.has(recipe.id));names.add(recipe.id);
 for(const s of recipe.image.stages)assert.equal(s.enabled,true,`${file}: unused bypass`);
 for(const route of Object.values(recipe.routes)){if(!route)continue;const [id,port]=route.split('|');assert.ok(recipe.image.stages.find(s=>s.id===id)?.measurements.includes(port),`${file}: invalid route ${route}`);}
 const states=new Map();for(let n=0;n<2;n++)run(rgba(Array.from({length:192},(_,i)=>(i*19+n*20)%256)),16,12,recipe.image.stages,states);
 }
});
