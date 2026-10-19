import {test,expect} from '@playwright/test';
test('opens without paid requests and can stop a running scan',async({page})=>{
 await page.addInitScript(()=>{
  let calls=0;let current:unknown=null;
  Object.defineProperty(globalThis,'scanCalls',{get:()=>calls});
  Object.defineProperty(globalThis,'chrome',{value:{runtime:{id:'test-extension',sendMessage:async(message:{type:string})=>{
   if(message.type==='SCAN'){calls++;current={id:'1cb52cca-b730-4bb8-b72e-09bd6f606f54',username:'solbuilder',status:'running',stage:'Inspecting audience',processed:0,pages:0,result:null,reason:null};return {data:{id:'1cb52cca-b730-4bb8-b72e-09bd6f606f54'}};}
   if(message.type==='CANCEL_SCAN')current={...(current as object),status:'cancelled',stage:'Stopped by you',reason:'user_cancelled'};
   return {data:current};
  }}}});
 });
 await page.goto('http://127.0.0.1:5173/solbuilder');await page.getByRole('button',{name:'Scan @solbuilder'}).click();
 await expect(page.getByRole('button',{name:'Start Quick Scan',exact:true})).toBeVisible();expect(await page.evaluate(()=>(globalThis as unknown as {scanCalls:number}).scanCalls)).toBe(0);
 await page.getByRole('button',{name:'Start Quick Scan',exact:true}).click();await page.getByRole('button',{name:'Stop scan',exact:true}).click();
 await expect(page.getByText('Stopped',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Stop scan',exact:true})).toHaveCount(0);
});
test('isolates the injected panel and handles missing installation',async({page})=>{await page.goto('http://127.0.0.1:5173/solbuilder');await page.getByRole('button',{name:'Scan @solbuilder'}).click();await expect(page.getByRole('complementary',{name:'X Nuke analysis'})).toBeVisible();await expect(page.getByRole('alert')).toContainText('Install the extension');await page.getByRole('button',{name:'Close panel'}).click();await expect(page.getByRole('button',{name:'Scan @solbuilder'})).toBeVisible();await page.goto('http://127.0.0.1:5173/home');await expect(page.getByRole('button',{name:'Scan @home'})).toHaveCount(0);});
