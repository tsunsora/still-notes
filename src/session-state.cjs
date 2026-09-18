const path=require('node:path');
const number=(value,fallback=0)=>Number.isFinite(value)?Math.max(0,Math.round(value)):fallback;

function normalizeWorkspaceState(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const note=value.note||{};
 return {
  expanded:[...new Set((Array.isArray(value.expanded)?value.expanded:[]).filter(p=>typeof p==='string'&&p))],
  selectedFolder:typeof value.selectedFolder==='string'?value.selectedFolder:'',
  treeScroll:number(value.treeScroll),
  note:{path:typeof note.path==='string'?note.path:'',scroll:number(note.scroll),selectionStart:number(note.selectionStart),selectionEnd:number(note.selectionEnd),selectionDirection:['forward','backward'].includes(note.selectionDirection)?note.selectionDirection:'none'}
 };
}
function remapWorkspaceState(value,old,next){
 const state=normalizeWorkspaceState(value);if(!state)return null;
 const mapped=p=>p===old?next:p.startsWith(old+path.sep)?next+p.slice(old.length):p;
 state.expanded=state.expanded.map(mapped);state.selectedFolder=mapped(state.selectedFolder);state.note.path=mapped(state.note.path);
 return state;
}
function removeWorkspacePaths(value,removed){
 const state=normalizeWorkspaceState(value);if(!state)return null;
 const keep=p=>p!==removed&&!p.startsWith(removed+path.sep);
 state.expanded=state.expanded.filter(keep);
 if(!keep(state.selectedFolder))state.selectedFolder='';
 if(!keep(state.note.path))state.note=normalizeWorkspaceState({}).note;
 return state;
}

// Electron bounds/work areas are both device-independent pixels, including on
// mixed-DPI displays. Clamp restored bounds to a currently connected monitor.
function restoreWindowState(value,displays,primary){
 const saved=value?.bounds;
 const valid=saved&&['x','y','width','height'].every(key=>Number.isFinite(saved[key]))&&saved.width>0&&saved.height>0;
 let area=primary.workArea,best=0;
 if(valid)for(const display of displays){
  const work=display.workArea;
  const overlap=Math.max(0,Math.min(saved.x+saved.width,work.x+work.width)-Math.max(saved.x,work.x))*Math.max(0,Math.min(saved.y+saved.height,work.y+work.height)-Math.max(saved.y,work.y));
  if(overlap>best){best=overlap;area=work;}
 }
 const width=Math.min(area.width,Math.max(680,Math.round(valid?saved.width:1220)));
 const height=Math.min(area.height,Math.max(480,Math.round(valid?saved.height:820)));
 const x=valid&&best?Math.round(saved.x):area.x+Math.floor((area.width-width)/2);
 const y=valid&&best?Math.round(saved.y):area.y+Math.floor((area.height-height)/2);
 return {bounds:{x:Math.max(area.x,Math.min(x,area.x+area.width-width)),y:Math.max(area.y,Math.min(y,area.y+area.height-height)),width,height},maximized:value?.maximized===true};
}
module.exports={normalizeWorkspaceState,remapWorkspaceState,removeWorkspacePaths,restoreWindowState};
