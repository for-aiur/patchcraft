import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('guided rig mapping, setup CC, controller Learn, program encoding and safe restore', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const messages: number[][] = [];
    const controller = new EventTarget() as EventTarget & {id:string;name:string;state:string};
    Object.assign(controller,{id:'controller',name:'Test controller',state:'connected',open:async()=>{access.onstatechange?.()}});
    const output = {id:'pedal',name:'Test pedal',state:'connected',open:async()=>{access.onstatechange?.()},send:(bytes:number[])=>messages.push(bytes),clear:()=>{}};
    const access = {outputs:new Map([[output.id,output]]),inputs:new Map([[controller.id,controller]]),onstatechange:null as null|(()=>void)};
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access});
    Object.defineProperty(window,'rigMessages',{value:messages});
    window.addEventListener('controller-test-cc',()=>{
      const event=new Event('midimessage'); Object.defineProperty(event,'data',{value:new Uint8Array([0xb2,21,100])}); controller.dispatchEvent(event);
    });
    window.addEventListener('rig-disconnect',()=>{output.state='disconnected';access.onstatechange?.()});
  });
  await page.goto('/vision');
  await page.getByRole('button',{name:'Enable MIDI & find outputs'}).click();
  await page.getByRole('button',{name:'Add mapping',exact:true}).click();
  await page.locator('#rig-output').selectOption('pedal');
  await page.getByRole('button',{name:'Confirm selected output',exact:true}).click();
  await expect(page.locator('#rig-status')).toContainText('Output confirmed');
  await page.getByText('Guided DAW mapping & controller MIDI Learn',{exact:true}).click();
  await page.getByRole('button',{name:'Send selected setup message',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {rigMessages:number[][]}).rigMessages)).toEqual([[0xb0,74,0]]);
  await expect(page.locator('#rig-state')).toHaveText('DISARMED');
  await page.locator('#rig-input').selectOption('controller');
  await page.getByRole('button',{name:'Learn next controller CC',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('controller-test-cc')));
  await expect(page.locator('#rig-channel')).toHaveValue('3');
  await expect(page.locator('#rig-cc')).toHaveValue('21');
  await expect(page.locator('#rig-learn-status')).toContainText('Learned channel 3');
  await page.getByRole('button',{name:'Apply mapping changes',exact:true}).click();
  await page.locator('#rig-type').selectOption('program');
  await page.locator('#rig-program').fill('128');
  await page.getByRole('button',{name:'Apply mapping changes',exact:true}).click();
  await page.locator('#rig-output').selectOption('pedal');
  await page.getByRole('button',{name:'Confirm selected output',exact:true}).click();
  await page.getByRole('button',{name:'Send selected setup message',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {rigMessages:number[][]}).rigMessages.at(-1))).toEqual([0xc2,127]);
  await page.locator('#rig-panel').screenshot({path:test.info().outputPath('m3-rig.png')});
  await page.getByText('Save or restore a rig profile',{exact:true}).click();
  await page.getByRole('button',{name:'Save rig locally',exact:true}).click();
  await page.getByRole('button',{name:'Load local rig',exact:true}).click();
  await expect(page.locator('#rig-output')).toHaveValue('');
  await expect(page.locator('#rig-state')).toHaveText('DISARMED');
  await page.getByRole('button',{name:'Arm selected mapping',exact:true}).click();
  await expect(page.locator('#rig-status')).toContainText('Confirm this output first');
  await page.getByText("Erdem's rig acceptance & compatibility report",{exact:true}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export M3 rig report',exact:true}).click();
  const report=JSON.parse(await readFile((await (await downloadPromise).path())!,'utf8'));
  expect(report.run.outcomes['camera-to-daw']).toBe('not-run');
  expect(report.physicalVisualToEffectLatencyMs).toBeNull();
  expect(report.outputs[0].armed).toBe(false);
  expect(errors).toEqual([]);
});

test('live reusable CC mapping stops on device loss without automatic rearm', async ({ browser }) => {
  const context=await browser.newContext({permissions:['camera']});
  const page=await context.newPage();
  await page.addInitScript(()=>{
    const messages:number[][]=[];
    const output={id:'daw',name:'Test DAW',state:'connected',open:async()=>{},send:(bytes:number[])=>messages.push(bytes),clear:()=>{}};
    const access={outputs:new Map([['daw',output]]),inputs:new Map(),onstatechange:null as null|(()=>void)};
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access});
    Object.defineProperty(window,'rigMessages',{value:messages});
    window.addEventListener('rig-disconnect',()=>{output.state='disconnected';access.onstatechange?.()});
    window.addEventListener('rig-reconnect',()=>{output.state='connected';access.onstatechange?.()});
  });
  await page.goto('/vision');
  await page.getByRole('button',{name:'Start camera',exact:true}).click();
  await expect(page.locator('#camera-state')).toHaveText('LIVE');
  await page.getByRole('button',{name:'Enable MIDI & find outputs'}).click();
  await page.getByRole('button',{name:'Add mapping',exact:true}).click();
  await page.locator('#rig-output').selectOption('daw');
  await page.getByRole('button',{name:'Confirm selected output',exact:true}).click();
  await page.getByRole('button',{name:'Arm selected mapping',exact:true}).click();
  await expect(page.locator('#rig-state')).toHaveText('ARMED');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {rigMessages:number[][]}).rigMessages.length)).toBeGreaterThan(0);
  await page.evaluate(()=>window.dispatchEvent(new Event('rig-disconnect')));
  await expect(page.locator('#rig-state')).toHaveText('DISARMED');
  await page.evaluate(()=>window.dispatchEvent(new Event('rig-reconnect')));
  await expect(page.locator('#rig-state')).toHaveText('DISARMED');
  await expect(page.locator('#rig-output')).toHaveValue('');
  await context.close();
});

test('camera analysis stays fresh when compositor callbacks are unavailable', async ({ browser }) => {
  const context=await browser.newContext({permissions:['camera']});
  const page=await context.newPage();
  await page.addInitScript(()=>{
    HTMLVideoElement.prototype.requestVideoFrameCallback=()=>0;
    HTMLVideoElement.prototype.cancelVideoFrameCallback=()=>{};
  });
  await page.goto('/vision');
  await page.getByRole('button',{name:'Start camera',exact:true}).click();
  await expect(page.locator('#camera-state')).toHaveText('LIVE');
  await expect.poll(async()=>{
    const text=await page.locator('#diagnostics').textContent();
    return Number(text?.match(/(\d+) processed frames/)?.[1] ?? 0);
  }).toBeGreaterThan(20);
  await expect(page.locator('#camera-state')).toHaveText('LIVE');
  await page.locator('#video').evaluate((video:HTMLVideoElement)=>video.pause());
  await expect(page.locator('#camera-state')).toHaveText('OFF');
  await context.close();
});
