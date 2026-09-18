const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'still-ui-')),root=path.join(temp,'Notes'),data=path.join(temp,'profile');
 await fs.mkdir(root);await fs.mkdir(data);
 await fs.writeFile(path.join(root,'Test.md'),'Original note');
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root,last:'Test.md'}));
 const env={...process.env,STILL_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.STILL_EXE?{executablePath:process.env.STILL_EXE,env}:{args:[path.resolve(__dirname,'..')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='Test');
  assert.equal(await page.title(),'Still Notes');assert.equal(await page.locator('.brand strong').textContent(),'Still Notes');
  assert.equal(await app.evaluate(({app})=>app.getName()),'Still Notes');
  assert.equal(await page.locator('#new-note, #new-folder, .side-actions').count(),0);
  await page.keyboard.press('Control+Shift+N');await page.locator('#modal-input').fill('Shortcut folder');await page.locator('#modal-submit').click();await page.locator('#modal').waitFor({state:'hidden'});
  await page.keyboard.press('Control+n');await page.locator('#modal-input').fill('Shortcut note');await page.locator('#modal-submit').click();
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='Shortcut note');
  assert.equal(await fs.readFile(path.join(root,'Shortcut folder','Shortcut note.md'),'utf8'),'');
  await page.locator('.tree-row[data-path="Shortcut folder"]').click({button:'right'});
  await page.getByRole('menuitem',{name:'New note',exact:true}).click();await page.locator('#modal-input').fill('Context note');await page.locator('#modal-submit').click();
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='Context note');
  assert.equal(await fs.readFile(path.join(root,'Shortcut folder','Context note.md'),'utf8'),'');
  // Exercise update status messages and save-before-install through the real IPC boundary.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('update-state',{status:'downloading',percent:37,version:'1.6.0'}));
  await page.getByRole('button',{name:'Downloading update · 37%'}).waitFor();assert.equal(await page.locator('#app-update').isDisabled(),true);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('update-state',{status:'ready',percent:100,version:'1.6.0'}));
  await page.getByRole('button',{name:'Restart to update'}).waitFor();
  await page.locator('#editor').fill('Saved before update');await page.locator('#app-update').click();
  // Test builds reject installation, so this also verifies UI recovery after failure.
  await page.getByRole('alert').filter({hasText:'No downloaded update'}).waitFor();
  assert.equal(await fs.readFile(path.join(root,'Shortcut folder','Context note.md'),'utf8'),'Saved before update');
  assert.equal(await page.locator('body').evaluate(body=>body.inert),false);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(680,500));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#editor').fill('Saved before close');await page.locator('#close').click();await app.waitForEvent('close');
  assert.equal(await fs.readFile(path.join(root,'Shortcut folder','Context note.md'),'utf8'),'Saved before close');assert.deepEqual(errors,[]);
  console.log('PASS: removed controls, keyboard/context creation, update progress, save-before-install, install failure recovery, minimum layout, save-before-close.');
 }finally{await app.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
