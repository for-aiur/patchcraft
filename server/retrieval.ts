import pg from 'pg';
import { chunks, lexical, seedDocuments, validateDocuments, catalogVersion, type Document } from './catalog.ts';

export type Embedder=(texts:string[],signal?:AbortSignal)=>Promise<number[][]>;
export class Retrieval {
  private pool?: pg.Pool;
  private initialized?: Promise<void>;
  private memory=chunks(seedDocuments);
  constructor(url?:string) { if(url)this.pool=new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:2000,statement_timeout:5000}); }
  async init() {
    if(!this.pool)return;
    this.initialized??=this.pool.query(`CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS patchcraft_chunks (id text NOT NULL,index_version text NOT NULL,version text NOT NULL,source text NOT NULL,license text NOT NULL,content text NOT NULL,hash text NOT NULL,embedding_model text,embedding vector,PRIMARY KEY(id,index_version));
      CREATE TABLE IF NOT EXISTS patchcraft_runs(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),summary jsonb NOT NULL);`).then(()=>{}).catch(error=>{this.initialized=undefined;throw error;});
    await this.initialized;
  }
  async ingest(input:unknown,indexVersion:string,embeddingModel:string,embed?:Embedder,signal?:AbortSignal) {
    if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(indexVersion))throw new Error('Invalid index version.');
    const docs=chunks(validateDocuments(input));
    const vectors=embed&&docs.length?await embed(docs.map(d=>d.content),signal):undefined;
    if(vectors && (vectors.length!==docs.length||vectors.some(v=>v.length!==768||v.some(n=>!Number.isFinite(n)))))throw new Error('Embedding model returned invalid dimensions or values.');
    signal?.throwIfAborted();
    if(!this.pool) { if(embed)throw new Error('Vector ingestion requires PostgreSQL.'); this.memory=docs;return {chunks:docs.length,indexVersion,mode:'memory-lexical'}; }
    await this.init(); const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[indexVersion]);
      for(const [i,d]of docs.entries()) {
        await client.query(`INSERT INTO patchcraft_chunks(id,index_version,version,source,license,content,hash,embedding_model,embedding) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::vector) ON CONFLICT(id,index_version) DO UPDATE SET version=excluded.version,source=excluded.source,license=excluded.license,content=excluded.content,hash=excluded.hash,embedding_model=excluded.embedding_model,embedding=excluded.embedding`,[d.id,indexVersion,d.version,d.source,d.license,d.content,d.hash,vectors?embeddingModel:null,vectors?JSON.stringify(vectors[i]):null]);
      }
      await client.query('DELETE FROM patchcraft_chunks WHERE index_version=$1 AND NOT(id=ANY($2::text[]))',[indexVersion,docs.map(d=>d.id)]);
      signal?.throwIfAborted(); await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    return {chunks:docs.length,indexVersion,mode:vectors?'vector+lexical':'lexical'};
  }
  async search(query:string,indexVersion=catalogVersion,embeddingModel='',embed?:Embedder,signal?:AbortSignal) {
    let docs:Document[]=this.memory, vectorRows: {id:string;distance:number}[]=[];
    let mode='catalog-fallback';
    if(this.pool) {
      try {
        await this.init();
        const rows=await this.pool.query('SELECT id,version,source,license,content FROM patchcraft_chunks WHERE index_version=$1 ORDER BY id LIMIT 500',[indexVersion]);
        if(rows.rows.length){docs=rows.rows;mode='lexical';}
        if(embed&&rows.rows.length) {
          const [vector]=await embed([query],signal);
          if(vector.length!==768||vector.some(n=>!Number.isFinite(n)))throw new Error('Invalid query embedding.');
          const nearest=await this.pool.query('SELECT id,(embedding <=> $1::vector) AS distance FROM patchcraft_chunks WHERE index_version=$2 AND embedding_model=$3 AND embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT 8',[JSON.stringify(vector),indexVersion,embeddingModel]);
          vectorRows=nearest.rows; if(vectorRows.length)mode='hybrid';
        }
      }catch { signal?.throwIfAborted(); mode='catalog-fallback';docs=this.memory; }
    }
    const ranked=lexical(query,docs);
    const scores=new Map(ranked.map((d,i)=>[d.id,1/(60+i+1)]));
    vectorRows.forEach((row,i)=>scores.set(row.id,(scores.get(row.id)??0)+1/(60+i+1)));
    const evidence=Array.from(scores).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([id,score])=>({...docs.find(d=>d.id===id)!,score})).filter(d=>d.content);
    return {mode,indexVersion,embeddingModel:mode==='hybrid'?embeddingModel:null,evidence};
  }
  async remove(ids:string[],indexVersion:string) {
    if(ids.length>100||ids.some(id=>typeof id!=='string'||id.length>120))throw new Error('Invalid deletion set.');
    if(this.pool){await this.init();await this.pool.query('DELETE FROM patchcraft_chunks WHERE index_version=$1 AND id=ANY($2::text[])',[indexVersion,ids]);}
    else this.memory=this.memory.filter(d=>!ids.includes(d.id));
  }
  async status() {
    if(!this.pool)return {storage:'memory',chunks:this.memory.length};
    await this.init();const result=await this.pool.query('SELECT index_version,embedding_model,count(*)::int AS chunks FROM patchcraft_chunks GROUP BY index_version,embedding_model');
    return {storage:'postgres-pgvector',indexes:result.rows};
  }
  async record(id:string,summary:unknown) {
    if(!this.pool)return;
    try {await this.init();await this.pool.query('INSERT INTO patchcraft_runs(id,summary)VALUES($1,$2) ON CONFLICT(id)DO NOTHING',[id,JSON.stringify(summary)]);await this.pool.query("DELETE FROM patchcraft_runs WHERE created_at<now()-interval '1 day'");} catch { /* Authoring remains available without the run store. */ }
  }
  async close(){await this.pool?.end();}
}
