const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'still-appearance-'))),root=path.join(temp,'Notes'),data=path.join(temp,'profile');
 await fs.mkdir(root);await fs.mkdir(data);
 await fs.writeFile(path.join(root,'Test.md'),'- [x] done');
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root,last:'Test.md'}));
 const env={...process.env,STILL_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({args:[path.resolve(__dirname,'..')],env});
 const role=(page,name)=>page.evaluate(n=>getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-'+n).trim(),name);
 let app=await launch();
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='Test');
  // Defaults: dark theme from the Slate seed, with every Material role defined.
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  for(const name of ['primary','on-primary','secondary-container','surface','surface-container-high','on-surface','outline-variant','error','inverse-surface'])assert.match(await role(page,name),/^#[0-9a-f]{6}$/i,name);
  const darkSurface=await role(page,'surface');
  await page.locator('#appearance').click();await page.locator('#appearance-dialog').waitFor();
  assert.equal(await page.locator('#theme-mode [aria-checked="true"]').getAttribute('data-mode'),'dark');
  assert(await page.locator('#seed-grid [role=radio]').count()>=6);
  await page.getByRole('radio',{name:'Light'}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  assert.notEqual(await role(page,'surface'),darkSurface);
  const slatePrimary=await role(page,'primary');
  await page.getByRole('radio',{name:'Moss'}).click();
  assert.notEqual(await role(page,'primary'),slatePrimary);
  assert.equal(await page.locator('#seed-grid [aria-checked="true"]').getAttribute('aria-label'),'Moss');
  // Arrow keys move between swatches like a radio group.
  await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#seed-grid [aria-checked="true"]').getAttribute('aria-label'),'Clay');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
 const saved=JSON.parse(await fs.readFile(path.join(data,'settings.json'),'utf8'));
 assert.deepEqual(saved.appearance,{mode:'light',seed:'#a8603d'});
 app=await launch();
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='Test');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
  assert.equal(await app.evaluate(({nativeTheme})=>nativeTheme.themeSource),'light');
 }finally{await app.close();}
 console.log('PASS: Material color roles, light/dark/system modes, seed swatches with keyboard selection, persistence across restart, native theme sync.');
})().catch(error=>{console.error(error);process.exit(1);});
