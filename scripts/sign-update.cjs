const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const yaml=require('js-yaml');
const {releaseDetails,signingPayload,verifyReleaseSignature,verifyDownloadedRelease,hashFile}=require('../src/update-trust.cjs');
(async()=>{
 const verify=process.argv.includes('--verify'),directory=path.resolve(process.argv.find((arg,index)=>index>1&&arg!=='--verify')||path.join(__dirname,'..',require('../package.json').build.directories.output));
 const info=yaml.load(await fs.readFile(path.join(directory,'latest.yml'),'utf8'));
 if(info.version!==require('../package.json').version)throw Error('Release metadata does not match the application version.');
 const details=releaseDetails(info),installer=path.join(directory,details.file),signatureFile=installer+'.sig';
 if(await hashFile(installer)!==details.sha512)throw Error('Installer does not match latest.yml.');
 if(!verify){
  const pem=process.env.STILL_UPDATE_SIGNING_KEY_FILE?await fs.readFile(process.env.STILL_UPDATE_SIGNING_KEY_FILE):process.env.STILL_UPDATE_SIGNING_KEY;
  if(!pem)throw Error('Configure STILL_UPDATE_SIGNING_KEY or STILL_UPDATE_SIGNING_KEY_FILE.');
  const key=crypto.createPrivateKey(pem);
  if(key.asymmetricKeyType!=='ed25519')throw Error('Release signing requires an Ed25519 key.');
  const document={schema:1,...details,signature:crypto.sign(null,signingPayload(details),key).toString('base64')};
  verifyReleaseSignature(info,document);
  await fs.writeFile(signatureFile,JSON.stringify(document,null,2)+'\n');
  await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),`${await hashFile(installer,'sha256','hex')}  ${details.file}\n`);
 }
 const release=verifyReleaseSignature(info,JSON.parse(await fs.readFile(signatureFile,'utf8')));
 await verifyDownloadedRelease(installer,release);
 console.log(`Verified signed release ${release.version}, installer checksum and update metadata.`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
