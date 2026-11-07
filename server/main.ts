import { createServer } from 'node:http';
import { Retrieval } from './retrieval.ts';
import { propose,geminiGenerator,type Request } from './agent.ts';
import { seedDocuments,catalogVersion } from './catalog.ts';
import { embed,embeddingModel } from './embeddings.ts';
import { closeTracing } from './tracing.ts';
import {evaluate} from './evaluation.ts';
const retrieval=new Retrieval(process.env.DATABASE_URL);
const runs:unknown[]=[];let active=0;
const server=createServer(async(req,res)=>{
  const send=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);
  res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  let acquired=false;
  try{
    const origin=req.headers.origin;
    const allowed=(process.env.AUTHORING_ORIGINS||'http://localhost:5173,http://127.0.0.1:5173').split(',');
    if(origin&&!allowed.includes(origin)){send(403,{error:'Origin not allowed.'});return;}
    if(req.method==='GET'&&req.url==='/api/health'){send(200,{provider:'gemini',configured:!!process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-3.1-flash-lite',indexVersion:catalogVersion,tracingConfigured:!!process.env.LANGFUSE_SECRET_KEY});return;}
    if(req.method==='GET'&&req.url==='/api/catalog'){send(200,{version:catalogVersion,documents:seedDocuments});return;}
    if(req.method==='GET'&&req.url==='/api/runs'){send(200,{runs});return;}
    if(req.method==='GET'&&req.url==='/api/retrieval'){send(200,await retrieval.status());return;}
    if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(404,{error:'Unknown endpoint or content type.'});return;}
    if(active>=2){send(429,{error:'Two authoring requests are already running.'});return;}
    active++;acquired=true;
    const parts:Buffer[]=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>160000)throw new Error('REQUEST_TOO_LARGE');parts.push(chunk);}
    const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(req.url==='/api/propose'){
      if(body.consent!==true)throw new Error('EXPLICIT_CONTEXT_CONSENT_REQUIRED');
      if(!process.env.GEMINI_API_KEY){send(503,{error:'Set GEMINI_API_KEY on the backend. Manual camera and MIDI controls remain available.'});return;}
      const output=await propose(body as Request,retrieval,geminiGenerator(),controller.signal);
      runs.unshift({id:output.id,...output.metrics,kind:output.decision.kind});runs.splice(50);
      send(200,output);
    }else if(req.url==='/api/evaluate'){
      if(body.mode==='gemini'&&body.consent!==true)throw new Error('EXPLICIT_CONTEXT_CONSENT_REQUIRED');
      send(200,await evaluate(body.mode==='gemini'?'gemini':'fixtures',retrieval,controller.signal));
    }else if(req.url==='/api/retrieve'){
      if(typeof body.query!=='string'||body.query.length>4000)throw new Error('INVALID_QUERY');
      send(200,await retrieval.search(body.query,catalogVersion,embeddingModel,body.semantic===true?embed:undefined,controller.signal));
    }else if(req.url==='/api/ingest'){
      if(body.semantic===true&&body.consent!==true)throw new Error('EXPLICIT_CONTEXT_CONSENT_REQUIRED');
      send(200,await retrieval.ingest(body.documents??seedDocuments,body.indexVersion??catalogVersion,embeddingModel,body.semantic===true?embed:undefined,controller.signal));
    }else if(req.url==='/api/delete-documents'){
      if(!Array.isArray(body.ids)||typeof body.indexVersion!=='string')throw new Error('INVALID_DELETE');
      await retrieval.remove(body.ids,body.indexVersion);send(200,{deleted:true});
    }else send(404,{error:'Unknown endpoint.'});
  }catch{send(controller.signal.aborted?504:422,{error:controller.signal.aborted?'Authoring timed out or was cancelled. Current patch is unchanged.':'Request or model proposal could not be validated. Current patch is unchanged.'});}
  finally{clearTimeout(timer);if(acquired)active--;}
});
server.listen(3001,'0.0.0.0',()=>console.log('Patchcraft authoring API listening on 3001 (Gemini key stays on server).'));
for(const event of ['SIGTERM','SIGINT'])process.on(event,()=>{server.close();void Promise.all([retrieval.close(),closeTracing()]).then(()=>process.exit());});
