/** Normalized pixel channels. Hue uses [0,1), wrapping at red. */
export function channels(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
  let hue = d === 0 ? 0 : max === r ? ((g-b)/d)%6 : max === g ? (b-r)/d+2 : (r-g)/d+4;
  hue = (hue/6+1)%1;
  return [0.2126*r+0.7152*g+0.0722*b,r,g,b,hue,max === 0 ? 0 : d/max,max];
}
export function analyze(image: Uint8ClampedArray, width: number, height: number, options: { mask?: boolean } = {}) {
  const histogram = Array<number>(32).fill(0);
  let mean=0, meanR=0,meanG=0,meanB=0,count=0, x=0, y=0;
  for(let i=0;i<width*height;i++) {
    const v=channels(image[i*4],image[i*4+1],image[i*4+2])[0];
    mean+=v;meanR+=image[i*4]/255;meanG+=image[i*4+1]/255;meanB+=image[i*4+2]/255; histogram[Math.min(31,Math.floor(v*32))]++;
    if(options.mask && image[i*4] > 127){count++;x+=i%width;y+=Math.floor(i/width);}
  }
  const visited=options.mask ? new Uint8Array(width*height) : new Uint8Array(0); let blobs=0,largest=0,lx=0,ly=0;
  let largestBounds: { left: number; top: number; right: number; bottom: number } | null = null;
  const queue=options.mask ? new Int32Array(width*height) : new Int32Array(0);
  for(let start=0;start<visited.length;start++) {
    if(visited[start] || image[start*4]<=127)continue;
    let left=width,top=height,right=0,bottom=0;
    let head=0,tail=1,n=0,sx=0,sy=0;queue[0]=start;visited[start]=1;blobs++;
    while(head<tail){const p=queue[head++],px=p%width,py=Math.floor(p/width);n++;sx+=px;sy+=py;left=Math.min(left,px);top=Math.min(top,py);right=Math.max(right,px);bottom=Math.max(bottom,py);
      for(const q of [px>0?p-1:-1,px<width-1?p+1:-1,py>0?p-width:-1,py<height-1?p+width:-1])
        if(q>=0&&!visited[q]&&image[q*4]>127){visited[q]=1;queue[tail++]=q;}
    }
    if(n>largest){largest=n;lx=sx/n;ly=sy/n;largestBounds={left,top,right,bottom};}
  }
  return { histogram, largestBounds, values:{meanR:meanR/(width*height),meanG:meanG/(width*height),meanB:meanB/(width*height),motion:0,mean:mean/(width*height),coverage:count/(width*height),x:count?x/count/Math.max(1,width-1):0,y:count?y/count/Math.max(1,height-1):0,valid:options.mask&&count?1:0,positionValid:Boolean(options.mask&&count>0),largestValid:largest>0,largest:largest/(width*height),largestX:largest?lx/Math.max(1,width-1):0,largestY:largest?ly/Math.max(1,height-1):0,blobs} };
}
