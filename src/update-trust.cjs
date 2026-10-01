const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const UPDATE_FEED=Object.freeze({provider:'github',owner:'tsunsora',repo:'still-notes',private:false});
const APP_ID='com.still.notes';
const publicKey=crypto.createPublicKey(fs.readFileSync(path.join(__dirname,'update-public-key.pem')));
const invalid=()=>Object.assign(Error('Update release verification failed.'),{code:'ERR_UPDATER_INVALID_RELEASE_SIGNATURE'});

function releaseDetails(info){
 if(typeof info?.version!=='string'||info.version.length>50||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(info.version))throw invalid();
 const file=`Still-Notes-Setup-${info.version}.exe`;
 const matches=Array.isArray(info.files)?info.files.filter(entry=>entry.url===file):[];
 if(matches.length!==1||typeof matches[0].sha512!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(matches[0].sha512))throw invalid();
 return {app:APP_ID,version:info.version,file,sha512:matches[0].sha512};
}
function signingPayload(details){
 return Buffer.from(JSON.stringify({app:APP_ID,version:details.version,file:details.file,sha512:details.sha512}));
}
function verifyReleaseSignature(info,document,key=publicKey){
 const details=releaseDetails(info);
 if(document?.schema!==1||document.app!==APP_ID||document.version!==details.version||document.file!==details.file||document.sha512!==details.sha512||typeof document.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(document.signature))throw invalid();
 if(!crypto.verify(null,signingPayload(details),key,Buffer.from(document.signature,'base64')))throw invalid();
 return Object.freeze(details);
}
async function verifyReleaseTrust(info,{fetcher=fetch,key=publicKey}={}){
 const details=releaseDetails(info);
 const url=`https://github.com/${UPDATE_FEED.owner}/${UPDATE_FEED.repo}/releases/download/v${details.version}/${details.file}.sig`;
 const response=await fetcher(url,{signal:AbortSignal.timeout(15000)});
 const resolved=new URL(response.url||url);
 if(!response.ok||resolved.protocol!=='https:'||!(resolved.hostname==='github.com'||resolved.hostname.endsWith('.githubusercontent.com')))throw invalid();
 let size=0;const chunks=[];
 for await(const chunk of response.body){size+=chunk.length;if(size>4096)throw invalid();chunks.push(Buffer.from(chunk));}
 let document;
 try{document=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw invalid();}
 return verifyReleaseSignature(info,document,key);
}
async function hashFile(file,algorithm='sha512',encoding='base64'){
 const hash=crypto.createHash(algorithm);
 for await(const chunk of fs.createReadStream(file))hash.update(chunk);
 return hash.digest(encoding);
}
async function verifyDownloadedRelease(file,release){
 try{
  if(!file||!release||path.basename(file)!==release.file||await hashFile(file)!==release.sha512)throw invalid();
 }catch{
  throw Object.assign(Error('Downloaded update checksum does not match the signed release.'),{code:'ERR_UPDATER_CHECKSUM_MISMATCH'});
 }
}
module.exports={UPDATE_FEED,releaseDetails,signingPayload,verifyReleaseSignature,verifyReleaseTrust,hashFile,verifyDownloadedRelease};
