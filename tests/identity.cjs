const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'still-identity-')),appData=path.join(temp,'Roaming'),legacy=path.join(appData,'Still'),notes=path.join(temp,'Existing notes');
 await fs.mkdir(legacy,{recursive:true});await fs.mkdir(path.join(notes,'Folder'),{recursive:true});
 const last=path.join('Folder','Saved.md'),content='Existing notes survive the product rename.';
 await fs.writeFile(path.join(notes,last),content);
 const key=crypto.createHash('sha256').update((await fs.realpath(notes)).toLowerCase()).digest('hex');
 await fs.writeFile(path.join(legacy,'settings.json'),JSON.stringify({root:notes,last,repositories:[notes],mode:'preview',sidebarWidth:304,workspaces:{[key]:{icons:[],orders:[],session:{expanded:['Folder'],selectedFolder:'Folder',note:{path:last,selectionStart:4,selectionEnd:9}}}}}));
 // Override the OS app-data directory before loading the real entry point.
 // Do not use STILL_TEST_DATA: this exercises the production legacy-profile path.
 const bootstrap=path.join(temp,'bootstrap.cjs');
 await fs.writeFile(bootstrap,`require('electron').app.setPath('appData',${JSON.stringify(appData)});require(${JSON.stringify(path.resolve(__dirname,'../src/main.cjs'))});`);
 const env={...process.env,STILL_TEST_NOTES:path.join(temp,'Unexpected notes')};delete env.STILL_TEST_DATA;delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[bootstrap],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Saved');
  assert.equal(await app.evaluate(({app})=>app.getName()),'Still Notes');
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),legacy);
  assert.equal(await page.title(),'Still Notes');assert.equal(await page.locator('.brand strong').textContent(),'Still Notes');
  assert.equal(await page.locator('#preview').isVisible(),true);assert.equal(await page.locator('#editor').inputValue(),content);
  assert.equal(await page.locator('.tree-row[data-path="Folder"] .tree-open').getAttribute('aria-expanded'),'true');
  await page.waitForFunction(()=>document.querySelector('#editor').selectionStart===4&&document.querySelector('#editor').selectionEnd===9);
  await page.waitForFunction(()=>Math.round(document.querySelector('#sidebar').getBoundingClientRect().width)===304);
  await page.locator('#close').click();await app.waitForEvent('close');
  const saved=JSON.parse(await fs.readFile(path.join(legacy,'settings.json'),'utf8'));assert.deepEqual(saved.repositories,[notes]);assert.equal(saved.last,last);
  assert.equal(await fs.readFile(path.join(notes,last),'utf8'),content);
  assert.equal(await fs.stat(path.join(appData,'Still Notes','settings.json')).then(()=>true,()=>false),false);
  assert.equal(await fs.stat(env.STILL_TEST_NOTES).then(()=>true,()=>false),false);
  console.log('PASS: Still Notes identity and reuse of the existing Still profile, notes, repositories, view, folder expansion, sidebar width, and selection.');
 }finally{await app.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
