// In Electron, use the real main process and save handshake with a fake installer.
if(process.versions.electron){
 const {app}=require('electron'),{EventEmitter}=require('node:events');
 const fs=require('node:fs'),path=require('node:path');
 const updates=require('../src/updates.cjs'),createUpdates=updates.createUpdates;
 class Updater extends EventEmitter{
  setFeedURL(){}
  async checkForUpdates(){return {isUpdateAvailable:true,updateInfo:{version:'99.0.0'}};}
  async downloadUpdate(){this.emit('update-downloaded',{version:'99.0.0'});}
  quitAndInstall(silent,relaunch){
   const profile=process.env.STILL_TEST_DATA;
   const settings=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));
   fs.writeFileSync(path.join(profile,'installation.json'),JSON.stringify({silent,relaunch,settings,note:fs.readFileSync(path.join(settings.root,'Test.md'),'utf8')}));
   setImmediate(()=>app.quit());
  }
 }
 updates.createUpdates=options=>createUpdates({...options,disabledReason:'',updater:new Updater(),getToken:async()=>'test-credential'});
 require('../src/main.cjs');
}else{
 const {_electron:electron}=require('playwright');
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
 (async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'still-update-close-'));
  try{
   for(const relaunch of [false,true]){
    const profile=path.join(temp,relaunch?'restart':'close'),root=path.join(profile,'Notes');
    await fs.mkdir(root,{recursive:true});
    await fs.writeFile(path.join(root,'Test.md'),'Original note');
    await fs.writeFile(path.join(profile,'settings.json'),JSON.stringify({root,last:'Test.md'}));
    const env={...process.env,STILL_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
    const app=await electron.launch({args:[__filename],env});
    try{
     const page=await app.firstWindow();
     await page.waitForFunction(()=>document.querySelector('#note-title').value==='Test');
     await page.getByRole('button',{name:'Check for updates',exact:true}).click();
     await page.getByRole('button',{name:'Restart to update',exact:true}).waitFor();
     // Restart/close directly from the input event, before the autosave timer fires.
     const closed=app.waitForEvent('close');
     await page.evaluate(relaunch=>{
      const editor=document.querySelector('#editor');
      editor.value='Saved at installer launch';editor.dispatchEvent(new Event('input'));
      editor.setSelectionRange(4,9);
      document.querySelector(relaunch?'#app-update':'#close').click();
     },relaunch);
     await closed;
     const installed=JSON.parse(await fs.readFile(path.join(profile,'installation.json'),'utf8'));
     assert.equal(installed.silent,true);assert.equal(installed.relaunch,relaunch);
     assert.equal(installed.note,'Saved at installer launch');
     const session=Object.values(installed.settings.workspaces)[0].session;
     assert.equal(session.note.path,'Test.md');
     assert.equal(session.note.selectionStart,4);assert.equal(session.note.selectionEnd,9);
     assert(installed.settings.window.bounds.width>0);
    }finally{await app.close().catch(()=>{});}
   }
   console.log('PASS: real close/restart handshake saves notes, selection, session and window state before silent installation; normal close does not relaunch.');
  }finally{await fs.rm(temp,{recursive:true,force:true});}
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
