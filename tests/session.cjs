const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'still-session-')),data=path.join(temp,'profile'),a=path.join(temp,'Alpha'),b=path.join(temp,'Beta');
 await fs.mkdir(data);await fs.mkdir(path.join(a,'Projects','Nested'),{recursive:true});await fs.mkdir(path.join(a,'Reference'));await fs.mkdir(path.join(b,'Work'),{recursive:true});
 for(let i=0;i<30;i++)await fs.mkdir(path.join(a,'Z'+String(i).padStart(2,'0')));
 await fs.writeFile(path.join(a,'Projects','Nested','Deep.md'),Array.from({length:180},(_,i)=>`Paragraph ${i}: A long note to restore the reading position.\n\n`).join(''));
 await fs.writeFile(path.join(a,'Reference','Links.md'),'Reference links');await fs.writeFile(path.join(b,'Other.md'),'Other workspace');
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({root:a,last:path.join('Projects','Nested','Deep.md')}));
 const env={...process.env,STILL_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const options=process.env.STILL_EXE?{executablePath:process.env.STILL_EXE,env}:{args:[path.resolve(__dirname,'..')],env};
 let app,page;
 const launch=async()=>{app=await electron.launch(options);page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Deep');};
 const close=async()=>{await page.locator('#close').click();await app.waitForEvent('close');};
 const folder=name=>page.locator(`.tree-row[data-path="${name}"] .tree-open`);
 const normalBounds=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNormalBounds());
 try{
  await launch();
  await app.evaluate(({BrowserWindow,screen})=>{const area=screen.getPrimaryDisplay().workArea;BrowserWindow.getAllWindows()[0].setBounds({x:area.x+30,y:area.y+35,width:Math.min(960,area.width-60),height:Math.min(680,area.height-70)});});
  const normal=await normalBounds();
  await folder('Reference').click();await folder('Projects').click();
  assert.equal(await folder('Projects').getAttribute('aria-expanded'),'false');
  await page.locator('#sidebar-resize').press('Home');await page.locator('#sidebar-resize').press('ArrowRight');
  await page.locator('#preview-mode').click();
  await page.getByRole('button',{name:'Maximize',exact:true}).click();await page.getByRole('button',{name:'Restore down',exact:true}).waitFor();
  await page.locator('#collapse').click();await page.waitForTimeout(300);
  const view=await page.evaluate(()=>{const editor=document.querySelector('#editor');editor.setSelectionRange(17,43,'backward');document.querySelector('#writing-area').scrollTop=700;document.querySelector('#tree').scrollTop=100;return {scroll:document.querySelector('#writing-area').scrollTop,tree:document.querySelector('#tree').scrollTop};});
  assert(view.scroll>0&&view.tree>0);
  await close();

  await launch();
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized()),true);
  assert.deepEqual(await normalBounds(),normal,'Maximizing must retain the restore-down bounds');
  await page.waitForFunction(scroll=>document.querySelector('#writing-area').scrollTop===scroll,view.scroll);
  assert.equal(await page.locator('#preview').isVisible(),true);
  assert.equal(await page.locator('#app').evaluate(el=>el.classList.contains('sidebar-hidden')),true);
  assert.equal(await folder('Projects').getAttribute('aria-expanded'),'false','The active note must not reopen its deliberately collapsed ancestor');
  assert.equal(await folder('Reference').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('.tree-row[data-path="Projects"]').evaluate(el=>el.classList.contains('folder-selected')),true);
  assert.deepEqual(await page.locator('#editor').evaluate(el=>[el.selectionStart,el.selectionEnd,el.selectionDirection]),[17,43,'backward']);
  await page.getByRole('button',{name:'Restore down',exact:true}).click();await page.getByRole('button',{name:'Maximize',exact:true}).waitFor();
  assert.deepEqual(await normalBounds(),normal);
  await page.locator('#expand').click();await page.waitForTimeout(300);
  assert.equal(Math.round((await page.locator('#sidebar').boundingBox()).width),236);
  assert.equal(await page.locator('#tree').evaluate(el=>el.scrollTop),view.tree);

  // Each repository keeps its own tree and reading position; delayed writes
  // carrying the previous repository ID must not overwrite the current one.
  await page.locator('#open-folder').click();await app.evaluate(({dialog},b)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[b]});},b);await page.locator('#repository-add').click();
  await page.waitForFunction(()=>document.querySelector('#note-title').value==='Other');await folder('Work').click();
  for(const deadline=Date.now()+5000;;){const result=await page.evaluate(()=>window.still.init());if(result.value.session?.expanded.includes('Work'))break;assert(Date.now()<deadline,'The Beta session should be saved while the app is open');await page.waitForTimeout(50);}
  await page.evaluate(a=>window.still.preferences({workspaceRoot:a,session:{expanded:['Wrong folder']}}),a);
  const beta=await page.evaluate(()=>window.still.init());assert.deepEqual(beta.value.session.expanded,['Work']);
  await page.locator('#open-folder').click();await page.locator('.repository-option').filter({hasText:'Alpha'}).click();await page.waitForFunction(()=>document.querySelector('#note-title').value==='Deep');
  await page.waitForFunction(scroll=>document.querySelector('#writing-area').scrollTop===scroll,view.scroll);
  assert.equal(await folder('Projects').getAttribute('aria-expanded'),'false');assert.equal(await folder('Reference').getAttribute('aria-expanded'),'true');
  assert.deepEqual(await page.locator('#editor').evaluate(el=>[el.selectionStart,el.selectionEnd]),[17,43]);

  // A renamed expanded folder remains expanded, without disturbing a closed
  // ancestor of the active note or the note's cursor/scroll position.
  await page.locator('.tree-row[data-path="Reference"]').click({button:'right'});await page.getByRole('menuitem',{name:'Rename',exact:true}).click();await page.locator('#modal-input').fill('Resources');await page.locator('#modal-submit').click();
  await folder('Resources').waitFor();assert.equal(await folder('Resources').getAttribute('aria-expanded'),'true');assert.equal(await folder('Projects').getAttribute('aria-expanded'),'false');
  await close();await launch();
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized()),false);assert.deepEqual(await normalBounds(),normal);
  assert.equal(await page.locator('#sidebar').isVisible(),true);assert.equal(await folder('Resources').getAttribute('aria-expanded'),'true');assert.equal(await folder('Projects').getAttribute('aria-expanded'),'false');
  await page.waitForFunction(scroll=>document.querySelector('#writing-area').scrollTop===scroll,view.scroll);

  // Closing from the taskbar while minimized preserves the preceding window
  // mode and normal bounds, but the next launch must be visible.
  await page.getByRole('button',{name:'Maximize',exact:true}).click();await page.getByRole('button',{name:'Restore down',exact:true}).waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());await new Promise(resolve=>setTimeout(resolve,150));
  await Promise.all([app.waitForEvent('close'),app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close())]);
  await launch();assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized()),true);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized()),false);assert.deepEqual(await normalBounds(),normal);
  console.log('PASS: window bounds/maximize/restore-down/minimize, sidebar width/visibility, per-repository expansion/selection, active note, Read mode, cursor/scroll, stale-write isolation, renamed folders.');
 }finally{await app?.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
