const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'still-repositories-')),data=path.join(temp,'profile'),a=path.join(temp,'Alpha'),b=path.join(temp,'Beta');
for(const p of [data,a,b])await fs.mkdir(p);
await fs.writeFile(path.join(a,'First.md'),'alpha');await fs.writeFile(path.join(a,'Second.md'),'second');await fs.writeFile(path.join(b,'Other.md'),'beta');
await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root:a,last:'Second.md'}));
const env={...process.env,STILL_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
const options=process.env.STILL_EXE?{executablePath:process.env.STILL_EXE,env}:{args:[path.resolve(__dirname,'..')],env};
let app=await electron.launch(options);
try{
let page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Second');
await page.locator('#editor').fill('saved before switching');await page.locator('#open-folder').click();await page.locator('#repositories-list').getByRole('button',{name:/Alpha/}).waitFor();
await app.evaluate(({dialog},b)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[b]});},b);
await page.locator('#repository-add').click();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Other');
assert.equal(await fs.readFile(path.join(a,'Second.md'),'utf8'),'saved before switching');
await page.locator('#open-folder').click();await page.locator('#repositories-list').getByRole('button',{name:/Alpha/}).click();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Second');
await page.locator('#close').click();await app.waitForEvent('close');
app=await electron.launch(options);page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Second');await page.locator('#open-folder').click();assert.equal(await page.locator('.repository-option').count(),2);
await fs.rename(b,b+'-moved');await page.locator('#repositories-list').getByRole('button',{name:/Beta/}).click();await page.locator('#repositories-error:not([hidden])').waitFor();assert.equal(await page.locator('#note-title').inputValue(),'Second');
console.log('PASS: migration, picker, adding folders, save-before-switch, last-note restoration, restart persistence, unavailable-folder recovery.');
}finally{await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exit(1);});


