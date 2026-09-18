const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const {createUpdates}=require('./updates.cjs');
const {normalizeWorkspaceState,remapWorkspaceState,removeWorkspacePaths,restoreWindowState}=require('./session-state.cjs');
app.setName('Still Notes');
// Keep the existing profile across the product rename so upgrades retain all
// repositories, note metadata, and saved window/workspace state.
app.setPath('userData',process.env.STILL_TEST_DATA||path.join(app.getPath('appData'),'Still'));
let win, updates, root = '', settings = {}, closing = false;
const revisions = new Map();
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const cfg = () => path.join(app.getPath('userData'), 'settings.json');
let settingsWrites=Promise.resolve();
function saveSettings() {const value=JSON.stringify(settings);const op=settingsWrites.catch(()=>{}).then(async()=>{await fs.mkdir(app.getPath('userData'),{recursive:true});await fs.writeFile(cfg()+'.tmp',value);await fs.rename(cfg()+'.tmp',cfg());});settingsWrites=op;return op;}
let windowSaveTimer;
function captureWindowState(){
 if(win&&!win.isDestroyed()&&!win.isMinimized())settings.window={bounds:win.getNormalBounds(),maximized:win.isMaximized()};
}
function queueWindowSave(){
 if(closing)return;
 captureWindowState();clearTimeout(windowSaveTimer);
 windowSaveTimer=setTimeout(()=>{saveSettings().catch(error=>console.error('Could not save window state:',error.message));},250);
}
async function persistWindowState(){clearTimeout(windowSaveTimer);captureWindowState();await saveSettings();}
function workspaceMeta(){settings.workspaces??={};const key=hash(root.toLowerCase());settings.workspaces[key]??={icons:[],orders:[]};return settings.workspaces[key];}
function migrateMeta(old,next){const m=workspaceMeta();const mapped=p=>p===old?next:p.startsWith(old+path.sep)?next+p.slice(old.length):p;m.icons=m.icons.map(([p,i])=>[mapped(p),i]);m.orders=m.orders.map(([p,items])=>[mapped(p),items.map(mapped)]);if(settings.last)settings.last=mapped(settings.last);if(m.last)m.last=mapped(m.last);if(m.session)m.session=remapWorkspaceState(m.session,old,next);}
async function safe(relative = '', exists = true) {
  if (!root || typeof relative !== 'string' || path.isAbsolute(relative)) throw Error('Choose a notes folder first.');
  const target = path.resolve(root, relative);
  const within = p => { const rel=path.relative(root,p);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)); };
  if (!within(target)) throw Error('This path is outside your notes folder.');
  const real = await fs.realpath(exists ? target : path.dirname(target));
  if (!within(real)) throw Error('Linked folders outside your notes folder are not supported.');
  return target;
}
function validName(name) {
  if (typeof name !== 'string' || !name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name) || name.length > 160) throw Error('Use a valid file name without slashes or special characters.');
  return name.trim();
}
async function scan(dir = '') {
  const entries = await fs.readdir(await safe(dir), {withFileTypes:true});
  const result = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push({name:entry.name, path:rel, type:'folder', children:await scan(rel)});
    else if (entry.isFile() && /\.md$/i.test(entry.name)) result.push({name:entry.name.slice(0,-3), path:rel, type:'note'});
  }
  const order=new Map(workspaceMeta().orders).get(dir)||[];const rank=new Map(order.map((p,i)=>[p,i]));
  return result.sort((a,b) => ((rank.get(a.path)??Infinity)-(rank.get(b.path)??Infinity)) || (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || a.name.localeCompare(b.name,undefined,{numeric:true}));
}
function rememberRoot(){settings.repositories=Array.isArray(settings.repositories)?settings.repositories:[];if(root&&!settings.repositories.some(p=>p.toLowerCase()===root.toLowerCase()))settings.repositories.push(root);}
async function activateRoot(next){
 const resolved=await fs.realpath(next);if(!(await fs.stat(resolved)).isDirectory())throw Error('This notes folder is unavailable.');
 if(root)workspaceMeta().last=settings.last||'';
 const previous={root,last:settings.last};root=resolved;settings.root=root;settings.last=workspaceMeta().last||'';
 try{const result=await snapshot();rememberRoot();await saveSettings();revisions.clear();return {...result,repositories:settings.repositories};}
 catch(error){root=previous.root;settings.root=root;settings.last=previous.last;throw error;}
}
async function snapshot() { return {root, repositories:settings.repositories||[],name:root ? path.basename(root) : '', tree:root ? await scan() : [], last:settings.last || '', mode:settings.mode==='preview'?'preview':'edit',sidebarWidth:settings.sidebarWidth||280,sidebarHidden:settings.sidebarHidden===true,session:root?normalizeWorkspaceState(workspaceMeta().session):null,icons:root?Object.fromEntries(workspaceMeta().icons):{}}; }
function handle(name, fn) { ipcMain.handle(name, async (event,...args) => {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw Error('Invalid request.');
  try { return {ok:true, value:await fn(...args)}; } catch (err) { return {ok:false,error:err.message}; }
}); }
handle('init', snapshot);
handle('choose', async () => {
  const result = await dialog.showOpenDialog(win,{title:'Open a notes folder',properties:['openDirectory','createDirectory']});
  if (result.canceled) return null;
  return activateRoot(result.filePaths[0]);
});
handle('switch-repository',async next=>{if(typeof next!=='string'||!settings.repositories?.includes(next))throw Error('Choose a saved notes folder.');return activateRoot(next);});
handle('remove-repository',async folder=>{
 if(typeof folder!=='string'||!settings.repositories?.includes(folder))throw Error('Choose a saved notes folder.');
 await writes;
 const closed=(root||settings.root||'').toLowerCase()===folder.toLowerCase();
 const previous={root,settingsRoot:settings.root,last:settings.last,repositories:settings.repositories};
 if(closed){if(root)workspaceMeta().last=settings.last||'';root='';settings.root='';settings.last='';}
 settings.repositories=settings.repositories.filter(value=>value!==folder);
 try{await saveSettings();}
 catch(error){root=previous.root;settings.root=previous.settingsRoot;settings.last=previous.last;settings.repositories=previous.repositories;throw error;}
 if(closed)revisions.clear();
 return {repositories:settings.repositories,closed};
});
handle('read', async rel => {
  if (!/\.md$/i.test(rel)) throw Error('Only Markdown notes can be opened.');
  const file = await safe(rel); const stat = await fs.stat(file);
  if (stat.size > 8 * 1024 * 1024) throw Error('This note is larger than the 8 MB editing limit.');
  const content = await fs.readFile(file,'utf8'); revisions.set(rel,hash(content)); settings.last=rel; await saveSettings(); return content;
});
let writes = Promise.resolve();
handle('write', (rel, content) => {
  const operation = writes.then(async () => {
    if (typeof content !== 'string' || Buffer.byteLength(content) > 8*1024*1024 || !revisions.has(rel)) throw Error('Open this note before saving it.');
    const file = await safe(rel); const disk = await fs.readFile(file,'utf8');
    if (hash(disk) !== revisions.get(rel)) throw Error('This note changed in another app. Your edits are kept here. Copy them, then reopen the note to load the latest version.');
    const temp = file + '.still-' + crypto.randomUUID() + '.tmp';
    try { await fs.writeFile(temp,content,{flag:'wx'}); await fs.rename(temp,file); }
    finally { await fs.unlink(temp).catch(()=>{}); }
    revisions.set(rel,hash(content)); return true;
  });
  writes=operation.catch(()=>{}); return operation;
});
handle('create', async (parent,name,type) => {
  if (!['note','folder'].includes(type)) throw Error('Invalid item type.');
  name=validName(name); if(type==='note' && !/\.md$/i.test(name)) name+='.md';
  const rel=path.join(parent || '',name); const file=await safe(rel,false);
  try { if(type==='folder') await fs.mkdir(file); else await fs.writeFile(file,'',{flag:'wx'}); }
  catch(error){if(error.code==='EEXIST')throw Error('That name is already used in this folder. Choose a different name.');if(error.code==='EACCES'||error.code==='EPERM')throw Error('This folder is read-only. Open a folder you can write to.');throw error;}
  return {path:rel,tree:await scan()};
});
handle('rename', async (rel,name) => {
  const old=await safe(rel); const stat=await fs.stat(old); name=validName(name);
  if(stat.isFile()&&!/\.md$/i.test(name)) name+='.md';
  const next=path.join(path.dirname(rel),name); if(next===rel) return next;
  const dest=await safe(next,false);
  try { await fs.access(dest); throw Error('An item with that name already exists.'); } catch(e) { if(e.code!=='ENOENT') throw e; }
  await fs.rename(old,dest); migrateMeta(rel,next);revisions.clear();await saveSettings();return next;
});
async function moveItem(rel,parent){
  const old=await safe(rel); const next=path.join(parent,path.basename(rel));
  if(next===rel) return next;
  if(next.toLowerCase().startsWith(rel.toLowerCase()+path.sep)) throw Error('A folder cannot be moved inside itself.');
  const dest=await safe(next,false);
  try { await fs.access(dest); throw Error('An item with that name already exists here.'); } catch(e) {if(e.code!=='ENOENT') throw e;}
  await fs.rename(old,dest);migrateMeta(rel,next);revisions.clear();await saveSettings();return next;
}
handle('move',moveItem);
handle('place',async(rel,parent,anchor='',position='after')=>{
  if(!['before','after'].includes(position))throw Error('Invalid drop position.');
  await safe(parent);if(anchor&&path.dirname(anchor)!==(parent||'.'))throw Error('Invalid drop target.');
  const initial=(await scan(parent)).map(n=>n.path);
  if(anchor&&!initial.includes(anchor))throw Error('The drop target no longer exists.');
  if(anchor===rel&&path.dirname(rel)===(parent||'.'))return {path:rel,tree:await scan()};
  const next=await moveItem(rel,parent);const items=initial.filter(p=>p!==rel&&p!==next);const at=anchor?items.indexOf(anchor):-1;items.splice(at<0?items.length:at+(position==='after'?1:0),0,next);
  const m=workspaceMeta();const orders=new Map(m.orders);orders.set(parent,items);m.orders=Array.from(orders);await saveSettings();return {path:next,tree:await scan()};
});
handle('set-icon',async(rel,id)=>{const file=await safe(rel);if(!(await fs.stat(file)).isFile()||!/\.md$/i.test(rel))throw Error('Only note icons can be changed.');const catalog=require('./icon-catalog.json');if(id!==null&&!catalog.includes(id))throw Error('Unknown icon.');const m=workspaceMeta();const icons=new Map(m.icons);id===null?icons.delete(rel):icons.set(rel,id);m.icons=Array.from(icons);await saveSettings();return Object.fromEntries(icons);});
handle('import',async(files,parent)=>{if(!Array.isArray(files)||files.length>100)throw Error('Drop up to 100 Markdown files at a time.');await safe(parent);const imported=[];for(const source of files){if(typeof source!=='string'||!path.isAbsolute(source)||!source.toLowerCase().endsWith('.md'))throw Error('Only Markdown (.md) files can be imported.');const stat=await fs.stat(source);if(!stat.isFile()||stat.size>8*1024*1024)throw Error('Each note must be a file under 8 MB.');}
  for(const source of files){const original=path.basename(source);let name=original,index=2;for(;;){const rel=path.join(parent,name);try{await fs.copyFile(source,await safe(rel,false),require('node:fs').constants.COPYFILE_EXCL);imported.push(rel);break;}catch(e){if(e.code!=='EEXIST')throw e;name=path.basename(original,'.md')+' ('+index+++').md';}}}return {paths:imported,tree:await scan()};});
handle('preferences',async values=>{
 if(values.mode==='edit'||values.mode==='preview')settings.mode=values.mode;
 if(Number.isFinite(values.sidebarWidth))settings.sidebarWidth=Math.round(Math.max(220,Math.min(480,values.sidebarWidth)));
 if(typeof values.sidebarHidden==='boolean')settings.sidebarHidden=values.sidebarHidden;
 if(root&&values.workspaceRoot===root&&values.session){const session=normalizeWorkspaceState(values.session);if(session)workspaceMeta().session=session;}
 delete settings.theme;await saveSettings();return true;
});
handle('trash', async rel => { if(!rel) throw Error('Cannot remove the notes folder.'); await shell.trashItem(await safe(rel));const m=workspaceMeta();const keep=p=>p!==rel&&!p.startsWith(rel+path.sep);m.icons=m.icons.filter(([p])=>keep(p));m.orders=m.orders.filter(([p])=>keep(p)).map(([p,items])=>[p,items.filter(keep)]);if(m.session)m.session=removeWorkspacePaths(m.session,rel);if(settings.last&&!keep(settings.last))settings.last='';if(m.last&&!keep(m.last))m.last='';revisions.clear();await saveSettings();return true; });
handle('reveal', async () => {if(root) await shell.openPath(root);});
handle('external', async url => {if(typeof url==='string' && /^https?:\/\//i.test(url)) await shell.openExternal(url);});
handle('window', async action => {if(action==='minimize')win.minimize();if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();if(action==='close')win.close();});
handle('window-state',async()=>({maximized:win.isMaximized()}));
handle('ready-close', async () => {await writes;await persistWindowState();await settingsWrites;closing=true;win.close();});
handle('update-state',()=>updates.snapshot());
handle('check-updates',()=>updates.check());
handle('install-update',()=>updates.install());
app.whenReady().then(async()=>{
  try {settings=JSON.parse(await fs.readFile(cfg(),'utf8'));}catch{settings={};}
   // An explicit empty root means the user removed the active saved folder.
   if(typeof settings.root!=='string'){const initial=process.env.STILL_TEST_NOTES||path.join(app.getPath('documents'),'Still Notes');await fs.mkdir(initial,{recursive:true});settings.root=await fs.realpath(initial);await saveSettings();}
   try{root=settings.root?await fs.realpath(settings.root):'';}catch{root='';}
  rememberRoot();await saveSettings();
  // Native acrylic blurs the desktop once, beneath our shared translucent surface.
  // Keep a solid charcoal fallback on systems without Windows 11 backdrop support.
  const acrylic=process.platform==='win32'&&Number(require('node:os').release().split('.')[2])>=22621;
  nativeTheme.themeSource='dark';
  const restoredWindow=restoreWindowState(settings.window,screen.getAllDisplays(),screen.getPrimaryDisplay());
  settings.window=restoredWindow;
  win=new BrowserWindow({...restoredWindow.bounds,minWidth:Math.min(680,restoredWindow.bounds.width),minHeight:Math.min(480,restoredWindow.bounds.height),title:'Still Notes',icon:path.join(__dirname,'icon.ico'),backgroundColor:acrylic?'#00000000':'#1c2326',backgroundMaterial:acrylic?'acrylic':'none',frame:false,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  Menu.setApplicationMenu(null);
  for(const event of ['maximize','unmaximize'])win.on(event,()=>win.webContents.send('window-state',{maximized:win.isMaximized()}));
  for(const event of ['resize','move','maximize','unmaximize','restore'])win.on(event,queueWindowSave);
  win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.on('close',e=>{if(!closing){e.preventDefault();win.webContents.send('before-close');}});
  const hasUpdateConfig=await fs.access(path.join(process.resourcesPath,'app-update.yml')).then(()=>true,()=>false);
  const disabledReason=!app.isPackaged||process.env.STILL_TEST_DATA?'development':process.platform!=='win32'||!hasUpdateConfig?'portable':'';
  updates=createUpdates({
   disabledReason,
   updater:disabledReason?null:require('electron-updater').autoUpdater,
   notify:state=>{if(!win.isDestroyed())win.webContents.send('update-state',state);},
    beforeInstall:async()=>{await writes;await persistWindowState();await settingsWrites;closing=true;},
   installFailed:()=>{closing=false;}
  });
  await win.loadURL(pathToFileURL(path.join(__dirname,'index.html')).href);if(restoredWindow.maximized)win.maximize();win.show();updates.start();
});
app.on('window-all-closed',()=>{clearTimeout(windowSaveTimer);updates?.stop();app.quit();});
