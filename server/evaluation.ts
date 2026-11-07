import {propose,geminiGenerator,type Generate} from './agent.ts';
import {emptyScene,browserTargets,editScene,type Decision,type Scene} from '../src/authoring/scene.ts';
import {Retrieval} from './retrieval.ts';
const branches=[{id:'light',signal:'brightness',effect:'cutoff',targetId:'browser-cutoff',processors:[{kind:'smooth',params:{ms:80}}]},{id:'move',signal:'motion',effect:'tremolo',targetId:'browser-tremolo',processors:[{kind:'smooth',params:{ms:80}}]},{id:'red',signal:'red',effect:'drive',targetId:'browser-drive',processors:[{kind:'smooth',params:{ms:80}}]}] as const;
const create:Decision={kind:'proposal',explanation:'Deterministic evaluation fixture.',question:'',edits:branches.map(b=>({action:'upsert',branch:structuredClone(b) as any}))};
const full=()=>editScene(emptyScene(),create,browserTargets);
const softened=structuredClone(full());
softened.branches[0].processors[0].params.ms=140;
export const cases=[
 {id:'whole-structure',prompt:'Brightness should open a filter; motion controls tremolo; red light increases drive. Create all three branches.',scene:emptyScene(),fixture:create,accept:(s:Scene,d:Decision)=>d.kind==='proposal'&&['brightness:cutoff','motion:tremolo','red:drive'].every(pair=>s.branches.some(b=>`${b.signal}:${b.effect}`===pair))},
 {id:'incremental-removal',prompt:'Remove only the red drive branch. Keep the light filter and motion tremolo unchanged.',scene:full(),fixture:{kind:'proposal',explanation:'Remove drive.',question:'',edits:[{action:'remove',id:'red'}]} as Decision,accept:(s:Scene)=>s.branches.length===2&&!s.branches.some(b=>b.id==='red')&&JSON.stringify(s.branches)===JSON.stringify(full().branches.slice(0,2))},
 {id:'parameter-change-preserves-topology',prompt:'Make the light filter transition more gently by increasing only its smoothing to 140 milliseconds. Keep every other branch and setting unchanged.',scene:full(),fixture:{kind:'proposal',explanation:'Increased smoothing for the light branch only.',question:'',edits:[{action:'upsert',branch:structuredClone(softened.branches[0])}]} as Decision,accept:(s:Scene)=>s.branches[0].processors[0].params.ms===140&&JSON.stringify(s.branches.slice(1))===JSON.stringify(full().branches.slice(1))},
 {id:'unsupported-gesture',prompt:'Detect my raised left hand and insert an Ableton plugin to control it.',scene:full(),fixture:{kind:'clarify',explanation:'Gesture detection and DAW plugin insertion are unavailable.',question:'Use an existing camera feature and approved destination instead?',edits:[]} as Decision,accept:(s:Scene,d:Decision)=>d.kind==='clarify'&&JSON.stringify(s)===JSON.stringify(full())},
];
export async function evaluate(mode:'fixtures'|'gemini',retrieval:Retrieval,signal:AbortSignal){
 const results=[];
 for(const item of cases){
  const start=performance.now();
  try{
   const generate:Generate=mode==='gemini'?geminiGenerator():async()=>item.fixture;
   const r=await propose({prompt:item.prompt,scene:item.scene,targets:browserTargets,revision:0},retrieval,generate,signal);
   results.push({id:item.id,passed:item.accept(r.scene,r.decision),durationMs:performance.now()-start,modelCalls:r.metrics.modelCalls});
  }catch{signal.throwIfAborted();results.push({id:item.id,passed:false,durationMs:performance.now()-start,error:'Proposal unavailable or invalid.'});}
 }
 return {mode,providerEvidence:mode==='gemini',cases:results,passed:results.filter(r=>r.passed).length,total:results.length,measuredAt:new Date().toISOString(),criteria:'Deterministic structure/preservation/capability assertions. Not a physical musician acceptance test.'};
}
