const {contextBridge,ipcRenderer,webUtils}=require('electron');
const names=['init','choose','switch-repository','remove-repository','read','write','create','rename','move','place','set-icon','import','preferences','trash','reveal','external','window','window-state','ready-close','update-state','check-updates','resume-updates','install-update'];
contextBridge.exposeInMainWorld('still',Object.fromEntries(names.map(name=>[name,(...args)=>ipcRenderer.invoke(name,...args)])));
contextBridge.exposeInMainWorld('stillEvents',{beforeClose:cb=>ipcRenderer.on('before-close',()=>cb()),windowState:cb=>ipcRenderer.on('window-state',(_event,state)=>cb(state)),updateState:cb=>ipcRenderer.on('update-state',(_event,state)=>cb(state))});
contextBridge.exposeInMainWorld('fileDrop',{paths:files=>Array.from(files,file=>webUtils.getPathForFile(file))});
