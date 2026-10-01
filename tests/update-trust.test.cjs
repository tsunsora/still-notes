const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {releaseDetails,signingPayload,verifyReleaseSignature,verifyReleaseTrust,verifyDownloadedRelease,hashFile}=require('../src/update-trust.cjs');
const keys=crypto.generateKeyPairSync('ed25519');
function fixture(){
 const contents=Buffer.from('Test installer'),sha512=crypto.createHash('sha512').update(contents).digest('base64');
 const info={version:'1.7.0',files:[{url:'Still-Notes-Setup-1.7.0.exe',sha512}]};
 const details=releaseDetails(info),document={schema:1,...details,signature:crypto.sign(null,signingPayload(details),keys.privateKey).toString('base64')};
 return {info,document,contents};
}
test('release signatures bind the app, version, filename and SHA-512 checksum to the embedded key',()=>{
 const {info,document}=fixture();
 assert.equal(verifyReleaseSignature(info,document,keys.publicKey).version,'1.7.0');
 for(const change of [{app:'another.app'},{version:'1.7.1'},{file:'another.exe'},{sha512:'A'.repeat(86)+'=='},{signature:'A'.repeat(86)+'=='},{schema:2}]){
  assert.throws(()=>verifyReleaseSignature(info,{...document,...change},keys.publicKey),{code:'ERR_UPDATER_INVALID_RELEASE_SIGNATURE'});
 }
 const other=crypto.generateKeyPairSync('ed25519');
 assert.throws(()=>verifyReleaseSignature(info,document,other.publicKey),{code:'ERR_UPDATER_INVALID_RELEASE_SIGNATURE'});
});
test('release metadata rejects ambiguous filenames, invalid checksums and nonstable versions',()=>{
 const {info}=fixture();
 for(const changed of [{...info,version:'../../other'},{...info,version:'1.7.0-beta.1'},{...info,files:[]},{...info,files:[...info.files,...info.files]},{...info,files:[{url:info.files[0].url,sha512:'invalid'}]}]){
  assert.throws(()=>releaseDetails(changed),{code:'ERR_UPDATER_INVALID_RELEASE_SIGNATURE'});
 }
});
test('release signatures come from the fixed HTTPS GitHub tag and reject oversized or invalid documents',async()=>{
 const {info,document}=fixture();let requested;
 const fetcher=async url=>{requested=url;return new Response(JSON.stringify(document));};
 await verifyReleaseTrust(info,{fetcher,key:keys.publicKey});
 assert.equal(requested,'https://github.com/tsunsora/still-notes/releases/download/v1.7.0/Still-Notes-Setup-1.7.0.exe.sig');
 for(const fetcher of [async()=>new Response('x'.repeat(4097)),async()=>new Response('{}'),async()=>new Response('missing',{status:404}),async()=>({ok:true,url:'http://github.com/file'})]){
  await assert.rejects(verifyReleaseTrust(info,{fetcher,key:keys.publicKey}),{code:'ERR_UPDATER_INVALID_RELEASE_SIGNATURE'});
 }
});
test('cached installers are rehashed before installation and tampered or missing files are rejected',async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'still-update-trust-')));
 try{
  const {info,document,contents}=fixture(),release=verifyReleaseSignature(info,document,keys.publicKey),file=path.join(temp,release.file);
  await fs.writeFile(file,contents);assert.equal(await hashFile(file),release.sha512);await verifyDownloadedRelease(file,release);
  await fs.writeFile(file,'Tampered after download');await assert.rejects(verifyDownloadedRelease(file,release),{code:'ERR_UPDATER_CHECKSUM_MISMATCH'});
  await fs.unlink(file);await assert.rejects(verifyDownloadedRelease(file,release),{code:'ERR_UPDATER_CHECKSUM_MISMATCH'});
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
