const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const POLL_INTERVAL=4*60*60*1000,RETRY_INTERVAL=60*1000,MAX_RETRY_INTERVAL=60*60*1000;

// Credentials stay in the main process and are never written to update metadata.
async function githubToken(){
 const supplied=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
 if(supplied?.trim())return supplied.trim();
 try{
  const {stdout}=await run('gh',['auth','token','--hostname','github.com'],{windowsHide:true,timeout:10000,maxBuffer:16384});
  if(stdout.trim())return stdout.trim();
 }catch{}
 const error=Error('Sign in with gh auth login to get updates from the private tsunsora/still repository.');
 error.code='GITHUB_AUTH_REQUIRED';throw error;
}

function createUpdates({updater,disabledReason='',notify=()=>{},getToken=githubToken,beforeInstall=async()=>{},installFailed=()=>{}}){
 let state={status:disabledReason?'disabled':'idle',reason:disabledReason,version:'',percent:0,message:'',background:false};
 let pending=null,timer,running=false,failures=0,lastCheck=0;
 const snapshot=()=>({...state});
 function publish(values){state={...state,...values};notify(snapshot());return snapshot();}
 function failed(error){
  if(state.status==='installing')installFailed();
  const message=error?.code==='GITHUB_AUTH_REQUIRED'
   ?'Sign in with gh auth login to get updates from the private tsunsora/still repository.'
   :error?.code==='ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
    ?'The latest GitHub release needs its latest.yml update file. Try again after an update-enabled release is published.'
    :'Could not update Still Notes. Check your connection and GitHub repository access, then try again.';
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
  updater.on('update-downloaded',info=>publish({status:'ready',version:info.version,percent:100,message:''}));
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
    const token=await getToken();
    updater.setFeedURL({provider:'github',owner:'tsunsora',repo:'still',private:true,token});
    const result=await updater.checkForUpdates();
    if(!result)throw Error('Update check did not complete.');
    if(!result.isUpdateAvailable)return publish({status:'current',message:''});
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
module.exports={createUpdates};
