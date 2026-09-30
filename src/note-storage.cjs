const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const hash=content=>crypto.createHash('sha256').update(content).digest('hex');
const conflict=()=>Error('This note changed in another app. Your edits are kept here. Copy them, then reopen the note to load the latest version. Previous disk revisions are preserved in the note folder’s .still-recovery directory.');
const activeSaves=new Set();
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

async function recoveryDirectory(folder,io,create=false){
 const directory=path.join(folder,'.still-recovery');
 if(create)await io.mkdir(directory,{recursive:true});
 const realDirectory=await io.realpath(directory);
 const parent=await io.realpath(folder);
 if(path.relative(parent,realDirectory)!=='.still-recovery')throw Error('The recovery directory cannot be a link outside the note folder.');
 return directory;
}

async function recoverInterruptedSaves(folder,io=fs){
 let directory;
 try{directory=await recoveryDirectory(folder,io);}catch(error){if(error.code==='ENOENT')return;throw error;}
 for(const entry of await io.readdir(directory)){
  const id=entry.endsWith('.pending')?entry.slice(0,-8):'';
  if(!uuid.test(id))continue;
  const journal=path.join(directory,entry);
  if(activeSaves.has(journal))continue;
  let record;
  try{record=JSON.parse(await io.readFile(journal,'utf8'));}catch{continue;}
  const name=record.file;
  if(typeof name!=='string'||name.startsWith('.')||path.basename(name)!==name||/[<>:"/\\|?*\x00-\x1f]/.test(name)||!/\.md$/i.test(name))continue;
  if(typeof record.backup!=='string'||!record.backup.startsWith(name+'.')||!record.backup.endsWith('.'+id+'.bak')||path.basename(record.backup)!==record.backup)continue;
  const file=path.join(folder,name),backup=path.join(directory,record.backup);
  try{await restoreIfMissing(file,backup,io);}catch(error){
   // A crash before displacement leaves the original intact and no backup.
   if(error.code!=='ENOENT'||!await io.stat(file).then(()=>true,()=>false))throw error;
  }
  await io.unlink(path.join(directory,id+'.tmp')).catch(()=>{});
  await io.unlink(journal);
 }
}

async function restoreIfMissing(file,backup,io){
 try{await io.link(backup,file);}catch(error){if(error.code!=='EEXIST')throw error;}
}

async function saveNote(file,content,revision,io=fs){
 const directory=await recoveryDirectory(path.dirname(file),io,true);
 const id=crypto.randomUUID(),temp=path.join(directory,id+'.tmp'),probe=path.join(directory,id+'.probe');
 const backup=path.join(directory,path.basename(file)+'.'+Date.now()+'.'+id+'.bak');
 const journal=path.join(directory,id+'.pending');
 let displaced=false,finished=false;
 activeSaves.add(journal);
 try{
  await io.writeFile(temp,content,{flag:'wx'});
  if(hash(await io.readFile(file,'utf8'))!==revision)throw conflict();
  // Check support before displacing the note (FAT/exFAT cannot hard-link).
  try{await io.link(temp,probe);}catch(error){
   if(['EPERM','ENOSYS','ENOTSUP','EOPNOTSUPP','EXDEV'].includes(error.code))throw Error('This notebook filesystem does not support safe saves. Choose a folder on an NTFS drive. Your edits are kept here.');
   throw error;
  }
  await io.unlink(probe);
  await io.writeFile(journal,JSON.stringify({file:path.basename(file),backup:path.basename(backup)}),{flag:'wx'});
  // Capture the actual disk revision at replacement time. Keep it even after
  // success: another editor may still write through an already-open handle.
  await io.rename(file,backup);displaced=true;
  if(hash(await io.readFile(backup,'utf8'))!==revision)throw conflict();
  // Never overwrite a note another editor recreated during replacement.
  try{await io.link(temp,file);}catch(error){if(error.code==='EEXIST')throw conflict();throw error;}
  finished=true;
 }catch(error){
  if(displaced){
   try{await restoreIfMissing(file,backup,io);}catch{
    throw Error('Could not restore the note after a failed save. The previous disk revision is preserved at '+backup+'. Your edits are kept here.');
   }
  }
  finished=true;
  throw error;
 }finally{
  activeSaves.delete(journal);
  await io.unlink(temp).catch(()=>{});
  await io.unlink(probe).catch(()=>{});
  if(finished)await io.unlink(journal).catch(()=>{});
 }
}

module.exports={saveNote,recoverInterruptedSaves};
