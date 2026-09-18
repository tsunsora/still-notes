const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'still-folders-')),root=path.join(temp,'Notes'),data=path.join(temp,'profile');
 await fs.mkdir(path.join(root,'Folder','Nested'),{recursive:true});await fs.mkdir(path.join(root,'Empty.md'));await fs.mkdir(data);
 await fs.writeFile(path.join(root,'Test.md'),'Folder behavior');
 await fs.writeFile(path.join(root,'Folder','Child.md'),'child');await fs.writeFile(path.join(root,'Folder','Nested','Deep.md'),'deep');
 const key=crypto.createHash('sha256').update((await fs.realpath(root)).toLowerCase()).digest('hex');
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root,last:'Test.md',workspaces:{[key]:{icons:[['Folder','heart'],['Test.md','star']],orders:[]}}}));
 const env={...process.env,STILL_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.STILL_EXE||(process.argv.includes('--packaged')?path.resolve(__dirname,'../../Still-Windows/Still-win32-x64/Still.exe'):null);
 const app=await electron.launch(executablePath?{executablePath,env}:{args:[path.resolve(__dirname,'..')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='Test');
  await page.emulateMedia({reducedMotion:'no-preference'});
  const row=page.locator('.tree-row[data-path="Folder"]'),button=row.locator('.tree-open'),group=row.locator('xpath=following-sibling::*[1]');
  const opacity=selector=>row.locator(selector).evaluate(el=>getComputedStyle(el).opacity);
  assert.equal(await row.locator('.folder-glyph').count(),1,'Legacy custom folder icons must use the stateful glyph');
  assert.equal(await row.evaluate(el=>el.classList.contains('custom-icon')),false);
  assert.equal(await opacity('.folder-closed-icon'),'1');assert.equal(await opacity('.folder-open-icon'),'0');
  const closed=await row.locator('.folder-closed-icon').innerHTML(),open=await row.locator('.folder-open-icon').innerHTML();
  assert.notEqual(closed,open,'Open and closed silhouettes must differ');
  if(process.env.STILL_SCREENSHOTS)await page.screenshot({path:path.join(process.env.STILL_SCREENSHOTS,'still-folders-closed.png')});
  await row.click({button:'right'});assert.equal(await page.getByRole('menuitem',{name:'Change icon…'}).count(),0);await page.keyboard.press('Escape');
  for(const rel of ['Folder','Empty.md']){
   const result=await page.evaluate(rel=>window.still['set-icon'](rel,'work'),rel);
   assert.equal(result.ok,false);assert.match(result.error,/Only note icons/);
  }
  await button.click();assert.equal(await button.getAttribute('aria-expanded'),'true');await page.waitForTimeout(300);
  const full=(await group.boundingBox()).height;assert(full>50);assert.equal(await opacity('.folder-open-icon'),'1');assert.equal(await opacity('.folder-closed-icon'),'0');
  if(process.env.STILL_SCREENSHOTS)await page.screenshot({path:path.join(process.env.STILL_SCREENSHOTS,'still-folders-open.png')});
  await button.click();await page.waitForTimeout(65);const middle=(await group.boundingBox()).height;assert(middle>0&&middle<full,'Closing should animate instead of snapping');
  assert.equal(await group.evaluate(el=>el.inert),true);
  await button.click();await page.waitForTimeout(300);assert.equal(Math.round((await group.boundingBox()).height),Math.round(full));assert.equal(await group.evaluate(el=>el.inert),false);
  await button.click();await page.waitForTimeout(300);assert.equal((await group.boundingBox()).height,0);assert.equal(await opacity('.folder-closed-icon'),'1');
  await button.click();await page.waitForTimeout(65);const opening=(await group.boundingBox()).height;assert(opening>0&&opening<full,'Opening should animate instead of snapping');await page.waitForTimeout(300);
  await page.getByRole('button',{name:'Nested',exact:true}).click();await page.waitForTimeout(300);await page.getByRole('button',{name:'Deep',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Deep');
  assert.equal(await opacity('.folder-open-icon'),'1','Re-rendering must preserve the open icon');
  await page.locator('.tree-row[data-path="Test.md"]').click({button:'right'});await page.getByRole('menuitem',{name:'Change icon…'}).click();
  await page.locator('#icon-grid').getByRole('button',{name:'Idea',exact:true}).click();
  const snapshot=await page.evaluate(()=>window.still.init());assert.equal(snapshot.value.icons['Test.md'],'idea');
  await page.emulateMedia({reducedMotion:'reduce'});await button.click();assert.equal((await group.boundingBox()).height,0);assert.equal(await opacity('.folder-closed-icon'),'1');assert.equal(await group.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  const empty=page.locator('.tree-row[data-path="Empty.md"]');await empty.locator('.tree-open').click();assert.equal(await empty.locator('.folder-open-icon').evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.deepEqual(errors,[]);
  console.log('PASS: distinct folder icons, legacy override ignored, note-only customization in UI/IPC, animated reversible disclosure, nested navigation, empty folders, reduced motion.');
 }finally{await app.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
