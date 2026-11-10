import type { ImageModuleRegistry } from './pipeline';

const luma = (source: Uint8ClampedArray) => {
  const result = new Float32Array(source.length / 4);
  for (let i = 0; i < result.length; i++) result[i] = .2126 * source[i*4] + .7152 * source[i*4+1] + .0722 * source[i*4+2];
  return result;
};
const frame = (values: ArrayLike<number>) => {
  const out = new Uint8ClampedArray(values.length * 4);
  for (let i=0;i<values.length;i++) {out[i*4]=out[i*4+1]=out[i*4+2]=values[i];out[i*4+3]=255;}
  return out;
};

export function registerClassicModules(registry: ImageModuleRegistry) {
  registry.register({id:'org.patchcraft.image.sobel',version:1,label:'Sobel edges',outputKind:'grayscale',description:'Measures local brightness gradients. Flat regions become dark; edges become bright. Measure mean for texture intensity.',parameters:{gain:{label:'Edge gain',default:1,min:.25,max:4}},process:(source,w,h,p)=>{
    const gray=luma(source),out=new Float32Array(w*h);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x,gx=-gray[i-w-1]+gray[i-w+1]-2*gray[i-1]+2*gray[i+1]-gray[i+w-1]+gray[i+w+1];
      const gy=-gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1];
      out[i]=Math.hypot(gx,gy)/4*Number(p.gain);
    }return frame(out);
  }});
  registry.register({id:'org.patchcraft.image.adaptive-threshold',version:1,label:'Adaptive threshold',outputKind:'mask',description:'Compares each pixel with its local mean. Useful under uneven lighting; this selects local detail, rather than a fixed global brightness.',parameters:{radius:{label:'Neighborhood radius · pixels',default:5,min:1,max:15,step:1},offset:{label:'Offset · 0–1',default:.04,min:-.25,max:.25},invert:{label:'Invert mask',default:false}},process:(source,w,h,p)=>{
    const gray=luma(source),integral=new Float64Array((w+1)*(h+1)),out=new Uint8Array(w*h),r=Number(p.radius);
    for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=gray[y*w+x];integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+row;}}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const x0=Math.max(0,x-r),x1=Math.min(w,x+r+1),y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);
      const mean=(integral[y1*(w+1)+x1]-integral[y0*(w+1)+x1]-integral[y1*(w+1)+x0]+integral[y0*(w+1)+x0])/((x1-x0)*(y1-y0));
      out[y*w+x]=((gray[y*w+x]>mean-Number(p.offset)*255)!==Boolean(p.invert))?255:0;
    }return frame(out);
  }});
  registry.register({id:'org.patchcraft.image.otsu',version:1,label:'Otsu threshold',outputKind:'mask',description:'Chooses a global threshold by separating the luminance histogram into two classes. Best for scenes with distinct dark and bright regions.',parameters:{invert:{label:'Invert mask',default:false}},process:(source,_w,_h,p)=>{
    const gray=luma(source),hist=new Uint32Array(256);let total=0;
    for(const value of gray){const bin=Math.round(value);hist[bin]++;total+=bin;}
    let weight=0,sum=0,best=-1,threshold=0;
    for(let t=0;t<256;t++){weight+=hist[t];sum+=t*hist[t];if(!weight||weight===gray.length)continue;const other=gray.length-weight,delta=sum/weight-(total-sum)/other,score=weight*other*delta*delta;if(score>best){best=score;threshold=t;}}
    return frame(Array.from(gray,v=>((v>threshold)!==Boolean(p.invert))?255:0));
  }});
  registry.register({id:'org.patchcraft.image.median',version:1,label:'Median denoise',description:'Removes isolated bright/dark specks using a 3×3 median per channel, preserving sharp boundaries better than averaging.',parameters:{},process:(source,w,h)=>{
    const out=source.slice();for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){const values:number[]=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)values.push(source[(Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx)))*4+c]);values.sort((a,b)=>a-b);out[(y*w+x)*4+c]=values[4];}return out;
  }});
  registry.register({id:'org.patchcraft.image.mask-invert',version:1,label:'Invert mask',inputKind:'mask',outputKind:'mask',description:'Swaps selected and unselected mask pixels. Measure the complementary area or its centroid.',parameters:{},process:source=>{const out=source.slice();for(let i=0;i<out.length;i+=4)out[i]=out[i+1]=out[i+2]=255-out[i];return out;}});
  for(const background of [false,true])registry.register({id:`org.patchcraft.image.${background?'background-subtract':'motion-mask'}`,version:1,label:background?'Adaptive background subtraction':'Frame-change mask',outputKind:'mask',description:background?'Compares each frame with a slowly adapting background. Keep the camera fixed; lighting changes also affect this mask. Source/settings changes reset the background.':'Highlights pixels whose luminance changed since the previous analyzed frame. Keep the camera fixed. Motion, lighting changes and camera movement can all activate pixels.',parameters:{threshold:{label:'Change threshold · 0–1',default:.08,min:.01,max:.5},...(background?{learningRate:{label:'Background adaptation',default:.02,min:.001,max:.2}}:{})},process:(source,_w,_h,p,state)=>{
    const gray=luma(source),out=new Uint8Array(gray.length);if(!state)throw new Error('Temporal module requires a pipeline session.');
    const previous=background?state.background:state.previous;
    if(previous&&previous.length===gray.length)for(let i=0;i<gray.length;i++)out[i]=Math.abs(gray[i]-previous[i])>Number(p.threshold)*255?255:0;
    if(background){if(!state.background||state.background.length!==gray.length)state.background=gray.slice();else for(let i=0;i<gray.length;i++)state.background[i]+=(gray[i]-state.background[i])*Number(p.learningRate);}else state.previous=gray;
    return frame(out);
  }});
}
