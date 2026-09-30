const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/note-links.mjs');

test('resolves siblings, parent notes, dot segments and encoded names',async()=>{
 const {resolveNoteLink}=await load();
 assert.equal(resolveNoteLink('Folder\\A.md','./B.md'),'Folder\\B.md');
 assert.equal(resolveNoteLink('Folder\\A.md','../Root.md'),'Root.md');
 assert.equal(resolveNoteLink('Folder\\Nested\\A.md','../../Root.md'),'Root.md');
 assert.equal(resolveNoteLink('Folder\\A.md','../Folder/./B.md#heading'),'Folder\\B.md');
 assert.equal(resolveNoteLink('Folder\\A.md','My%20Note.md'),'Folder\\My Note.md');
 assert.equal(resolveNoteLink('Folder\\A.md','B.md?view=read#heading'),'Folder\\B.md');
});

test('rejects paths outside the notebook and links with nonlocal protocols',async()=>{
 const {resolveNoteLink}=await load();
 for(const href of ['../../Outside.md','/%2E%2E/Outside.md','file:///C:/Secret.md','https://example.com/A.md','//example.com/A.md','C:\\Secret.md','javascript:alert(1)','%2E%2E/%2E%2E/Outside.md','http%3A%2F%2Fexample.com/A.md','%ZZ','image.png',null]){
  assert.equal(resolveNoteLink('Folder\\A.md',href),null,String(href));
 }
});
