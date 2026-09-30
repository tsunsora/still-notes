const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {saveNote,recoverInterruptedSaves}=require('../src/note-storage.cjs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');

async function fixture(t){
 const folder=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'still-storage-')));
 t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const file=path.join(folder,'Note.md');await fs.writeFile(file,'Original');
 const recovery=path.join(folder,'.still-recovery');
 return {folder,file,recovery,backups:async()=>(await fs.readdir(recovery)).filter(name=>name.endsWith('.bak'))};
}

test('saves new content and preserves the replaced disk revision',async t=>{
 const {file,recovery,backups}=await fixture(t);
 await saveNote(file,'New content',hash('Original'));
 assert.equal(await fs.readFile(file,'utf8'),'New content');
 const names=await backups();assert.equal(names.length,1);
 assert.equal(await fs.readFile(path.join(recovery,names[0]),'utf8'),'Original');
 assert.deepEqual(await fs.readdir(recovery),names);
});

test('rejects an existing disk conflict without modifying either version',async t=>{
 const {file,recovery}=await fixture(t);await fs.writeFile(file,'Foreign');
 await assert.rejects(saveNote(file,'My edit',hash('Original')),/changed in another app/);
 assert.equal(await fs.readFile(file,'utf8'),'Foreign');assert.deepEqual(await fs.readdir(recovery),[]);
});

test('preserves an external edit arriving between the check and replacement',async t=>{
 const {file,recovery,backups}=await fixture(t);
 const io={...fs,rename:async(from,to)=>{await fs.writeFile(file,'Late external edit');return fs.rename(from,to);}};
 await assert.rejects(saveNote(file,'My edit',hash('Original'),io),/changed in another app/);
 assert.equal(await fs.readFile(file,'utf8'),'Late external edit');
 assert.equal(await fs.readFile(path.join(recovery,(await backups())[0]),'utf8'),'Late external edit');
});

test('does not overwrite a file another editor creates during replacement',async t=>{
 const {file,recovery,backups}=await fixture(t);
 const io={...fs,link:async(from,to)=>{
  if(from.endsWith('.tmp')&&to===file)await fs.writeFile(file,'New external revision');
  return fs.link(from,to);
 }};
 await assert.rejects(saveNote(file,'My edit',hash('Original'),io),/changed in another app/);
 assert.equal(await fs.readFile(file,'utf8'),'New external revision');
 assert.equal(await fs.readFile(path.join(recovery,(await backups())[0]),'utf8'),'Original');
});

test('preserves writes made through a previously open file handle',async t=>{
 const {file,recovery,backups}=await fixture(t),handle=await fs.open(file,'r+');
 try{
  await saveNote(file,'My edit',hash('Original'));
  await handle.truncate(0);await handle.writeFile('External handle edit');
  assert.equal(await fs.readFile(file,'utf8'),'My edit');
  assert.equal(await fs.readFile(path.join(recovery,(await backups())[0]),'utf8'),'External handle edit');
 }finally{await handle.close();}
});

test('restores a missing note after an interrupted replacement',async t=>{
 const {folder,file,recovery}=await fixture(t),id=crypto.randomUUID();
 await fs.mkdir(recovery);
 const backup='Note.md.123.'+id+'.bak';await fs.rename(file,path.join(recovery,backup));
 await fs.writeFile(path.join(recovery,id+'.pending'),JSON.stringify({file:'Note.md',backup}));
 await fs.writeFile(path.join(recovery,id+'.tmp'),'Incomplete new version');
 await recoverInterruptedSaves(folder);
 assert.equal(await fs.readFile(file,'utf8'),'Original');
 assert.deepEqual(await fs.readdir(recovery),[backup]);
});

test('recovery never overwrites a newer note or resurrects a deliberately deleted note',async t=>{
 const {folder,file,recovery}=await fixture(t),id=crypto.randomUUID();
 await saveNote(file,'New revision',hash('Original'));
 const backup=(await fs.readdir(recovery))[0];
 // Completed saves leave only copies, so a later deletion stays deleted.
 await fs.unlink(file);await recoverInterruptedSaves(folder);
 assert.equal(await fs.stat(file).then(()=>true,()=>false),false);
 // An interrupted save with an existing newer note retains that newer note.
 const interrupted='Note.md.123.'+id+'.bak';await fs.copyFile(path.join(recovery,backup),path.join(recovery,interrupted));
 await fs.writeFile(path.join(recovery,id+'.pending'),JSON.stringify({file:'Note.md',backup:interrupted}));
 await fs.writeFile(file,'External newer note');await recoverInterruptedSaves(folder);
 assert.equal(await fs.readFile(file,'utf8'),'External newer note');
});

test('rejects recovery directory links outside the note folder',async t=>{
 const {folder,file,recovery}=await fixture(t),outside=path.join(folder,'Elsewhere');
 await fs.mkdir(outside);await fs.symlink(outside,recovery,process.platform==='win32'?'junction':'dir');
 await assert.rejects(saveNote(file,'New revision',hash('Original')),/cannot be a link/);
 assert.equal(await fs.readFile(file,'utf8'),'Original');assert.deepEqual(await fs.readdir(outside),[]);
});

test('unsupported filesystems leave the original note untouched',async t=>{
 const {file,recovery}=await fixture(t);
 const io={...fs,link:async()=>{throw Object.assign(Error('Unsupported'),{code:'ENOTSUP'});}};
 await assert.rejects(saveNote(file,'New content',hash('Original'),io),/filesystem does not support/);
 assert.equal(await fs.readFile(file,'utf8'),'Original');assert.deepEqual(await fs.readdir(recovery),[]);
});
