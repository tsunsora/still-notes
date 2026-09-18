const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {restoreWindowState,normalizeWorkspaceState,remapWorkspaceState,removeWorkspacePaths}=require('../src/session-state.cjs');
const primary={workArea:{x:0,y:0,width:1920,height:1040}},secondary={workArea:{x:-1440,y:0,width:1440,height:900}};
test('restores normal bounds and maximized state on the correct monitor',()=>{
 const saved={bounds:{x:-1300,y:80,width:1000,height:700},maximized:true};
 assert.deepEqual(restoreWindowState(saved,[primary,secondary],primary),saved);
});
test('removed monitors and oversized bounds fall back inside the available work area',()=>{
 const result=restoreWindowState({bounds:{x:6000,y:-3000,width:5000,height:4000},maximized:true},[primary],primary);
 assert.deepEqual(result,{bounds:{x:0,y:0,width:1920,height:1040},maximized:true});
 const partial=restoreWindowState({bounds:{x:-1600,y:700,width:900,height:600}},[primary,secondary],primary);
 assert.deepEqual(partial.bounds,{x:-1440,y:300,width:900,height:600});
});
test('invalid bounds use centered defaults and small displays remain reachable',()=>{
 assert.deepEqual(restoreWindowState({bounds:{x:NaN,y:20,width:'900',height:-1}},[primary],primary),{bounds:{x:350,y:110,width:1220,height:820},maximized:false});
 const small={workArea:{x:10,y:20,width:600,height:400}};
 assert.deepEqual(restoreWindowState(null,[small],small).bounds,small.workArea);
});
test('distinguishes a first session from an explicitly collapsed tree and sanitizes values',()=>{
 assert.equal(normalizeWorkspaceState(null),null);
 const result=normalizeWorkspaceState({expanded:['A','A',null,''],selectedFolder:42,treeScroll:Infinity,note:{path:'Note.md',scroll:12.6,selectionStart:-10,selectionEnd:23,selectionDirection:'backward'}});
 assert.deepEqual(result,{expanded:['A'],selectedFolder:'',treeScroll:0,note:{path:'Note.md',scroll:13,selectionStart:0,selectionEnd:23,selectionDirection:'backward'}});
 assert.deepEqual(normalizeWorkspaceState({expanded:[]}).expanded,[]);
});
test('renames and moves keep expanded descendants, selection, and reading position',()=>{
 const deep=path.join('Folder','Nested'),note=path.join(deep,'Note.md');
 const original={expanded:['Folder',deep,'Folder2'],selectedFolder:deep,treeScroll:80,note:{path:note,scroll:450,selectionStart:10,selectionEnd:20}};
 const moved=remapWorkspaceState(original,'Folder','Renamed');
 assert.deepEqual(moved.expanded,['Renamed',path.join('Renamed','Nested'),'Folder2']);
 assert.equal(moved.selectedFolder,path.join('Renamed','Nested'));assert.equal(moved.note.path,path.join('Renamed','Nested','Note.md'));assert.equal(moved.note.scroll,450);
 const removed=removeWorkspacePaths(original,'Folder');assert.deepEqual(removed.expanded,['Folder2']);assert.equal(removed.selectedFolder,'');assert.equal(removed.note.path,'');
 assert.equal(original.note.path,note,'Session migration must not mutate the old snapshot');
});
