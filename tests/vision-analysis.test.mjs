import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, channels } from '../src/vision/analysis.ts';
import { processImagePipeline } from '../src/vision/pipeline.ts';
const stage=(module,parameters)=>({module:'org.patchcraft.image.'+module,version:1,enabled:true,parameters});
test('HSV hue wraps at red and binary segmentation exposes valid normalized coordinates',()=>{
 assert.equal(channels(255,0,0)[4],0);
 const image=new Uint8ClampedArray([0,0,0,255,255,255,255,255,0,0,0,255,0,0,0,255]);
 const result=analyze(image,2,2,{mask:true});assert.equal(result.values.coverage,.25);assert.equal(result.values.x,1);assert.equal(result.values.y,0);assert.equal(result.values.blobs,1);
 const empty=analyze(new Uint8ClampedArray(16),2,2,{mask:true});assert.equal(empty.values.valid,0);assert.equal(empty.values.x,0);
});
test('threshold produces a binary mask and dilation expands a single foreground pixel',()=>{
 const image=new Uint8ClampedArray(3*3*4);image[16]=image[17]=image[18]=255;
 const mask=processImagePipeline(image,3,3,{stages:[stage('threshold',{channel:0,low:.5,high:1,invert:false})]});
 assert.equal(analyze(mask,3,3,{mask:true}).values.coverage,1/9);
 const expanded=processImagePipeline(image,3,3,{stages:[stage('threshold',{channel:0,low:.5,high:1,invert:false}),stage('morphology',{operation:1,radius:1})]});assert.equal(analyze(expanded,3,3,{mask:true}).values.coverage,1);
});
test('measurement ports belong to explicit modules and mask analysis rejects color images', async()=>{
 const {imageModules}=await import('../src/vision/pipeline.ts');
 assert.equal(imageModules.get('org.patchcraft.image.box-blur',1).scalarOutputs,undefined);
 assert.deepEqual(imageModules.get('org.patchcraft.image.rgb-stats',1).scalarOutputs,['meanR','meanG','meanB']);
 const red=new Uint8ClampedArray([255,0,0,255]);
 const values=analyze(red,1,1).values;assert.equal(values.meanR,1);assert.equal(values.meanG,0);assert.equal(values.meanB,0);
 assert.throws(()=>processImagePipeline(red,1,1,{stages:[stage('mask-analysis',{})]}),/needs a mask/);
 const mask=processImagePipeline(red,1,1,{stages:[stage('threshold',{channel:1,low:.5,high:1,invert:false}),stage('mask-analysis',{})]});assert.equal(mask[0],255);
});

test('largest-region bounds and centroid select the same connected shape and clear on empty masks', () => {
  const image=new Uint8ClampedArray(6*4*4);
  for(let i=3;i<image.length;i+=4)image[i]=255;
  for(const [x,y] of [[1,1],[2,1],[1,2],[2,2],[5,0]]){const i=(y*6+x)*4;image[i]=image[i+1]=image[i+2]=255;}
  const result=analyze(image,6,4,{mask:true});
  assert.deepEqual(result.largestBounds,{left:1,top:1,right:2,bottom:2});
  assert.equal(result.values.largestX,1.5/5);assert.equal(result.values.largestY,1.5/3);
  const empty=analyze(new Uint8ClampedArray(6*4*4),6,4,{mask:true});assert.equal(empty.largestBounds,null);assert.equal(empty.values.valid,0);assert.equal(empty.values.positionValid,false);
  const colorStats=analyze(image,6,4);assert.equal(colorStats.values.blobs,0);assert.equal(colorStats.values.positionValid,false);
});
