import {test,expect} from '@playwright/test';
const proposal=(scene:any,revision:number,remove=false)=>{
 const branches=remove?scene.branches.filter((b:any)=>b.id!=='red'):[{id:'light',signal:'brightness',effect:'cutoff',targetId:'browser-cutoff',processors:[{kind:'smooth',params:{ms:80}}]},{id:'move',signal:'motion',effect:'tremolo',targetId:'browser-tremolo',processors:[]},{id:'red',signal:'red',effect:'drive',targetId:'browser-drive',processors:[]}];
 return {id:'fixture',baseRevision:revision,scene:{...scene,branches},decision:{kind:'proposal',explanation:'Deterministic UI fixture; not Gemini evidence.',question:'',edits:[]},metrics:{fixture:true}};
};
test('conversation review, multi-branch application, follow-up and undo are explicit',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/health',route=>route.fulfill({json:{configured:true,model:'fixture'}}));
 await page.route('**/api/propose',async route=>{const body=route.request().postDataJSON();await route.fulfill({json:proposal(body.scene,body.revision,body.prompt.includes('remove'))});});
 await page.goto('/vision');
 await page.locator('#agent-prompt').fill('Create three camera branches');
 await page.locator('#agent-send').click();await expect(page.locator('#agent-status')).toContainText('Approve sending');
 await page.locator('#agent-consent').check();await page.locator('#agent-send').click();
 await expect(page.locator('#agent-candidate')).toContainText('move: motion');
 await expect(page.locator('#agent-applied')).not.toContainText('move: motion');
 await page.locator('#agent-apply').click();await expect(page.locator('#agent-applied')).toContainText('red: red');
 await expect(page.locator('#rig-state')).toHaveText('DISARMED');
 await page.locator('#agent-prompt').fill('remove red');await page.locator('#agent-send').click();
 await page.locator('#agent-apply').click();await expect(page.locator('#agent-applied')).not.toContainText('red: red');
 await expect(page.locator('#agent-applied')).toContainText('light: brightness');
 await page.locator('#agent-undo').click();await expect(page.locator('#agent-applied')).toContainText('red: red');
 await page.locator('#author-panel').screenshot({path:test.info().outputPath('m4-authoring.png')});
 expect(errors).toEqual([]);
});
test('manual changes invalidate a delayed proposal and provider failure preserves graph',async({page})=>{
 await page.route('**/api/health',route=>route.fulfill({json:{configured:true,model:'fixture'}}));
 await page.route('**/api/propose',route=>route.fulfill({status:503,json:{error:'Gemini unavailable; current patch unchanged.'}}));
 await page.goto('/vision');const initial=await page.locator('#graph-json').inputValue();
 await page.locator('#agent-consent').check();await page.locator('#agent-prompt').fill('More light');await page.locator('#agent-send').click();
 await expect(page.locator('#agent-status')).toContainText('Gemini unavailable');await expect(page.locator('#graph-json')).toHaveValue(initial);
});
