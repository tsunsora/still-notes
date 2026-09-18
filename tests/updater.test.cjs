const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createUpdates}=require('../src/updates.cjs');

class Updater extends EventEmitter{
 checks=0;downloads=0;installs=0;available=true;
 setFeedURL(feed){this.feed=feed;}
 async checkForUpdates(){this.checks++;return {isUpdateAvailable:this.available,updateInfo:{version:'1.6.0'}};}
 async downloadUpdate(){this.downloads++;this.emit('download-progress',{percent:54.7});this.emit('update-downloaded',{version:'1.6.0'});}
 quitAndInstall(silent,relaunch){this.installs++;this.installArgs=[silent,relaunch];}
}
function setup(options={}){
 const updater=new Updater(),states=[];
 const service=createUpdates({updater,getToken:async()=>'test-credential',notify:state=>states.push(state),...options});
 return {updater,service,states};
}
test('downloads only stable newer updates, exposes progress, and keeps credentials out of UI state',async()=>{
 const {updater,service,states}=setup();
 assert.equal((await service.check()).status,'ready');
 assert.deepEqual(updater.feed,{provider:'github',owner:'tsunsora',repo:'still',private:true,token:'test-credential'});
 assert.equal(updater.allowPrerelease,false);assert.equal(updater.allowDowngrade,false);
 assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.autoDownload,false);
 assert(states.some(state=>state.status==='downloading'&&state.percent===54));
 assert(!JSON.stringify(states).includes('test-credential'));
 await service.check();assert.equal(updater.checks,1);assert.equal(updater.downloads,1);assert.equal(updater.installs,0);
});
test('does not download when the installed version is current',async()=>{
 const {updater,service}=setup();updater.available=false;
 assert.equal((await service.check()).status,'current');assert.equal(updater.downloads,0);
 await assert.rejects(service.install(),/No downloaded update/);
});
test('coalesces concurrent checks while credentials are being resolved',async()=>{
 let release;const token=new Promise(resolve=>release=resolve);
 const {updater,service}=setup({getToken:()=>token});
 const first=service.check(),second=service.check();release('test-credential');
 await Promise.all([first,second]);assert.equal(updater.checks,1);assert.equal(updater.downloads,1);
});
test('missing authentication is recoverable and never calls GitHub without credentials',async()=>{
 let authenticated=false;
 const {updater,service}=setup({getToken:async()=>{if(authenticated)return 'test-credential';throw Object.assign(Error('private detail'),{code:'GITHUB_AUTH_REQUIRED'});}});
 assert.match((await service.check()).message,/gh auth login/);assert.equal(updater.checks,0);
 authenticated=true;assert.equal((await service.check()).status,'ready');
});
test('failed checks and downloads can be retried without exposing server or token details',async()=>{
 const {updater,service}=setup();
 updater.checkForUpdates=async()=>{throw Object.assign(Error('token test-credential'),{code:'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'});};
 assert.match((await service.check()).message,/latest.yml/);
 updater.checkForUpdates=Updater.prototype.checkForUpdates;
 updater.downloadUpdate=async()=>{throw Error('checksum mismatch: test-credential');};
 const failure=await service.check();assert.equal(failure.status,'error');assert(!failure.message.includes('test-credential'));
 await assert.rejects(service.install(),/No downloaded update/);assert.equal(updater.installs,0);
 updater.downloadUpdate=Updater.prototype.downloadUpdate;
 assert.equal((await service.check()).status,'ready');
});
test('waits for pending saves and prevents a second installation',async()=>{
 let save;const saved=new Promise(resolve=>save=resolve);
 const {updater,service}=setup({beforeInstall:()=>saved});
 await service.check();const installation=service.install();assert.equal(updater.installs,0);
 await assert.rejects(service.install(),/No downloaded update/);
 save();await installation;assert.equal(updater.installs,1);assert.deepEqual(updater.installArgs,[false,true]);
});
test('a failed save preserves the downloaded update for a retry',async()=>{
 let fails=true,resets=0;
 const {updater,service}=setup({beforeInstall:async()=>{if(fails)throw Error('save failed');},installFailed:()=>resets++});
 await service.check();await assert.rejects(service.install(),/save failed/);
 assert.equal(service.snapshot().status,'ready');assert.equal(updater.installs,0);assert.equal(resets,1);
 fails=false;await service.install();assert.equal(updater.installs,1);
});
test('installer launch errors restore normal close behavior',async()=>{
 let resets=0;const {updater,service}=setup({installFailed:()=>resets++});
 await service.check();updater.quitAndInstall=()=>updater.emit('error',Error('installer failed'));
 await assert.rejects(service.install(),/Could not update/);assert.equal(resets,1);
});
test('development and portable builds never check or download',async()=>{
 for(const disabledReason of ['development','portable']){
  const service=createUpdates({disabledReason,updater:null,getToken:()=>{throw Error('must not request credentials');}});
  service.start();assert.equal((await service.check()).status,'disabled');
  await assert.rejects(service.install(),/No downloaded update/);service.stop();
 }
});
