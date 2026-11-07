import type { Embedder } from './retrieval.ts';
export const embeddingModel=process.env.GEMINI_EMBEDDING_MODEL||'gemini-embedding-001';
export const embed:Embedder=async(texts,signal)=>{
  if(!process.env.GEMINI_API_KEY)throw new Error('GEMINI_NOT_CONFIGURED');
  const vectors:number[][]=[];
  for(let i=0;i<texts.length;i+=20){
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(embeddingModel)}:batchEmbedContents`,{method:'POST',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]),headers:{'content-type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({requests:texts.slice(i,i+20).map(text=>({model:`models/${embeddingModel}`,content:{parts:[{text}]},outputDimensionality:768}))})});
    if(!response.ok)throw new Error('EMBEDDING_UNAVAILABLE');
    const json=await response.json() as {embeddings?:{values:number[]}[]};
    if(!Array.isArray(json.embeddings))throw new Error('INVALID_EMBEDDING');
    vectors.push(...json.embeddings.map(e=>e.values));
  }
  return vectors;
};
