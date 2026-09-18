const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'still-repositories-')),data=path.join(temp,'profile'),a=path.join(temp,'Alpha'),b=path.join(temp,'Beta'),defaultNotes=path.join(temp,'Default');
 for(const p of [data,a,b])await fs.mkdir(p);
 await fs.writeFile(path.join(a,'First.md'),'alpha');await fs.writeFile(path.join(a,'Second.md'),'second');await fs.writeFile(path.join(b,'Other.md'),'beta');
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root:a,last:'Second.md'}));
 const env={...process.env,STILL_TEST_DATA:data,STILL_TEST_NOTES:defaultNotes};delete env.ELECTRON_RUN_AS_NODE;
 const options=process.env.STILL_EXE?{executablePath:process.env.STILL_EXE,env}:{args:[path.resolve(__dirname,'..')],env};
 let app=await electron.launch(options);
 try{
  let page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Second');
  await page.locator('#editor').fill('saved before switching');await page.locator('#open-folder').click();await page.locator('.repository-option').filter({hasText:'Alpha'}).waitFor();
  await app.evaluate(({dialog},b)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[b]});},b);
  await page.locator('#repository-add').click();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Other');
  assert.equal(await fs.readFile(path.join(a,'Second.md'),'utf8'),'saved before switching');
  await page.locator('#open-folder').click();await page.locator('.repository-option').filter({hasText:'Alpha'}).click();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Second');
  await page.locator('#close').click();await app.waitForEvent('close');

  app=await electron.launch(options);page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Second');await page.locator('#open-folder').click();assert.equal(await page.locator('.repository-option').count(),2);
  const invalid=await page.evaluate(()=>window.still['remove-repository']('not-a-saved-folder'));assert.equal(invalid.ok,false);
  await fs.rename(b,b+'-moved');await page.locator('.repository-option').filter({hasText:'Beta'}).click();await page.locator('#repositories-error:not([hidden])').waitFor();assert.equal(await page.locator('#note-title').inputValue(),'Second');
  // A missing, inactive repository can still be forgotten, including with the keyboard.
  await page.getByRole('button',{name:'Remove Beta from list',exact:true}).focus();await page.keyboard.press('Enter');
  await page.locator('#modal[open]').waitFor();assert.equal(await page.locator('#modal-title').textContent(),'Remove repository?');assert.match(await page.locator('#modal-description').textContent(),/Beta.*stay on disk/);
  assert.equal(await page.locator('.repository-option').count(),2);assert.equal(await page.locator('#modal-cancel').evaluate(el=>document.activeElement===el),true);
  await page.locator('#modal-cancel').click();await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal(await page.locator('.repository-option').count(),2);assert.equal(await page.getByRole('button',{name:'Remove Beta from list',exact:true}).evaluate(el=>document.activeElement===el),true);
  await page.keyboard.press('Enter');await page.locator('#modal[open]').waitFor();await page.keyboard.press('Escape');await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal(await page.locator('#repositories-dialog').isVisible(),true);assert.equal(await page.locator('.repository-option').count(),2);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(data,'settings.json'),'utf8')).repositories,[a,b]);
  await page.getByRole('button',{name:'Remove Beta from list',exact:true}).click();await page.locator('#modal-submit').click();
  await page.waitForFunction(()=>document.querySelectorAll('.repository-option').length===1);
  assert.equal(await page.locator('#repositories-error').isVisible(),false);
  assert.equal(await page.locator('.repository-option').evaluate(el=>document.activeElement===el),true);
  assert.equal(await fs.readFile(path.join(b+'-moved','Other.md'),'utf8'),'beta');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(data,'settings.json'),'utf8')).repositories,[a]);
  await page.locator('#repositories-close').click();assert.equal(await page.locator('#note-title').inputValue(),'Second');

  // A save conflict must stop removal of the active folder and preserve the edit.
  await fs.writeFile(path.join(a,'Second.md'),'external change');await page.locator('#editor').fill('saved before removal');
  await page.locator('#open-folder').click();await page.getByRole('button',{name:'Remove Alpha from list',exact:true}).click();
  await page.locator('#modal-submit').click();
  await page.locator('#repositories-error:not([hidden])').waitFor();assert.match(await page.locator('#repositories-error').textContent(),/changed in another app/);
  assert.equal(await page.locator('.repository-option').count(),1);assert.equal(await page.locator('#editor').inputValue(),'saved before removal');
  assert.equal(await fs.readFile(path.join(a,'Second.md'),'utf8'),'external change');
  await fs.writeFile(path.join(a,'Second.md'),'saved before switching');
  await page.getByRole('button',{name:'Remove Alpha from list',exact:true}).click();await page.locator('#modal-submit').click();await page.locator('.repositories-empty').waitFor();
  assert.equal(await fs.readFile(path.join(a,'Second.md'),'utf8'),'saved before removal');assert.equal(await fs.readFile(path.join(a,'First.md'),'utf8'),'alpha');
  assert.equal(await page.locator('#repository-add').evaluate(el=>document.activeElement===el),true);
  await page.locator('#repositories-close').click();assert.equal(await page.locator('#welcome').isVisible(),true);
  await page.locator('#close').click();await app.waitForEvent('close');

  // An intentionally empty list must stay empty, rather than recreate the default repo.
  app=await electron.launch(options);page=await app.firstWindow();await page.locator('#open-folder').click();await page.locator('.repositories-empty').waitFor();
  const empty=await page.evaluate(()=>window.still.init());assert.equal(empty.value.root,'');assert.deepEqual(empty.value.repositories,[]);
  assert.equal(await fs.stat(defaultNotes).then(()=>true,()=>false),false);
  await app.evaluate(({dialog},a)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[a]});},a);
  await page.locator('#repository-add').click();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Second');
  assert.equal(await page.locator('#editor').inputValue(),'saved before removal');
  await page.locator('#close').click();await app.waitForEvent('close');

  // Also remove an unavailable last-active repository after restarting.
  await fs.rename(a,a+'-offline');app=await electron.launch(options);page=await app.firstWindow();await page.locator('#open-folder').click();
  await page.getByRole('button',{name:'Remove Alpha from list',exact:true}).click();await page.locator('#modal-submit').click();await page.locator('.repositories-empty').waitFor();
  const settings=JSON.parse(await fs.readFile(path.join(data,'settings.json'),'utf8'));assert.equal(settings.root,'');assert.deepEqual(settings.repositories,[]);
  assert.equal(await fs.readFile(path.join(a+'-offline','Second.md'),'utf8'),'saved before removal');
  console.log('PASS: confirmation, Cancel/Escape and focus restoration, switching, persistence, keyboard removal, missing repositories, save-before-removal, conflict recovery, empty-list restart, re-adding folders, files retained.');
 }finally{await app.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
