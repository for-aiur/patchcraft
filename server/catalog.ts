import { createHash } from 'node:crypto';
export const catalogVersion='patchcraft-m4-v1';
export type Document = {id:string;version:string;source:string;license:string;content:string};
export const seedDocuments: Document[] = [
  {id:'features',version:catalogVersion,source:'catalog/features',license:'Apache-2.0',content:'Camera features: brightness, red, green, blue, target color similarity (color), frame-difference motion (motion). Normalized 0–1. Red reacts to white light too. No gesture, pose, hand position or object detection is available. Camera ROI and calibration are supported. Exposure and lighting drift require calibration.'},
  {id:'processors',version:catalogVersion,source:'catalog/processors',license:'Apache-2.0',content:'normalize(min,max) maps a positive-width 0–1 calibration range to 0–1; clamp(min,max) bounds values; map(min,max) maps 0–1 to a positive-width range within 0–1; smooth(ms) uses elapsed-time exponential smoothing (0–2000 ms); threshold(low,high) has hysteresis; rateLimit(hz) holds samples at 1–60 Hz. Maximum four processors per branch. Use normalize then smooth by default. Motion often uses normalize min 0 max 0.15. Brightness, red and color default normalize 0–1.'},
  {id:'effects',version:catalogVersion,source:'catalog/effects',license:'Apache-2.0',content:'Browser effects: cutoff low-pass 80–18000 Hz, drive bounded distortion 1–8, tremolo depth 0–1 at 5 Hz. The browser audio chain has fixed filter→drive→tremolo order; control processors can be reordered. MIDI target parameters also support delay/reverb wet if a matching target is explicitly confirmed. No new DSP/plugin code can be generated or executed.'},
  {id:'targets',version:catalogVersion,source:'catalog/rig',license:'Apache-2.0',content:'Only target IDs in the approved target registry may be used, with the matching effect. Do not invent Ableton mappings, CC numbers, ports or plugins. MIDI controls already mapped parameters; inserting Ableton plugins or editing its internal routing requires a separate adapter, which is unavailable. Program Change remains a manually configured M3 route and is preserved as retained mapping data.'},
  {id:'examples',version:catalogVersion,source:'catalog/examples',license:'Apache-2.0',content:'Light Wah: brightness→normalize 0–1→smooth 80ms→cutoff. Red Drive: red or selected color→normalize→smooth→drive. Motion Tremolo: motion→normalize 0–0.15→smooth 80ms→tremolo. Biraz daha yumuşak: increase only the existing branch smooth.ms. Tremoloyu kaldır: remove only the tremolo branch. Hareketi delaye bağla: upsert that branch with motion and a confirmed delay target, otherwise ask to confirm a target.'},
];
export function validateDocuments(input:unknown):Document[] {
  if(!Array.isArray(input)||input.length>100)throw new Error('At most 100 documents per ingestion.');
  const docs=input as Document[], seen=new Set<string>();
  for(const d of docs) {
    if(!d||typeof d.id!=='string'||!/^[a-zA-Z0-9_/-]{1,100}$/.test(d.id)||seen.has(d.id)||typeof d.version!=='string'||!d.version||d.version.length>100||typeof d.source!=='string'||d.source.length>300||typeof d.license!=='string'||!d.license||d.license.length>100||typeof d.content!=='string'||!d.content.trim()||d.content.length>8000)throw new Error('Invalid document metadata or size.');
    seen.add(d.id);
  }
  return structuredClone(docs);
}
export function chunks(docs:Document[]) {
  return docs.flatMap(d=>Array.from({length:Math.ceil(d.content.length/1200)},(_,i)=>({...d,id:`${d.id}/${i}`,content:d.content.slice(i*1200,(i+1)*1200),hash:createHash('sha256').update(`${d.version}\n${d.content.slice(i*1200,(i+1)*1200)}`).digest('hex')})));
}
export function lexical(query:string,docs:Document[]) {
  const words=Array.from(new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)??[])).slice(0,100);
  return docs.map(d=>({...d,score:words.reduce((score,w)=>score+(d.content.toLocaleLowerCase().includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,4);
}
