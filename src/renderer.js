import {marked} from '../node_modules/marked/lib/marked.esm.js';
const $=s=>document.querySelector(s);
import {icons,iconCatalog} from './icons.js';
function icon(name){return icons[name]||icons.note;}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let state={root:'',tree:[]}, active='', current='', dirty=false, timer, mode='edit', selectedFolder='', expanded=new Set(), saving=Promise.resolve(), busy=false, toastTimer;
const editor=$('#editor');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function animateContent(){if(!reduced.matches)$('.page').animate([{opacity:.3,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:190,easing:'cubic-bezier(.2,.8,.2,1)'});}
function toggleSidebar(hide){$('#app').classList.toggle('sidebar-hidden',hide);$('#sidebar').inert=hide;}

async function api(name,...args){const r=await window.still[name](...args);if(!r.ok)throw Error(r.error);return r.value;}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,9000);}
function attempt(fn){return async(...args)=>{try{await fn(...args);}catch(e){toast(e.message);}};}
function flatten(nodes=state.tree){return nodes.flatMap(n=>[n,...(n.children?flatten(n.children):[])]);}
function parentOf(p){return p.includes('\\')?p.slice(0,p.lastIndexOf('\\')):'';}
function displayName(p){return p.split(/[\\/]/).pop().replace(/\.md$/i,'');}
function status(text,error=false){$('#save-state').textContent=text;$('#save-state').classList.toggle('error',error);}
function resize(){editor.style.height='auto';editor.style.height=Math.max(350,editor.scrollHeight)+'px';}
function count(){const n=editor.value.trim()?editor.value.trim().split(/\s+/).length:0;$('#word-count').textContent=`${n.toLocaleString()} ${n===1?'word':'words'}`;}
function renderPreview(){const html=marked.parse(editor.value,{gfm:true,breaks:false});$('#preview').innerHTML=DOMPurify.sanitize(html,{FORBID_TAGS:['style','iframe','form','button'],FORBID_ATTR:['style']});$('#preview').querySelectorAll('input').forEach(input=>{if(input.type!=='checkbox')input.remove();else input.disabled=true;});}
function showMode(next){const changed=mode!==next;mode=next;if(changed)savePreferences({mode});$('#editor').hidden=next!=='edit';$('#preview').hidden=next!=='preview';$('#format-bar').hidden=next!=='edit';$('#edit-mode').classList.toggle('selected',next==='edit');$('#preview-mode').classList.toggle('selected',next==='preview');$('#edit-mode').setAttribute('aria-pressed',next==='edit');$('#preview-mode').setAttribute('aria-pressed',next==='preview');if(next==='preview')renderPreview();else resize();if(changed)animateContent();}
function renderTree(){
 const tree=$('#tree');tree.replaceChildren();
 function add(nodes,depth=0,container=tree){for(const n of nodes){
   const row=document.createElement('div');row.className='tree-row'+(n.path===active?' active':'')+(n.type==='folder'&&n.path===selectedFolder?' folder-selected':'');row.dataset.path=n.path;row.dataset.type=n.type;row.classList.toggle('custom-icon',n.type==='note'&&!!state.icons?.[n.path]);row.style.paddingLeft=(depth*26)+'px';row.draggable=true;
  const btn=document.createElement('button');btn.className='tree-open';btn.title=n.path;
  if(n.type==='folder'){const chevron=document.createElement('span');chevron.className='folder-chevron';chevron.innerHTML=icon(expanded.has(n.path)?'down':'right');btn.append(chevron);}else{const spacer=document.createElement('span');spacer.className='folder-chevron';btn.append(spacer);}
   const glyph=document.createElement('span');glyph.className='item-icon';glyph.innerHTML=icon(n.type==='folder'?'folder':state.icons?.[n.path]||'note');btn.append(glyph);
  let group;
  if(n.type==='folder'){
   row.classList.toggle('folder-expanded',expanded.has(n.path));
    glyph.classList.add('folder-glyph');glyph.innerHTML='<span class="folder-closed-icon">'+icon('folder')+'</span><span class="folder-open-icon">'+icon('folder-open')+'</span>';
  }
  const label=document.createElement('span');label.className='label';label.textContent=n.name;btn.append(label);
  if(n.type==='folder')btn.setAttribute('aria-expanded',expanded.has(n.path));else if(n.path===active)btn.setAttribute('aria-current','page');
  btn.onclick=attempt(async()=>{if(n.type==='folder'){
   selectedFolder=n.path;const open=!expanded.has(n.path);open?expanded.add(n.path):expanded.delete(n.path);
   tree.querySelectorAll('.folder-selected').forEach(el=>el.classList.remove('folder-selected'));row.classList.add('folder-selected');row.classList.toggle('folder-expanded',open);btn.setAttribute('aria-expanded',open);
   group.classList.toggle('is-open',open);group.inert=!open;
  }else await openNote(n.path);});row.append(btn);
  const more=document.createElement('button');more.className='icon more';more.innerHTML=icon('more');more.setAttribute('aria-label','Options for '+n.name);more.onclick=e=>showMenu(e,n);row.append(more);row.oncontextmenu=e=>{e.preventDefault();showMenu(e,n);};
  row.ondragstart=e=>{draggedPath=n.path;e.dataTransfer.setData('application/x-still-path',n.path);e.dataTransfer.effectAllowed='move';row.classList.add('dragging');};
  row.ondragend=()=>{draggedPath='';clearDropIndicators();row.classList.remove('dragging');};
  row.ondragover=e=>{if(!acceptsDrop(e))return;e.preventDefault();e.stopPropagation();clearDropIndicators();const position=dropPosition(e,row,n);row.classList.add('drop-'+position);e.dataTransfer.dropEffect=draggedPath?'move':'copy';};
  row.ondragleave=e=>{if(!row.contains(e.relatedTarget))row.classList.remove('drop-before','drop-after','drop-into');};
  row.ondrop=attempt(async e=>{e.preventDefault();e.stopPropagation();const position=dropPosition(e,row,n);clearDropIndicators();await handleDrop(e,position==='into'?n.path:parentOf(n.path),position==='into'?'':n.path,position==='before'?'before':'after');});
  container.append(row);if(n.type==='folder'){
   group=document.createElement('div');group.className='folder-children'+(expanded.has(n.path)?' is-open':'');group.inert=!expanded.has(n.path);
   const inner=document.createElement('div');inner.className='folder-children-inner';group.append(inner);container.append(group);add(n.children||[],depth+1,inner);
  }
 }}
  add(state.tree);if(!state.root){const empty=document.createElement('p');empty.className='tree-empty';empty.textContent='Open a folder to get started.';tree.append(empty);}
  $('#refresh').disabled=!state.root;
 $('#folder-label').textContent='Notes';$('#folder-label').title='Click or drop here to use the top level';
 $('#workspace-name').textContent=state.name||'Open folder';$('#open-folder').title=state.root||'Open a notes folder';
}
async function flush(){clearTimeout(timer);const task=saving.catch(()=>{}).then(async()=>{while(dirty&&active){const file=active,content=editor.value;status('Saving…');try{await api('write',file,content);current=content;dirty=editor.value!==content;status(dirty?'Unsaved':'Saved');}catch(e){status('Not saved',true);throw e;}}});saving=task;return task;}
async function openNote(rel){if(busy)return;busy=true;try{await flush();const content=await api('read',rel);active=rel;current=content;editor.value=content;dirty=false;selectedFolder=parentOf(rel);for(let p=selectedFolder;p;p=parentOf(p))expanded.add(p);$('#welcome').hidden=true;$('#document').hidden=false;$('#note-title').value=displayName(rel);$('#breadcrumb').textContent=rel.replaceAll('\\',' / ').replace(/\.md$/i,'');status('Saved');count();showMode(mode);renderTree();$('#writing-area').scrollTop=0;animateContent();}finally{busy=false;}}
function clearNote(){active='';current='';dirty=false;editor.value='';$('#document').hidden=true;$('#welcome').hidden=false;$('#breadcrumb').textContent='Still';}
async function refresh(){state=await api('init');renderTree();}
async function choose(){await flush();const result=await api('choose');if(!result)return;clearNote();state=result;expanded.clear();selectedFolder='';renderTree();const first=flatten().find(n=>n.path===state.last&&n.type==='note')||flatten().find(n=>n.type==='note');if(first)await openNote(first.path);}
function showRepositories(){
 const dialog=$('#repositories-dialog'),list=$('#repositories-list');list.replaceChildren();$('#repositories-error').hidden=true;
 for(const folder of state.repositories||[]){const button=document.createElement('button');button.className='repository-option';button.setAttribute('aria-current',folder===state.root?'true':'false');
 const glyph=document.createElement('span');glyph.innerHTML=icon('folder');const text=document.createElement('span');const name=document.createElement('strong');name.textContent=folder.split(/[\\/]/).pop();const location=document.createElement('small');location.textContent=folder;text.append(name,location);button.append(glyph,text);
 button.onclick=async()=>{button.disabled=true;try{await flush();const next=await api('switch-repository',folder);clearNote();state=next;selectedFolder='';expanded.clear();renderTree();const note=flatten().find(n=>n.path===state.last&&n.type==='note')||flatten().find(n=>n.type==='note');if(note)await openNote(note.path);dialog.close();}catch(error){$('#repositories-error').textContent=error.message;$('#repositories-error').hidden=false;}finally{button.disabled=false;}};list.append(button);}
 dialog.showModal();
}
$('#repositories-close').onclick=()=>$('#repositories-dialog').close();
$('#repository-add').onclick=attempt(async()=>{await choose();$('#repositories-dialog').close();});
function modal({title,description='',value='',submit='Create',folders=null,confirm=false,onSubmit=null}){return new Promise(resolve=>{
 const d=$('#modal');if(d.open){resolve(null);return;}
 $('#modal-title').textContent=title;$('#modal-description').textContent=description;$('#modal-description').hidden=!description;$('#modal-input').value=value;$('#modal-input').hidden=!!folders||confirm;$('#modal-label').hidden=!!folders||confirm;$('#modal-select').hidden=!folders;$('#modal-submit').textContent=submit;$('#modal-error').hidden=true;
 if(folders){$('#modal-select').replaceChildren();for(const p of folders){const o=document.createElement('option');o.value=p;o.textContent=p?p.replaceAll('\\',' / '):state.name+' (root)';$('#modal-select').append(o);}}
 let submitting=false;const finish=result=>{d.close();resolve(result);};
 $('#modal-form').onsubmit=async e=>{e.preventDefault();if(submitting)return;const result=confirm?true:folders?$('#modal-select').value:$('#modal-input').value;
 if(!confirm&&!folders&&!result.trim()){$('#modal-error').textContent='Enter a name to continue.';$('#modal-error').hidden=false;$('#modal-input').focus();return;}
 submitting=true;$('#modal-submit').disabled=true;$('#modal-cancel').disabled=true;$('#modal-submit').textContent=onSubmit?'Creating…':submit;
 try{const output=onSubmit?await onSubmit(result):result;finish(output);}catch(error){$('#modal-error').textContent=error.message;$('#modal-error').hidden=false;$('#modal-input').focus();}
 finally{submitting=false;$('#modal-submit').disabled=false;$('#modal-cancel').disabled=false;$('#modal-submit').textContent=submit;}
 };
 $('#modal-input').oninput=()=>$('#modal-error').hidden=true;$('#modal-cancel').onclick=()=>{if(!submitting)finish(null);};d.oncancel=e=>{e.preventDefault();if(!submitting)finish(null);};d.showModal();if(!folders&&!confirm){$('#modal-input').focus();$('#modal-input').select();}
 });}
async function create(type,parent=selectedFolder){
 if(!state.root){await choose();if(!state.root)return;parent='';}
 await flush();if(parent&&!flatten().some(n=>n.path===parent&&n.type==='folder'))parent='';
 const siblings=parent?flatten().find(n=>n.path===parent).children:state.tree;
 const stem=type==='note'?'Untitled':'New folder';let suggested=stem;let number=2;while(siblings.some(n=>n.name.toLowerCase()===suggested.toLowerCase()))suggested=stem+' '+number++;
 const result=await modal({title:type==='folder'?'New folder':'New note',description:'Save in '+(parent?parent.replaceAll('\\',' / '):state.name),value:suggested,onSubmit:name=>api('create',parent,name,type)});
 if(result===null)return;state.tree=result.tree;if(parent)expanded.add(parent);
 if(type==='note'){showMode('edit');await openNote(result.path);editor.focus();}
 else{selectedFolder=result.path;expanded.add(result.path);renderTree();toast('Folder created. New notes will be saved here.');}
}
async function rename(item, provided){await flush();const name=provided??await modal({title:'Rename '+(item.type==='folder'?'folder':'note'),value:item.name,submit:'Rename'});if(name===null)return;const next=await api('rename',item.path,name);const newActive=active===item.path?next:active.startsWith(item.path+'\\')?next+active.slice(item.path.length):active;if(item.type==='folder')expanded.add(next);await refresh();if(newActive)await openNote(newActive);}
async function move(item){await flush();const folders=['',...flatten().filter(n=>n.type==='folder'&&n.path!==item.path&&!n.path.startsWith(item.path+'\\')).map(n=>n.path)];const parent=await modal({title:'Move '+item.name,submit:'Move',folders});if(parent===null)return;const next=await api('move',item.path,parent);const newActive=active===item.path?next:active.startsWith(item.path+'\\')?next+active.slice(item.path.length):active;expanded.add(parent);await refresh();if(newActive)await openNote(newActive);}
async function trash(item){await flush();const answer=await modal({title:'Move to Recycle Bin?',description:item.type==='folder'?`“${item.name}” and everything inside it will be moved to the Recycle Bin.`:`“${item.name}” will be moved to the Recycle Bin.`,confirm:true,submit:'Move to Recycle Bin'});if(!answer)return;await api('trash',item.path);if(active===item.path||active.startsWith(item.path+'\\'))clearNote();else if(active)await openNote(active);selectedFolder='';await refresh();}
async function reload(item){if(dirty&&active===item.path){const answer=await modal({title:'Reload from disk?',description:'Unsaved edits in this note will be discarded. Copy anything you want to keep before continuing.',confirm:true,submit:'Reload'});if(!answer)return;clearTimeout(timer);await saving.catch(()=>{});dirty=false;}await openNote(item.path);}
let contextReturnFocus=null;
function showMenu(e,item=null){
 e.preventDefault();e.stopPropagation();contextReturnFocus=document.activeElement;
 const menu=$('#context');menu.replaceChildren();const parent=item?(item.type==='folder'?item.path:parentOf(item.path)):'';
 const items=[['New note',()=>create('note',parent),'compose'],['New folder',()=>create('folder',parent),'folder-plus']];
  if(item){if(item.type==='note')items.push(['Reload from disk',()=>reload(item),'refresh'],['Change icon…',()=>chooseIcon(item),'palette']);items.push(['Rename',()=>rename(item),'compose'],['Move to…',()=>move(item),'folder'],['Move to Recycle Bin',()=>trash(item),'archive']);}
 for(const [label,fn,glyph]of items){const button=document.createElement('button');button.innerHTML=icon(glyph);const text=document.createElement('span');text.textContent=label;button.append(text);button.setAttribute('role','menuitem');if(label.includes('Recycle'))button.className='danger';button.onclick=attempt(async()=>{menu.hidden=true;await fn();});menu.append(button);}
 menu.hidden=false;const bounds=e.target?.getBoundingClientRect?.();const x=e.clientX||bounds?.left||12,y=e.clientY||bounds?.bottom||80;
 menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';menu.querySelector('button').focus();
}
$('#sidebar').addEventListener('contextmenu',e=>{if(!e.target.closest('.tree-row'))showMenu(e);});
$('#context').addEventListener('keydown',e=>{const buttons=[...$('#context').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();}else if(e.key==='Escape'){e.preventDefault();$('#context').hidden=true;contextReturnFocus?.focus();}});
document.addEventListener('click',e=>{if(!$('#context').contains(e.target))$('#context').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#context').hidden=true;});
editor.addEventListener('input',()=>{dirty=editor.value!==current;status(dirty?'Unsaved':'Saved');count();resize();clearTimeout(timer);timer=setTimeout(()=>flush().catch(e=>toast(e.message)),450);});
function format(type){if(!active)return;showMode('edit');const start=editor.selectionStart,end=editor.selectionEnd,selection=editor.value.slice(start,end);const map={bold:['**','**','bold text'],italic:['_','_','italic text'],link:['[','](https://)','link text'],code:['\x60','\x60','code']};let text;if(map[type]){const [a,b,fallback]=map[type];text=a+(selection||fallback)+b;}else{const prefixes={heading:'# ',list:'- ',task:'- [ ] '};text=(start&&editor.value[start-1]!=='\n'?'\n':'')+prefixes[type]+selection;}editor.setRangeText(text,start,end,'end');editor.dispatchEvent(new Event('input'));editor.focus();}
$('#format-bar').querySelectorAll('button').forEach(b=>b.onclick=()=>format(b.dataset.format));
$('#note-title').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#note-title').blur();editor.focus();}if(e.key==='Escape'){$('#note-title').value=displayName(active);editor.focus();}});
$('#note-title').addEventListener('blur',attempt(async()=>{if(active&&$('#note-title').value!==displayName(active)){try{await rename({path:active,name:displayName(active),type:'note'},$('#note-title').value);}finally{$('#note-title').value=displayName(active);}}}));
$('#preview').addEventListener('click',attempt(async e=>{const link=e.target.closest('a');if(link){e.preventDefault();const href=link.getAttribute('href');if(/^https?:\/\//i.test(href))await api('external',href);else{const rel=decodeURIComponent(href.split('#')[0]);const target=flatten().find(n=>n.type==='note'&&(n.path.replaceAll('\\','/')===(parentOf(active)?parentOf(active).replaceAll('\\','/')+'/':'')+rel));if(target)await openNote(target.path);}}}));
$('#open-folder').onclick=showRepositories;$('#welcome-open').onclick=attempt(choose);$('#welcome-new').onclick=attempt(()=>create('note',''));$('#folder-label').onclick=()=>{selectedFolder='';renderTree();};$('#refresh').onclick=attempt(async()=>{await flush();await refresh();if(active)await openNote(active);});$('#edit-mode').onclick=()=>showMode('edit');$('#preview-mode').onclick=()=>showMode('preview');$('#collapse').onclick=()=>toggleSidebar(true);$('#expand').onclick=()=>toggleSidebar(false);$('#note-menu').onclick=e=>{if(active)showMenu(e,{path:active,name:displayName(active),type:'note'});};
for(const action of ['minimize','maximize','close'])$('#'+action).onclick=attempt(()=>api('window',action));
window.stillEvents.beforeClose(attempt(async()=>{await flush();await preferencesPending;await api('preferences',{mode,sidebarWidth});await api('ready-close');}));
document.addEventListener('keydown',attempt(async e=>{if($('#modal').open||$('#icon-dialog').open||$('#repositories-dialog').open)return;if(e.ctrlKey){const key=e.key.toLowerCase();if(['s','n','b','i','e','\\'].includes(key)){e.preventDefault();if(key==='s')await flush();if(key==='n')await create(e.shiftKey?'folder':'note');if(key==='b')format('bold');if(key==='i')format('italic');if(key==='e')showMode(mode==='edit'?'preview':'edit');if(key==='\\')toggleSidebar(!$('#app').classList.contains('sidebar-hidden'));}}if(e.key==='Tab'&&e.target===editor){e.preventDefault();editor.setRangeText('  ',editor.selectionStart,editor.selectionEnd,'end');editor.dispatchEvent(new Event('input'));}}));
window.addEventListener('resize',resize);

let preferencesPending=Promise.resolve(),sidebarWidth=280,draggedPath='',dropBusy=false;
function savePreferences(values){preferencesPending=preferencesPending.catch(()=>{}).then(()=>api('preferences',values));preferencesPending.catch(e=>toast(e.message));}
function applySidebarWidth(){const width=Math.max(220,Math.min(sidebarWidth,480,innerWidth-360));document.documentElement.style.setProperty('--sidebar-width',width+'px');$('#sidebar-resize').setAttribute('aria-valuenow',Math.round(width));}
const grip=$('#sidebar-resize');
grip.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();grip.setPointerCapture(e.pointerId);document.body.classList.add('resizing');};
grip.onpointermove=e=>{if(!grip.hasPointerCapture(e.pointerId))return;sidebarWidth=Math.round(Math.max(220,Math.min(480,innerWidth-360,e.clientX)));applySidebarWidth();};
function endResize(e){if(grip.hasPointerCapture(e.pointerId))grip.releasePointerCapture(e.pointerId);document.body.classList.remove('resizing');savePreferences({sidebarWidth});resize();}
grip.onpointerup=endResize;grip.onpointercancel=endResize;
grip.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();sidebarWidth=e.key==='Home'?220:e.key==='End'?480:Math.max(220,Math.min(480,sidebarWidth+(e.key==='ArrowRight'?16:-16)));applySidebarWidth();savePreferences({sidebarWidth});};
grip.ondblclick=()=>{sidebarWidth=280;applySidebarWidth();savePreferences({sidebarWidth});};
window.addEventListener('resize',applySidebarWidth);
function clearDropIndicators(){document.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach(el=>el.classList.remove('drop-before','drop-after','drop-into'));}
function acceptsDrop(e){return [...e.dataTransfer.types].some(t=>t==='application/x-still-path'||t==='Files');}
function dropPosition(e,row,item){const box=row.getBoundingClientRect(),ratio=(e.clientY-box.top)/box.height;if(!draggedPath&&e.dataTransfer.types.includes('Files'))return item.type==='folder'?'into':'after';if(item.type==='folder'&&ratio>.24&&ratio<.76)return 'into';return ratio<.5?'before':'after';}
async function handleDrop(e,parent,anchor,position){
 const source=e.dataTransfer.getData('application/x-still-path');const imported=source?[]:window.fileDrop.paths([...e.dataTransfer.files]);
 if(dropBusy)return;dropBusy=true;try{await flush();
 if(source){const result=await api('place',source,parent,anchor,position);const next=result.path;const nextActive=active===source?next:active.startsWith(source+'\\')?next+active.slice(source.length):active;
 expanded=new Set([...expanded].map(p=>p===source?next:p.startsWith(source+'\\')?next+p.slice(source.length):p));if(parent)expanded.add(parent);await refresh();if(nextActive)await openNote(nextActive);else renderTree();}
 else if(imported.length){const result=await api('import',imported,parent);state.tree=result.tree;if(parent)expanded.add(parent);renderTree();toast(result.paths.length+' Markdown '+(result.paths.length===1?'note imported.':'notes imported.'));if(result.paths[0])await openNote(result.paths[0]);}
 }finally{dropBusy=false;draggedPath='';clearDropIndicators();}
}
for(const zone of [$('#tree'),$('#folder-label')]){zone.ondragover=e=>{if(!acceptsDrop(e)||e.target.closest('.tree-row'))return;e.preventDefault();clearDropIndicators();zone.classList.add('drop-into');e.dataTransfer.dropEffect=draggedPath?'move':'copy';};zone.ondragleave=e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drop-into');};zone.ondrop=attempt(async e=>{if(e.target.closest('.tree-row'))return;e.preventDefault();e.stopPropagation();clearDropIndicators();await handleDrop(e,'','','after');});}
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});document.addEventListener('drop',e=>{e.preventDefault();});
async function chooseIcon(item){if(item.type!=='note')return;const dialog=$('#icon-dialog');$('#icon-for').textContent=item.name;const grid=$('#icon-grid');grid.replaceChildren();for(const id of iconCatalog){const b=document.createElement('button');b.type='button';b.className='icon-choice';b.innerHTML=icon(id);b.title=id.charAt(0).toUpperCase()+id.slice(1);b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',state.icons?.[item.path]===id);b.onclick=attempt(async()=>{state.icons=await api('set-icon',item.path,id);renderTree();dialog.close();});grid.append(b);}$('#icon-default').onclick=attempt(async()=>{state.icons=await api('set-icon',item.path,null);renderTree();dialog.close();});$('#icon-close').onclick=()=>dialog.close();dialog.showModal();}
attempt(async()=>{state=await api('init');mode=state.mode||'edit';sidebarWidth=state.sidebarWidth||280;applySidebarWidth();renderTree();const note=flatten().find(n=>n.path===state.last)||flatten().find(n=>n.type==='note');if(note)await openNote(note.path);})();

function updateWindowControls(state){const maximized=state.maximized;const button=$('#maximize');button.title=maximized?'Restore down':'Maximize';button.setAttribute('aria-label',button.title);button.innerHTML=maximized?'<svg class="caption-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 3.5v-2h6.5V8h-2"/><rect x="1.5" y="4" width="6.5" height="6.5"/></svg>':'<svg class="caption-icon" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9"/></svg>';document.body.classList.toggle('window-maximized',maximized);}
window.stillEvents.windowState(updateWindowControls);
attempt(async()=>updateWindowControls(await api('window-state')))();

let updateState={status:'idle'},installingUpdate=false;
function renderUpdate(next){
 updateState=next;const button=$('#app-update');
 button.hidden=next.status==='disabled'&&next.reason==='development';
 button.disabled=['checking','downloading','installing'].includes(next.status)||installingUpdate;
 button.classList.toggle('update-ready',next.status==='ready');
 const labels={idle:'Check for updates',checking:'Checking for updates…',current:'Up to date · Check again',downloading:`Downloading update · ${next.percent}%`,ready:'Restart to update',installing:'Installing update…',error:'Retry update check',disabled:'Install for auto-updates'};
 $('#update-label').textContent=labels[next.status]||labels.idle;
 button.setAttribute('aria-label',labels[next.status]||labels.idle);
 button.title=next.message||(next.status==='ready'?`Install Still ${next.version} and restart`:next.status==='disabled'?'Open the latest Still installer on GitHub':'Updates from tsunsora/still on GitHub');
}
window.stillEvents.updateState(renderUpdate);
$('#app-update').onclick=attempt(async()=>{
 if(updateState.status==='disabled'){await api('external','https://github.com/tsunsora/still/releases/latest');return;}
 if(updateState.status==='ready'){
  installingUpdate=true;document.body.inert=true;renderUpdate(updateState);
  try{await flush();await preferencesPending;await api('preferences',{mode,sidebarWidth});await api('install-update');}
  finally{installingUpdate=false;document.body.inert=false;renderUpdate(updateState);}
 }else{const next=await api('check-updates');renderUpdate(next);if(next.status==='error')toast(next.message);}
});
attempt(async()=>renderUpdate(await api('update-state')))();
