const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createUpdates,verifyUpdateTrust}=require('../src/updates.cjs');

class Updater extends EventEmitter{
 checks=0;downloads=0;installs=0;available=true;
 configOnDisk={value:Promise.resolve({publisherName:'Test publisher'})};
 installerPath='simulated-installer.exe';
 async verifySignature(){return null;}
 setFeedURL(feed){this.feed=feed;}
 async checkForUpdates(){this.checks++;return {isUpdateAvailable:this.available,updateInfo:{version:'1.6.0'}};}
 async downloadUpdate(){this.downloads++;this.emit('download-progress',{percent:54.7});this.emit('update-downloaded',{version:'1.6.0'});}
 quitAndInstall(silent,relaunch){this.installs++;this.installArgs=[silent,relaunch];}
}
function setup(options={}){
 const updater=new Updater(),states=[];
 const service=createUpdates({updater,notify:state=>states.push(state),...options});
 return {updater,service,states};
}
test('downloads only stable newer updates, exposes progress, and keeps credentials out of UI state',async()=>{
 const {updater,service,states}=setup();
 assert.equal((await service.check()).status,'ready');
 assert.deepEqual(updater.feed,{provider:'github',owner:'tsunsora',repo:'still-notes',private:false});
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
test('coalesces concurrent checks while publisher trust is being validated',async()=>{
 let release;const token=new Promise(resolve=>release=resolve);
 const {updater,service}=setup({verifyTrust:()=>token});
 const first=service.check(),second=service.check();release('test-credential');
 await Promise.all([first,second]);assert.equal(updater.checks,1);assert.equal(updater.downloads,1);
});
test('missing publisher metadata switches to manual updates without errors or retries',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 let validations=0;
 const {updater,service,states}=setup({verifyTrust:async updater=>{validations++;await verifyUpdateTrust(updater);}});
 t.after(()=>service.stop());
 updater.configOnDisk={value:Promise.resolve({})};
 service.start();t.mock.timers.tick(10000);await settle();
 const state=service.snapshot();
 assert.equal(state.status,'disabled');assert.equal(state.reason,'unsigned');assert.equal(state.message,'');
 assert(!states.some(state=>state.status==='error'));
 assert.equal(updater.checks,0);assert.equal(updater.downloads,0);
 service.start();service.resume();await service.check();t.mock.timers.tick(24*60*60000);await settle();
 assert.equal(validations,1);assert.equal(updater.checks,0);assert.equal(updater.downloads,0);
 await assert.rejects(service.install(),/No downloaded update/);assert.equal(updater.installs,0);
});

test('rejects missing, empty, and invalid publishers and unverifiable installers',async()=>{
 for(const publisherName of [undefined,'',[],[''],[null]]){
  await assert.rejects(verifyUpdateTrust({configOnDisk:{value:Promise.resolve({publisherName})}}),{code:'ERR_UPDATER_MISSING_PUBLISHER'});
 }
 await assert.rejects(verifyUpdateTrust({configOnDisk:{value:Promise.reject(Error('missing'))}}),{code:'ERR_UPDATER_MISSING_PUBLISHER'});
 const {updater,service}=setup();await service.check();
 updater.verifySignature=async()=> 'Signature is invalid';
 await assert.rejects(service.install(),/publisher verification/);
 assert.equal(updater.installs,0);assert.equal(service.snapshot().status,'error');
});

test('lost publisher metadata blocks installation and restores normal close behavior',async()=>{
 let resets=0;const {updater,service}=setup({installFailed:()=>resets++});
 await service.check();updater.configOnDisk={value:Promise.resolve({})};
 await assert.rejects(service.install(),/Update Still Notes manually/);
 assert.equal(service.snapshot().status,'disabled');assert.equal(service.snapshot().reason,'unsigned');
 assert.equal(updater.installs,0);assert.equal(resets,1);
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
test('development, portable and unsigned builds never check or download',async()=>{
 for(const disabledReason of ['development','portable','unsigned']){
  const service=createUpdates({disabledReason,updater:null,verifyTrust:()=>{throw Error('must not verify disabled builds');}});
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
 const {updater,service}=setup({verifyTrust:()=>token});
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
 const {service}=setup({verifyTrust:()=>token});
 const automatic=service.check({background:true}),manual=service.check();
 reject(Error('offline'));await Promise.all([automatic,manual]);
 assert.equal(service.snapshot().background,false);assert.equal(service.snapshot().status,'error');
});
