// Optional live smoke check: STILL_EXE must point to an installer-built executable.
// Uses the local GitHub login, checks the private feed, and never downloads/installs.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 assert(process.env.STILL_EXE,'Set STILL_EXE to the installer-built Still Notes.exe.');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'still-feed-')),root=path.join(temp,'Notes'),data=path.join(temp,'profile');
 await fs.mkdir(root);await fs.mkdir(data);await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root}));
 const env={...process.env,STILL_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.STILL_EXE,env});
 try{
  const result=await app.evaluate(async({app})=>{
   const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
   const {autoUpdater}=load('electron-updater');
   const {createUpdates}=load('./src/updates.cjs');
   autoUpdater.downloadUpdate=async()=>{};
   return createUpdates({updater:autoUpdater}).check();
  });
  if(result.status==='error')assert.match(result.message,/latest.yml/,'The private GitHub feed could not be reached with the local credentials.');
  else assert(['current','downloading'].includes(result.status));
  console.log(result.status==='error'?'PASS: authenticated private GitHub access; current release is awaiting latest.yml.':'PASS: authenticated GitHub update metadata is readable (download and install disabled).');
 }finally{await app.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
