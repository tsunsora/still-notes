export function resolveNoteLink(active,href){
 if(typeof href!=='string')return null;
 let relative;
 try{relative=decodeURIComponent(href.split('#')[0].split('?')[0]).replaceAll('\\','/');}catch{return null;}
 if(!relative||relative.startsWith('/')||/^[a-z][a-z\d+.-]*:/i.test(relative))return null;
 const parts=active.replaceAll('\\','/').split('/').slice(0,-1);
 for(const part of relative.split('/')){
  if(!part||part==='.')continue;
  if(part==='..'){if(!parts.length)return null;parts.pop();}
  else parts.push(part);
 }
 const target=parts.join('\\');
 return /\.md$/i.test(target)?target:null;
}
