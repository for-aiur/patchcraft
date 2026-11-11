import { analyze, channels } from './analysis';
import { extractFeatures, type TargetColor } from './features';
import { imageModules, processImagePipeline, type ImageState, type ImagePipelineSettings } from './pipeline';
const workerScope = self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void };

let previous: Uint8ClampedArray | undefined;
let signature = '';
const states=new Map<string,ImageState>();
let previousStages: Uint8ClampedArray[]=[];
self.onmessage = event => {
  const { pixels, width, height, settings, target, tolerance, key, capturedAt, generation } = event.data as {
    pixels: Uint8ClampedArray; width: number; height: number; settings: ImagePipelineSettings;
    target: TargetColor; tolerance: number; key: string; capturedAt: number; generation: number;
  };
  const started = performance.now();
  try {
    const frameKey=`${key}:${width}x${height}`;
    if (signature !== frameKey) {previous = undefined;previousStages=[];states.clear();}
    const stageOutputs: Array<{ index: number; pixels: Uint8ClampedArray; analysis: ReturnType<typeof analyze> }> = [];
    let stageInput=pixels;
    const processed = processImagePipeline(pixels, width, height, settings, undefined, (_stage, index, image) => {
      const currentStage=settings.stages[index],module=currentStage&&imageModules.get(currentStage.module,currentStage.version);const isMask=Boolean(currentStage?.enabled&&(module?.outputKind==='mask'||module?.inputKind==='mask'));const analysis=analyze(image,width,height,{mask:isMask}),before=previousStages[index];let difference=0;if(before)for(let i=0;i<image.length;i+=4)difference+=(Math.abs(image[i]-before[i])+Math.abs(image[i+1]-before[i+1])+Math.abs(image[i+2]-before[i+2]))/(3*255);analysis.values.motion=before?difference/(width*height):0;previousStages[index]=image.slice();if(_stage.module==='org.patchcraft.image.threshold'){analysis.histogram.fill(0);for(let i=0;i<stageInput.length;i+=4){const value=channels(stageInput[i],stageInput[i+1],stageInput[i+2])[Number(_stage.parameters.channel??0)];analysis.histogram[Math.min(31,Math.floor(value*32))]++;}}stageInput=image;stageOutputs.push({ index, pixels: image.slice(), analysis });
    }, states);
    const features = extractFeatures(processed, previous, width, target, tolerance);
    previous = processed.slice(); signature = frameKey;
    workerScope.postMessage({ processed, stageOutputs, features, processingMs: performance.now() - started, capturedAt, generation }, [processed.buffer, ...stageOutputs.map(output => output.pixels.buffer)]);
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : String(error), capturedAt, generation });
  }
};
