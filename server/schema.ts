import { z } from 'zod';
const parameter=z.object({min:z.number().optional(),max:z.number().optional(),ms:z.number().optional(),low:z.number().optional(),high:z.number().optional(),hz:z.number().optional()}).strict();
const camera=z.object({roi:z.object({x:z.number(),y:z.number(),width:z.number(),height:z.number()}).strict(),target:z.array(z.number()).length(3),tolerance:z.number(),fps:z.number()}).strict();
export const BranchSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,20}$/),signal:z.enum(['brightness','red','green','blue','color','motion']),effect:z.enum(['cutoff','drive','tremolo','delay','reverb']),targetId:z.string(),processors:z.array(z.object({kind:z.enum(['normalize','clamp','map','smooth','threshold','rateLimit']),params:parameter}).strict()).max(4)}).strict();
export const DecisionSchema=z.object({kind:z.enum(['proposal','clarify']),explanation:z.string().max(2000),question:z.string().max(1000),edits:z.array(z.discriminatedUnion('action',[
  z.object({action:z.literal('upsert'),branch:BranchSchema}).strict(),
  z.object({action:z.literal('remove'),id:z.string()}).strict(),
  z.object({action:z.literal('rename'),name:z.string()}).strict(),
  z.object({action:z.literal('camera'),camera}).strict(),
])).max(16)}).strict();

// Provider grammar bounds can explode the constrained-decoding state space.
// Keep the shape/enums upstream; enforce every size/range/pattern with Zod and
// the deterministic compiler after generation, before any activation.
function providerShape(value:unknown):unknown {
  if(Array.isArray(value))return value.map(providerShape);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['$schema','maxItems','minItems','maxLength','minLength','pattern','minimum','maximum'].includes(key)).map(([key,child])=>[key,providerShape(child)]));
  return value;
}
export const ProviderDecisionSchema=providerShape(z.toJSONSchema(DecisionSchema)) as Record<string,unknown>;
