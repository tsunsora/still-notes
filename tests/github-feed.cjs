// Optional live smoke check: STILL_EXE must point to an installer-built executable.
// Verifies the public feed and release signature; optional download check never installs.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 assert(process.env.STILL_EXE,'Set STILL_EXE to the installer-built Still Notes.exe.');
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'still-feed-'))),root=path.join(temp,'Notes'),data=path.join(temp,'profile');
 await fs.mkdir(root);await fs.mkdir(data);await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root}));
 const env={...process.env,STILL_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.STILL_EXE,env});
 try{
  const result=await app.evaluate(async({app})=>{
   const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
   const {autoUpdater}=load('electron-updater');
   const {createUpdates}=load('./src/updates.cjs');
   const {verifyReleaseTrust,verifyDownloadedRelease}=load('./src/update-trust.cjs');
   const download=process.env.STILL_FEED_DOWNLOAD_TEST==='1';
   if(download){
    const {DownloadedUpdateHelper}=load('electron-updater/out/DownloadedUpdateHelper');
    autoUpdater.downloadedUpdateHelper=new DownloadedUpdateHelper(app.getPath('userData')+'/update-test-cache');
    autoUpdater.currentVersion=new (load('semver').SemVer)('1.6.6');
   }else autoUpdater.downloadUpdate=async()=>{};
   const service=createUpdates({updater:autoUpdater});
   try{
    const state=await service.check();
    if(state.status==='error')throw Error(state.message);
    const info=autoUpdater.updateInfoAndProvider.info,release=await verifyReleaseTrust(info);
    if(download){
     if(state.status!=='ready')throw Error('The real installer was not downloaded.');
     await verifyDownloadedRelease(autoUpdater.installerPath,release);
    }
    return {status:state.status,version:release.version,downloadVerified:download};
   }finally{service.stop();}
  });
  assert(['current','downloading','ready'].includes(result.status));
  console.log(`PASS: live GitHub release ${result.version}, pinned release signature${result.downloadVerified?' and real automatic installer download/checksum':''}; installation disabled.`);
 }finally{await app.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
