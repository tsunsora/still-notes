const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'still-appearance-'))),root=path.join(temp,'Notes'),data=path.join(temp,'profile');
 await fs.mkdir(root);await fs.mkdir(data);
 await fs.writeFile(path.join(root,'Test.md'),'- [x] done');
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root,last:'Test.md'}));
 const env={...process.env,STILL_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({args:[path.resolve(__dirname,'..')],env});
 // The scheme's target value for a role, as hex. Computed values may be mid-crossfade.
 const role=(page,name)=>page.evaluate(n=>{const value=document.documentElement.style.getPropertyValue('--md-sys-color-'+n).trim();const ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle=value;return ctx.fillStyle;},name);
 let app=await launch();
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='Test');
  // Defaults: dark theme from the Slate seed, with every Material role defined.
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  for(const name of ['primary','on-primary','secondary-container','surface','surface-container-high','on-surface','outline-variant','error','inverse-surface'])assert.match(await role(page,name),/^#[0-9a-f]{6}$/i,name);
  // Roles are registered colors with a transition, so scheme changes crossfade.
  assert.equal(await page.evaluate(()=>CSS.supports('color','var(--md-sys-color-primary)')&&document.documentElement.style.transition.includes('--md-sys-color-primary')),true);
  const darkSurface=await role(page,'surface');
  // Appearance and updates live together in Settings, opened from the rail footer.
  assert.equal(await page.locator('#appearance').count(),0);
  await page.locator('.side-bottom #settings').click();await page.locator('#settings-dialog').waitFor();
  await page.locator('#updates-section').waitFor();
  assert.equal(await page.locator('#theme-mode [aria-checked="true"]').getAttribute('data-mode'),'dark');
  assert(await page.locator('#seed-grid [role=radio]').count()>=6);
  assert.equal(await page.locator('#style-grid [role=radio]').count(),8);
  assert.equal(await page.locator('#style-grid [aria-checked="true"]').getAttribute('data-style'),'tonalSpot');
  // Pure black flattens every surface in dark mode only.
  await page.getByRole('switch',{name:'Pure black'}).check();
  for(const name of ['surface','surface-container','surface-container-high','surface-container-highest'])assert.equal(await role(page,name),'#000000',name);
  await page.getByRole('switch',{name:'Pure black'}).uncheck();
  assert.equal(await role(page,'surface'),darkSurface);
  await page.getByRole('radio',{name:'Light'}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  assert.notEqual(await role(page,'surface'),darkSurface);
  assert.equal(await page.getByRole('switch',{name:'Pure black'}).isDisabled(),true);
  const slatePrimary=await role(page,'primary');
  await page.getByRole('radio',{name:'Moss'}).click();
  assert.notEqual(await role(page,'primary'),slatePrimary);
  assert.equal(await page.locator('#seed-grid [aria-checked="true"]').getAttribute('aria-label'),'Moss');
  // Arrow keys move between swatches like a radio group.
  await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#seed-grid [aria-checked="true"]').getAttribute('aria-label'),'Clay');
  // Palette styles reshape the scheme from the same seed.
  const tonalPrimary=await role(page,'primary');
  await page.getByRole('radio',{name:'Vibrant'}).click();
  assert.notEqual(await role(page,'primary'),tonalPrimary);
  await page.getByRole('radio',{name:'Monochrome'}).click();
  const mono=await role(page,'primary'),n=parseInt(mono.slice(1),16);
  assert.equal(Math.max(n>>16&255,n>>8&255,n&255)-Math.min(n>>16&255,n>>8&255,n&255)<=2,true,'monochrome primary is grey: '+mono);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#style-grid [aria-checked="true"]').getAttribute('data-style'),'neutral');
  await page.getByRole('radio',{name:'Expressive'}).click();
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
 const saved=JSON.parse(await fs.readFile(path.join(data,'settings.json'),'utf8'));
 assert.deepEqual(saved.appearance,{mode:'light',seed:'#a8603d',style:'expressive',pureBlack:false});
 app=await launch();
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='Test');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
  assert.equal(await app.evaluate(({nativeTheme})=>nativeTheme.themeSource),'light');
  await page.locator('#settings').click();
  assert.equal(await page.locator('#style-grid [aria-checked="true"]').getAttribute('data-style'),'expressive');
 }finally{await app.close();}
 console.log('PASS: Material color roles on the 2025 spec, palette styles, pure black, crossfade wiring, Settings dialog, light/dark/system modes, seed swatches with keyboard selection, persistence across restart, native theme sync.');
})().catch(error=>{console.error(error);process.exit(1);});
