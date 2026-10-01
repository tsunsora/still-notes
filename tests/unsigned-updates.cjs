// Exercise installed-build startup without a Windows certificate using an isolated profile.
if(process.versions.electron){
 const {app}=require('electron');
 app.setPath('appData',process.env.STILL_MANUAL_TEST_PROFILE);
 Object.defineProperty(app,'isPackaged',{value:true});
 Object.defineProperty(process,'resourcesPath',{value:process.env.STILL_MANUAL_TEST_RESOURCES});
 require('../src/main.cjs');
}else{
 const {_electron:electron}=require('playwright');
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
 (async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'still-manual-updates-')));
  const profile=path.join(temp,'appData'),resources=path.join(temp,'resources'),root=path.join(temp,'Notes');
  await fs.mkdir(path.join(profile,'Still'),{recursive:true});await fs.mkdir(resources);await fs.mkdir(root);
  await fs.writeFile(path.join(root,'Test.md'),'Original note');
  await fs.writeFile(path.join(profile,'Still','settings.json'),JSON.stringify({root,last:'Test.md'}));
  await fs.writeFile(path.join(resources,'app-update.yml'),'provider: github\nowner: tsunsora\nrepo: still-notes\n');
  const env={...process.env,STILL_MANUAL_TEST_PROFILE:profile,STILL_MANUAL_TEST_RESOURCES:resources};
  delete env.STILL_TEST_DATA;delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try{
   app=await electron.launch({args:[__filename],env});
   const page=await app.firstWindow();
   await page.waitForFunction(()=>document.querySelector('#note-title').value==='Test');
   const initial=await page.evaluate(()=>window.still['update-state']());
   assert.equal(initial.ok,true);const state=initial.value;
   assert.equal(state.status,'idle');assert.equal(state.reason,'');assert.equal(state.message,'');
   const versionLabel='v'+await app.evaluate(({app})=>app.getVersion());
   const button=page.locator('#app-update');
   await button.waitFor();assert.equal(await page.locator('#update-label').textContent(),versionLabel);
   assert.equal(await button.getAttribute('aria-label'),`Still Notes ${versionLabel} · Check for updates`);
   await app.evaluate(({shell,app})=>{
    globalThis.updateLinks=[];globalThis.unsignedUpdateChecks=0;
    shell.openExternal=async url=>{globalThis.updateLinks.push(url);};
    const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
    load('electron-updater').autoUpdater.checkForUpdates=async()=>{globalThis.unsignedUpdateChecks++;return {isUpdateAvailable:false};};
   });
   await button.click();await button.click();
   await page.evaluate(async()=>{await window.still['check-updates']();await window.still['resume-updates']();window.dispatchEvent(new Event('online'));});
   assert.deepEqual(await app.evaluate(()=>globalThis.updateLinks),[]);
   assert.equal(await app.evaluate(()=>globalThis.unsignedUpdateChecks),3);
   assert.equal((await page.evaluate(()=>window.still['update-state']())).value.status,'current');
   assert.equal(await page.locator('#toast').isVisible(),false);
   await page.locator('#editor').fill('Automatic updates keep saving normally');
   await page.locator('#close').click();await app.waitForEvent('close');
   assert.equal(await fs.readFile(path.join(root,'Test.md'),'utf8'),'Automatic updates keep saving normally');
   console.log('PASS: unsigned installed-build startup enables automatic checks without warnings or external links, and notes save on close.');
  }finally{await app?.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
