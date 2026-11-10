import { registerClassicModules } from './classic-modules.ts';
import { channels } from './analysis.ts';
export type ImageParameter = { label: string; default: number | boolean; options?: string[]; min?: number; max?: number; step?: number; hidden?: boolean };
export type ImageStage = { id?: string; module: string; version: number; enabled: boolean; parameters: Record<string, number | boolean>; measurements?: string[] };
export type ImagePipelineSettings = { stages: ImageStage[] };
export type ImageState = { previous?: Float32Array; background?: Float32Array };
export type ImageModule = {
  id: string; version: number; label: string; description: string;
  parameters: Record<string, ImageParameter>;
  scalarOutputs?: string[];
  inputKind?: 'mask' | 'grayscale';
  outputKind?: 'mask' | 'grayscale';
  process(image: Uint8ClampedArray, width: number, height: number, parameters: Readonly<Record<string, number | boolean>>, state?: ImageState): Uint8ClampedArray;
};

export class ImageModuleRegistry {
  private modules = new Map<string, ImageModule>();
  register(module: ImageModule) {
    if (!/^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/.test(module.id) || !Number.isInteger(module.version) || module.version < 1 || !module.label.trim() || !module.description.trim()) throw new Error('Image modules need a stable ID, positive version, label and description.');
    if (this.modules.has(module.id)) throw new Error(`Image module '${module.id}' is already registered.`);
    this.modules.set(module.id, module); return this;
  }
  get(id: string, version: number) {
    const module = this.modules.get(id);
    if (!module) throw new Error(`Unknown image module '${id}'. Add its implementation to the compiled image registry.`);
    if (module.version !== version) throw new Error(`Image module '${id}' version ${version} is unavailable; this build provides ${module.version}.`);
    return module;
  }
  list() { return [...this.modules.values()]; }
}

export const imageModules = new ImageModuleRegistry()
  .register({ id: 'org.patchcraft.image.roi-crop', version: 1, label: 'Region crop', description: 'Selects and scales a normalized rectangular region.', parameters: {
    x: { label: 'Left', default: 0, min: 0, max: 0.8 }, y: { label: 'Top', default: 0, min: 0, max: 0.8 },
    width: { label: 'Width', default: 1, min: 0.2, max: 1 }, height: { label: 'Height', default: 1, min: 0.2, max: 1 },
  }, process: (source, w, h, p) => {
    const x = Number(p.x), y = Number(p.y), width = Number(p.width), height = Number(p.height);
    if (x + width > 1 || y + height > 1) throw new Error('Region must fit inside the frame.');
    const left = Math.floor(x * w), top = Math.floor(y * h), cropW = Math.max(1, Math.floor(width * w)), cropH = Math.max(1, Math.floor(height * h));
    const out = new Uint8ClampedArray(source.length);
    for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) {
      const sx = Math.min(w - 1, left + Math.floor(ox / w * cropW)), sy = Math.min(h - 1, top + Math.floor(oy / h * cropH));
      const from = (sy * w + sx) * 4, to = (oy * w + ox) * 4;
      out[to] = source[from]; out[to + 1] = source[from + 1]; out[to + 2] = source[from + 2]; out[to + 3] = 255;
    }
    return out;
  } })
  .register({ id: 'org.patchcraft.image.grayscale', version: 1, label: 'Grayscale', outputKind:'grayscale', description: 'Converts each color pixel to perceptual luminance. Sends a grayscale image forward. Use Measure to extract mean luminance at this point.', parameters: { enabled: { label: 'Enabled', default: true, hidden: true } }, process: (source, _w, _h, _p) => {
    const out = source.slice();
    for (let i = 0; i < out.length; i += 4) { const gray = Math.round(0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2]); out[i] = gray; out[i + 1] = gray; out[i + 2] = gray; }
    return out;
  } })
  .register({ id: 'org.patchcraft.image.tone', version: 1, label: 'Contrast and gamma', description: 'Adjusts the incoming image before the next stage. On grayscale input, the same curve is applied to luminance.', parameters: {
    contrast: { label: 'Contrast', default: 1, min: 0.25, max: 2.5 }, gamma: { label: 'Gamma', default: 1, min: 0.25, max: 2.5 },
  }, process: (source, _w, _h, p) => {
    const contrast = Number(p.contrast), gamma = Number(p.gamma), out = source.slice();
    for (let i = 0; i < out.length; i += 4) for (let c = 0; c < 3; c++) {
      const value = Math.max(0, Math.min(1, (out[i + c] / 255 - 0.5) * contrast + 0.5)); out[i + c] = Math.round(Math.pow(value, 1 / gamma) * 255);
    }
    return out;
  } })
  .register({ id: 'org.patchcraft.image.box-blur', version: 1, label: 'Box blur', description: 'Applies a bounded spatial blur to reduce pixel noise.', parameters: { radius: { label: 'Radius', default: 1, min: 0, max: 5, step: 1 } }, process: (source, w, h, p) => blur(source, w, h, Number(p.radius)) });

imageModules.register({id:'org.patchcraft.image.channel',version:1,label:'Color channel',outputKind:'grayscale',description:'Extracts one selected input channel (RGB or HSV) and turns it into a grayscale image. Unlike Grayscale, it does not combine RGB using perceptual luminance.',parameters:{channel:{label:'Channel to extract',default:0,min:0,max:6,step:1,options:['Grayscale · luminance','RGB · red','RGB · green','RGB · blue','HSV · hue','HSV · saturation','HSV · value']}},process:(source,_w,_h,p)=>{
  const out=source.slice();for(let i=0;i<out.length;i+=4){const v=channels(source[i],source[i+1],source[i+2])[Number(p.channel)];out[i]=out[i+1]=out[i+2]=Math.round(v*255);}return out;
}});
imageModules.register({id:'org.patchcraft.image.threshold',version:1,label:'Range threshold → mask',outputKind:'mask',description:'Reads the selected channel from the incoming image and outputs a black-and-white mask to the next step. This is an image output, not a measured signal; use Measure on this step to extract area or position.',parameters:{channel:{label:'Channel to threshold',default:0,min:0,max:6,step:1,options:['Luminance','Red','Green','Blue','Hue','Saturation','Value']},low:{label:'Lower bound',default:0.5,min:0,max:1},high:{label:'Upper bound',default:1,min:0,max:1},saturationMin:{label:'Minimum saturation · hue only',default:0.15,min:0,max:1},valueMin:{label:'Minimum value · hue only',default:0.1,min:0,max:1},invert:{label:'Invert mask',default:false}},process:(source,_w,_h,p)=>{
  const out=source.slice(),lo=Number(p.low),hi=Number(p.high);for(let i=0;i<out.length;i+=4){const c=channels(source[i],source[i+1],source[i+2]),v=c[Number(p.channel)];const range=lo<=hi?v>=lo&&v<=hi:v>=lo||v<=hi;const inside=range&&(Number(p.channel)!==4||(c[5]>=Number(p.saturationMin)&&c[6]>=Number(p.valueMin)));out[i]=out[i+1]=out[i+2]=(inside!==Boolean(p.invert))?255:0;}return out;
}});
imageModules.register({id:'org.patchcraft.image.brightness',version:1,label:'Brightness adjustment',description:'Apply a signed exposure offset before segmentation.',parameters:{offset:{label:'Brightness offset',default:0,min:-1,max:1}},process:(source,_w,_h,p)=>{const out=source.slice();for(let i=0;i<out.length;i+=4)for(let c=0;c<3;c++)out[i+c]+=Number(p.offset)*255;return out;}});
imageModules.register({id:'org.patchcraft.image.gaussian',version:1,label:'Gaussian blur',description:'Separable Gaussian blur reduces image noise. This is spatial filtering, not signal smoothing.',parameters:{sigma:{label:'Sigma · pixels',default:1,min:0.25,max:3,step:0.25}},process:(source,w,h,p)=>{
 const sigma=Number(p.sigma),radius=Math.ceil(sigma*3),weights=Array.from({length:radius*2+1},(_,i)=>Math.exp(-((i-radius)**2)/(2*sigma*sigma))),sum=weights.reduce((a,b)=>a+b,0);const temp=new Float32Array(source.length),out=source.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let v=0;for(let d=-radius;d<=radius;d++)v+=source[(y*w+Math.max(0,Math.min(w-1,x+d)))*4+c]*weights[d+radius];temp[(y*w+x)*4+c]=v/sum;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let v=0;for(let d=-radius;d<=radius;d++)v+=temp[(Math.max(0,Math.min(h-1,y+d))*w+x)*4+c]*weights[d+radius];out[(y*w+x)*4+c]=v/sum;}return out;
}});
function morphology(source:Uint8ClampedArray,w:number,h:number,r:number,dilate:boolean){const out=source.slice();for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=dilate?0:255;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const px=x+dx,py=y+dy,n=px<0||py<0||px>=w||py>=h?0:(source[(py*w+px)*4]>127?255:0);v=dilate?Math.max(v,n):Math.min(v,n);}const i=(y*w+x)*4;out[i]=out[i+1]=out[i+2]=v;}return out;}
imageModules.register({id:'org.patchcraft.image.morphology',version:1,label:'Mask morphology',inputKind:'mask',outputKind:'mask',description:'Erode shrinks masks; dilate expands them. Opening removes specks; closing fills small gaps. Black outside frame.',parameters:{operation:{label:'Operation',default:0,min:0,max:3,step:1,options:['Erode','Dilate','Opening · erode then dilate','Closing · dilate then erode']},radius:{label:'Radius · pixels',default:1,min:1,max:3,step:1}},process:(source,w,h,p)=>{const op=Number(p.operation),r=Number(p.radius);if(op<2)return morphology(source,w,h,r,op===1);return morphology(morphology(source,w,h,r,op===3),w,h,r,op===2);}});

for(const [id,label,ports,kind] of [
 ['rgb-stats','RGB statistics',['meanR','meanG','meanB'],undefined],
 ['gray-stats','Grayscale statistics',['mean'],'grayscale'],
 ['mask-analysis','Mask analysis',['coverage','x','y','valid','largest','largestX','largestY','blobs'],'mask'],
 ['frame-difference','Frame difference measurement',['motion'],undefined],
] as const){imageModules.register({id:`org.patchcraft.image.${id}`,version:1,label,description:'Measure the image at this exact point in the chain. Image passes through unchanged.',parameters:{},scalarOutputs:[...ports],inputKind:kind,process:image=>image});}

for(const module of imageModules.list())if(['tone','brightness','gaussian','box-blur'].some(suffix=>module.id.endsWith('.'+suffix)))module.parameters.applyChannel={label:'Apply to channel',default:0,min:0,max:3,step:1,options:['All channels','Red only','Green only','Blue only']};

registerClassicModules(imageModules);

function blur(source: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (!radius) return source;
  if (!Number.isInteger(radius)) throw new Error('Blur radius must be a whole number.');
  const horizontal = new Uint8ClampedArray(source.length), output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    let total = 0, count = 0;
    for (let dx = -radius; dx <= radius; dx++) { const px = x + dx; if (px >= 0 && px < width) { total += source[(y * width + px) * 4 + c]; count++; } }
    horizontal[(y * width + x) * 4 + c] = total / count;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    let total = 0, count = 0;
    for (let dy = -radius; dy <= radius; dy++) { const py = y + dy; if (py >= 0 && py < height) { total += horizontal[(py * width + x) * 4 + c]; count++; } }
    output[(y * width + x) * 4 + c] = total / count;
  }
  for (let i = 3; i < output.length; i += 4) output[i] = 255;
  return output;
}

export function validateImageStage(stage: ImageStage, registry = imageModules) {
  const module = registry.get(stage.module, stage.version);
  for (const key of Object.keys(stage.parameters)) if (!Object.hasOwn(module.parameters, key)) throw new Error(`Unknown parameter '${key}' for image module '${module.id}'.`);
  const parameters: Record<string, number | boolean> = {};
  for (const [key, spec] of Object.entries(module.parameters)) {
    const value = stage.parameters[key] ?? spec.default;
    if (typeof spec.default === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'number' || !Number.isFinite(value) || value < spec.min! || value > spec.max!) throw new Error(`Invalid image module parameter '${module.id}.${key}'.`);
    parameters[key] = value as number | boolean;
  }
  return { module, parameters };
}

export function processImagePipeline(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  settings: ImagePipelineSettings,
  registry = imageModules,
  onStageOutput?: (stage: ImageStage, index: number, image: Uint8ClampedArray) => void,
  states: Map<string, ImageState> = new Map(),
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 307200 || input.length !== width * height * 4) throw new Error('Invalid image frame.');
  if (!settings || !Array.isArray(settings.stages) || settings.stages.length > 16) throw new Error('Image pipeline must contain at most 16 stages.');
  let image = input; let kind: 'image' | 'grayscale' | 'mask' = 'image';
  for (const [index, stage] of settings.stages.entries()) {
    if (stage.enabled) {
      const { module, parameters } = validateImageStage(stage, registry);
      if(module.inputKind && module.inputKind!==kind)throw new Error(`${module.label} needs a ${module.inputKind} input. Add the corresponding conversion before this step.`);
      const stateKey=stage.id??String(index);if(!states.has(stateKey))states.set(stateKey,{});
      const before=image;image = module.process(image, width, height, parameters, states.get(stateKey));
      if(Number(parameters.applyChannel)>0){image=image.slice();const selected=Number(parameters.applyChannel)-1;for(let i=0;i<image.length;i+=4)for(let c=0;c<3;c++)if(c!==selected)image[i+c]=before[i+c];}
      kind = module.outputKind ?? (module.scalarOutputs||module.id.endsWith('roi-crop') ? kind : Number(parameters.applyChannel)>0?'image':kind==='mask'?'grayscale':kind);
    }
    if (!(image instanceof Uint8ClampedArray) || image.length !== width * height * 4) throw new Error(`Image module '${stage.module}' returned an invalid frame.`);
    onStageOutput?.(stage, index, image);
  }
  return image;
}
