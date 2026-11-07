import assert from 'node:assert/strict';
import {Retrieval} from '../server/retrieval.ts';
import {seedDocuments} from '../server/catalog.ts';
const rag=new Retrieval(process.env.DATABASE_URL);
const index='integration-test';
const mockEmbed=async texts=>texts.map(()=>Array.from({length:768},(_,i)=>i===0?1:0));
try {
 await rag.ingest(seedDocuments,index,'fixture-768',mockEmbed);
 await rag.ingest(seedDocuments,index,'fixture-768',mockEmbed);
 const status=await rag.status();assert.equal(status.indexes.find(i=>i.index_version===index).chunks,5);
 const result=await rag.search('motion tremolo',index,'fixture-768',mockEmbed);assert.equal(result.mode,'hybrid');assert.ok(result.evidence.length);
 const mismatch=await rag.search('motion tremolo',index,'incompatible-model',mockEmbed);assert.equal(mismatch.mode,'lexical');
 await rag.ingest(seedDocuments.slice(0,1),index,'fixture-768',mockEmbed);
 assert.equal((await rag.status()).indexes.find(i=>i.index_version===index).chunks,1);
 await rag.remove(['features/0'],index);assert.equal((await rag.status()).indexes.filter(i=>i.index_version===index).length,0);
 console.log('pgvector integration passed: retry/upsert, hybrid search, model isolation, stale deletion, explicit deletion. Fixture embeddings only.');
} finally {await rag.ingest([],index,'fixture');await rag.close();}
