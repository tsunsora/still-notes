const {_electron:electron}=require('playwright');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const appPath=path.resolve(__dirname,'..');

async function fixture(files,run){
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'still-regressions-')));
 const root=path.join(temp,'Notes'),data=path.join(temp,'profile'),bootstrap=path.join(temp,'bootstrap.cjs');
 await fs.mkdir(root);await fs.mkdir(data);
 for(const [name,content]of Object.entries(files)){
  await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),content);
 }
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root,last:path.normalize(Object.keys(files)[0])}));
 await fs.writeFile(bootstrap,`global.testIO=require('node:fs/promises');require(${JSON.stringify(path.join(appPath,'src/main.cjs'))});`);
 const env={...process.env,STILL_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[bootstrap],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#editor').value.length>0&&!document.querySelector('#editor').readOnly);
  await run({app,page,root,data,bootstrap,env});
 }finally{
  await app.evaluate(()=>global.releaseRead?.()).catch(()=>{});
  await app.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});
 }
}

(async()=>{
 await fixture({'A.md':'Original A','B.md':'Original B'},async({app,page,root})=>{
  await page.locator('#editor').fill('Saved before switching');
  await app.evaluate(()=>{
   const original=global.testIO.readFile;
   global.testIO.readFile=async function(file,...args){
    if(String(file).endsWith('B.md')){
     global.testIO.readFile=original;global.readStarted=true;
     await new Promise(resolve=>{global.releaseRead=resolve;});
    }
    return original.call(this,file,...args);
   };
  });
  await page.locator('.tree-row[data-path="B.md"] .tree-open').click();
  for(let i=0;!await app.evaluate(()=>global.readStarted);i++){assert(i<100);await page.waitForTimeout(10);}
  assert.equal(await page.locator('#editor').evaluate(el=>el.readOnly),true);
  assert.equal(await page.locator('#note-title').evaluate(el=>el.readOnly),true);
  await page.locator('#editor').focus();await page.keyboard.type('This must not modify the old note');await page.keyboard.press('Control+b');
  assert.equal(await page.locator('#editor').inputValue(),'Saved before switching');
  await app.evaluate(()=>global.releaseRead());await page.waitForFunction(()=>document.querySelector('#note-title').value==='B'&&!document.querySelector('#editor').readOnly);
  assert.equal(await fs.readFile(path.join(root,'A.md'),'utf8'),'Saved before switching');
  assert.equal(await page.locator('#editor').inputValue(),'Original B');
  await fs.unlink(path.join(root,'A.md'));
  const failed=await page.evaluate(()=>window.still.read('A.md'));assert.equal(failed.ok,false);
 });

 await fixture({'Folder/A.md':'[Sibling](./B.md)\n\n[Parent](../Root.md)','Folder/B.md':'[Back](./A.md)','Root.md':'Root note'},async({page})=>{
  await page.locator('#preview-mode').click();await page.locator('#preview a').filter({hasText:'Sibling'}).click();
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='B');
  await page.locator('#preview a').filter({hasText:'Back'}).click();await page.waitForFunction(()=>document.querySelector('#note-title').value==='A');
  await page.locator('#preview a').filter({hasText:'Parent'}).click();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Root');
 });

 await fixture({'A.md':'Original A','Folder/Child.md':'Child'},async({app,page,root})=>{
  await app.evaluate(({shell})=>{shell.trashItem=async()=>{throw Error('The operating-system trash should not be called.');};});
  for(const rel of ['', '.', '.\\', 'Folder\\..','Folder/../']){
   const result=await page.evaluate(rel=>window.still.trash(rel),rel);assert.equal(result.ok,false);assert.match(result.error,/Cannot remove/);
  }
  assert.equal(await fs.readFile(path.join(root,'A.md'),'utf8'),'Original A');
  await page.locator('#note-title').fill('a');await page.locator('#editor').focus();
  await page.waitForFunction(()=>document.querySelector('.tree-row[data-path="a.md"]')&&!document.querySelector('#editor').readOnly);
  assert.equal(await page.locator('#note-title').inputValue(),'a');assert.equal(await fs.readFile(path.join(root,'a.md'),'utf8'),'Original A');
  const renamed=await page.evaluate(()=>window.still.rename('Folder','folder'));assert.equal(renamed.ok,true);
  assert((await fs.readdir(root)).includes('folder'));
  await page.keyboard.press('Control+n');await page.locator('#modal-input').fill('.Hidden');await page.locator('#modal-submit').click();
  await page.locator('#modal-error:not([hidden])').waitFor();assert.match(await page.locator('#modal-error').textContent(),/start with a dot/);
  assert.equal(await fs.stat(path.join(root,'.Hidden.md')).then(()=>true,()=>false),false);await page.locator('#modal-cancel').click();
  const hiddenRename=await page.evaluate(()=>window.still.rename('a.md','.Hidden'));assert.equal(hiddenRename.ok,false);
  await fs.writeFile(path.join(root,'.Hidden.md'),'Existing hidden note');
  const hiddenImport=await page.evaluate(root=>window.still.import([root+'\\.Hidden.md'],''),root);assert.equal(hiddenImport.ok,false);
 });

 await fixture({'A.md':'Original A'},async({app,page,env,bootstrap,data})=>{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());
  const duplicate=spawn(require('electron'),[bootstrap],{env,windowsHide:true,stdio:'ignore'});
  const timeout=setTimeout(()=>duplicate.kill(),10000);
  try{const [code]=await once(duplicate,'exit');assert.equal(code,0);}finally{clearTimeout(timeout);}
  for(let i=0;await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized());i++){assert(i<100);await page.waitForTimeout(10);}
  assert.equal((await page.evaluate(()=>window.still.preferences({sidebarWidth:300}))).ok,true);
  assert.equal(JSON.parse(await fs.readFile(path.join(data,'settings.json'),'utf8')).sidebarWidth,300);
 });

 console.log('PASS: navigation editing guard, relative note links, root-delete aliases, case-only note/folder renames, hidden-name rejection, duplicate-instance exit and window restoration.');
})().catch(error=>{console.error(error);process.exitCode=1;});
