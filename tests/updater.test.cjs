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
 save();await installation;assert.equal(updater.installs,1);assert.deepEqual(updater.installArgs,[true,true]);
});
test('closing installs silently without reopening, only after pending saves finish',async()=>{
 let save;const saved=new Promise(resolve=>save=resolve);
 const {updater,service}=setup({beforeInstall:()=>saved});
 await service.check();const installation=service.install({relaunch:false});
 assert.equal(service.snapshot().status,'installing');assert.equal(updater.installs,0);
 save();await installation;assert.deepEqual(updater.installArgs,[true,false]);
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
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('automatic failures retry with capped backoff and return to normal polling after recovery',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const {updater,service}=setup();t.after(()=>service.stop());
 updater.checkForUpdates=async()=>{updater.checks++;throw Error('offline');};
 service.start();service.start();t.mock.timers.tick(9999);assert.equal(updater.checks,0);
 t.mock.timers.tick(1);await settle();assert.equal(updater.checks,1);assert.equal(service.snapshot().background,true);
 let count=1;
 for(const minutes of [1,2,4,8,16,32,60,60]){
  t.mock.timers.tick(minutes*60000-1);await settle();assert.equal(updater.checks,count);
  t.mock.timers.tick(1);await settle();assert.equal(updater.checks,++count);
 }
 updater.checkForUpdates=Updater.prototype.checkForUpdates;updater.available=false;
 t.mock.timers.tick(60*60000);await settle();assert.equal(service.snapshot().status,'current');count++;
 t.mock.timers.tick(4*60*60000-1);await settle();assert.equal(updater.checks,count);
 t.mock.timers.tick(1);await settle();assert.equal(updater.checks,count+1);
});
test('manual retry bypasses backoff and a ready update stops polling',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const {updater,service}=setup();t.after(()=>service.stop());
 updater.checkForUpdates=async()=>{throw Error('offline');};
 service.start();t.mock.timers.tick(10000);await settle();
 updater.checkForUpdates=Updater.prototype.checkForUpdates;
 assert.equal((await service.check()).status,'ready');assert.equal(service.snapshot().background,false);
 t.mock.timers.tick(24*60*60000);await settle();assert.equal(updater.checks,1);assert.equal(updater.downloads,1);assert.equal(updater.installs,0);
});
test('stop cancels retries, including a check that finishes after shutdown',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 let release;const token=new Promise(resolve=>release=resolve);
 const {updater,service}=setup({getToken:()=>token});
 service.start();t.mock.timers.tick(10000);service.stop();release('test-credential');await settle();
 assert.equal(updater.checks,1);
 service.resume();t.mock.timers.tick(24*60*60000);await settle();assert.equal(updater.checks,1);
 const retry=setup();retry.updater.checkForUpdates=async()=>{retry.updater.checks++;throw Error('offline');};
 retry.service.start();t.mock.timers.tick(10000);await settle();retry.service.stop();
 t.mock.timers.tick(24*60*60000);await settle();assert.equal(retry.updater.checks,1);
});
test('waking or reconnecting retries a stale failure without flooding checks',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
 const {updater,service}=setup();t.after(()=>service.stop());
 updater.checkForUpdates=async()=>{updater.checks++;throw Error('offline');};
 service.start();await service.check({background:true});
 service.resume();await settle();assert.equal(updater.checks,1);
 t.mock.timers.setTime(Date.now()+61000);updater.checkForUpdates=Updater.prototype.checkForUpdates;updater.available=false;
 service.resume();service.resume();await settle();assert.equal(updater.checks,2);assert.equal(service.snapshot().status,'current');
 t.mock.timers.setTime(Date.now()+61000);service.resume();await settle();assert.equal(updater.checks,2);
 t.mock.timers.setTime(Date.now()+4*60*60000);service.resume();await settle();assert.equal(updater.checks,3);
});
test('a manual check joining an automatic check keeps explicit error feedback',async()=>{
 let reject;const token=new Promise((_resolve,fail)=>reject=fail);
 const {service}=setup({getToken:()=>token});
 const automatic=service.check({background:true}),manual=service.check();
 reject(Error('offline'));await Promise.all([automatic,manual]);
 assert.equal(service.snapshot().background,false);assert.equal(service.snapshot().status,'error');
});
