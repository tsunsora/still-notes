const POLL_INTERVAL=4*60*60*1000,RETRY_INTERVAL=60*1000,MAX_RETRY_INTERVAL=60*60*1000;
const {UPDATE_FEED,verifyReleaseTrust,verifyDownloadedRelease}=require('./update-trust.cjs');

async function verifyUpdateTrust(updater,{install=false}={}){
 let config;
 try{config=await updater.configOnDisk.value;}catch{}
 if(config?.provider!==UPDATE_FEED.provider||config.owner!==UPDATE_FEED.owner||config.repo!==UPDATE_FEED.repo||config.private===true||(config.host&&config.host!=='github.com')||(config.protocol&&config.protocol!=='https')){
  throw Object.assign(Error('The update configuration does not match the Still Notes release repository.'),{code:'ERR_UPDATER_UNTRUSTED_FEED'});
 }
 const publishers=config.publisherName==null?[]:Array.isArray(config.publisherName)?config.publisherName:[config.publisherName];
 if(config.publisherName!=null&&(!publishers.length||publishers.some(name=>typeof name!=='string'||!name.trim()))){
  throw Object.assign(Error('The configured update publisher is invalid.'),{code:'ERR_UPDATER_INVALID_SIGNATURE'});
 }
 if(install&&publishers.length){
  if(!updater.installerPath||typeof updater.verifySignature!=='function'||await updater.verifySignature(updater.installerPath)!==null){
   throw Object.assign(Error('The downloaded installer did not pass publisher verification.'),{code:'ERR_UPDATER_INVALID_SIGNATURE'});
  }
 }
}

function createUpdates({updater,currentVersion='',disabledReason='',notify=()=>{},verifyTrust=verifyUpdateTrust,verifyRelease=verifyReleaseTrust,verifyDownload=verifyDownloadedRelease,beforeInstall=async()=>{},installFailed=()=>{}}){
 let state={status:disabledReason?'disabled':'idle',reason:disabledReason,currentVersion,version:'',percent:0,message:'',background:false};
 let pending=null,timer,running=false,failures=0,lastCheck=0,trustedRelease=null;
 const snapshot=()=>({...state});
 function publish(values){state={...state,...values};notify(snapshot());return snapshot();}
 function failed(error){
  if(state.status==='installing')installFailed();
  const message=['ERR_UPDATER_INVALID_RELEASE_SIGNATURE','ERR_UPDATER_CHECKSUM_MISMATCH'].includes(error?.code)
   ?'The update did not pass release verification and will not be installed.'
   :error?.code==='ERR_UPDATER_INVALID_SIGNATURE'
    ?'The update did not pass publisher verification and will not be installed.'
   :error?.code==='ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
    ?'The latest GitHub release needs its latest.yml update file. Try again after an update-enabled release is published.'
     :'Could not update Still Notes. Check your connection, then try again.';
  return publish({status:'error',message});
 }
 if(!disabledReason){
  updater.autoDownload=false;
  // Installation is routed through the app's save-before-close handshake.
  updater.autoInstallOnAppQuit=false;
  updater.allowPrerelease=false;
  updater.allowDowngrade=false;
  updater.logger=null;
  updater.on('error',failed);
  updater.on('download-progress',progress=>{
   if(state.status==='downloading')publish({percent:Math.max(0,Math.min(100,Math.floor(progress.percent||0)))});
  });
  updater.on('update-downloaded',info=>{
   if(state.status!=='downloading')return;
   if(info.version!==trustedRelease?.version){failed(Object.assign(Error('Unexpected update version.'),{code:'ERR_UPDATER_INVALID_RELEASE_SIGNATURE'}));return;}
   publish({status:'ready',version:info.version,percent:100,message:''});
  });
 }
 function schedule(delay){
  clearTimeout(timer);timer=null;
  if(!running||['ready','installing'].includes(state.status))return;
  timer=setTimeout(()=>{timer=null;void check({background:true});},delay);timer.unref?.();
 }
 async function check({background=false}={}){
  if(disabledReason||['ready','installing'].includes(state.status))return snapshot();
  if(pending){if(!background&&state.background)publish({background:false});return pending;}
  clearTimeout(timer);timer=null;lastCheck=Date.now();
  publish({status:'checking',message:'',version:'',percent:0,background});
  pending=(async()=>{
   try{
    await verifyTrust(updater);
    updater.setFeedURL(UPDATE_FEED);
    const result=await updater.checkForUpdates();
    if(!result)throw Error('Update check did not complete.');
    if(!result.isUpdateAvailable)return publish({status:'current',message:''});
    trustedRelease=await verifyRelease(result.updateInfo);
    publish({status:'downloading',version:result.updateInfo.version,percent:0});
    // electron-updater verifies the downloaded installer against latest.yml.
    await updater.downloadUpdate();
    return snapshot();
   }catch(error){return failed(error);}
  })();
  try{return await pending;}finally{
   pending=null;
   failures=state.status==='error'?failures+1:0;
   schedule(failures?Math.min(RETRY_INTERVAL*2**Math.min(failures-1,6),MAX_RETRY_INTERVAL):POLL_INTERVAL);
  }
 }
 async function install({relaunch=true}={}){
  if(state.status!=='ready')throw Error('No downloaded update is ready to install.');
  publish({status:'installing',message:''});
  try{await verifyTrust(updater,{install:true});await verifyDownload(updater.installerPath,trustedRelease);}catch(error){failed(error);throw Error(state.message);}
  try{
   await beforeInstall();
  }catch(error){
   installFailed();publish({status:'ready',message:'Could not save pending changes. Please try again.'});throw error;
  }
  try{updater.quitAndInstall(true,relaunch);}catch(error){failed(error);}
  if(state.status==='error')throw Error(state.message);
  return snapshot();
 }
 function start(){
  if(disabledReason||running)return;
  running=true;schedule(10000);
 }
 function resume(){
  if(!running||pending||Date.now()-lastCheck<RETRY_INTERVAL)return;
  if(state.status==='error'||Date.now()-lastCheck>=POLL_INTERVAL)void check({background:true});
 }
 function stop(){running=false;clearTimeout(timer);timer=null;}
 return {snapshot,check,install,start,stop,resume};
}
module.exports={createUpdates,verifyUpdateTrust};
