'use strict';
// Shared persistence: same database and records as the historical TerraceProjects.
const BuilderProjectStore=(()=>{
 let pending;
 const shared=()=>typeof window!=='undefined'&&window.BuilderDriveMode===true;
 function drive(){if(!window.BuilderDriveStore)throw new Error('Connexion Drive indisponible. Rouvrez le lien partagé.');return window.BuilderDriveStore;}
 function putRow(row){return shared()?drive().put(row):storage('readwrite',s=>s.put(row));}
 function listRows(){return shared()?drive().list():storage('readonly',s=>s.getAll());}
 function getRow(id){return shared()?drive().get(id):storage('readonly',s=>s.get(id));}
 function open(){return pending??=new Promise((resolve,reject)=>{const r=indexedDB.open('builders-terrasse-projets',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{pending=null;reject(r.error);};});}
 async function storage(mode,action){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('projects',mode),r=action(tx.objectStore('projects'));let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Enregistrement interrompu.'));});}
 function createSaveSession({put=putRow,uuid=()=>crypto.randomUUID()}={}){
   let id=null,handle=null;
   const session={get id(){return id;},get handle(){return handle;},use(nextId=null,nextHandle=null,revision=null){id=nextId;handle=nextHandle;if(shared())drive().use(nextId,revision);},permission(){return handle?.requestPermission?handle.requestPermission({mode:'readwrite'}).catch(()=> 'denied'):Promise.resolve('granted');},
     async save(data,{asNew=false,fileHandle,permission='granted'}={}){
       const nextId=asNew?uuid():id||uuid(),nextHandle=fileHandle===undefined?(asNew?null:handle):fileHandle,portable={...data,projectId:nextId};
       await put({id:nextId,data:portable,...(nextHandle?{fileHandle:nextHandle}:{})});id=nextId;handle=nextHandle;
       let fileUpdated=false,fileError=null;
       if(handle){try{if(permission!=='granted')throw new Error('Accès au fichier refusé.');const writer=await handle.createWritable();try{await writer.write(JSON.stringify(portable,null,2));await writer.close();fileUpdated=true;}catch(error){await writer.abort?.();throw error;}}catch(error){fileError=error.message;}}
       return {id,data:portable,fileUpdated,fileError,shared:shared()};
     }
   };return session;
 }
 function askCopyName(name,{copy=true}={}){return new Promise(resolve=>{const dialog=document.getElementById('projectSaveAsDialog'),input=document.getElementById('projectSaveAsName');let result=null;document.getElementById('projectSaveAsTitle').textContent=copy?'Enregistrer sous…':'Enregistrer le projet';const help=dialog.querySelector('p');if(help)help.textContent='Ce navigateur ne permet pas de choisir directement un dossier. Le fichier sera téléchargé selon ses paramètres. Pour choisir le dossier et mettre à jour le même fichier, ouvrez le calculateur dans Chrome ou Edge. Les prochains Enregistrer mettront à jour la copie navigateur.';document.getElementById('projectSaveAsAccept').textContent='Télécharger le projet';input.value=(name.slice(0,90)+(copy?' — copie':'')).slice(0,100);input.setCustomValidity('');document.getElementById('projectSaveAsAccept').onclick=()=>{const value=input.value.trim();input.setCustomValidity(value?'':'Donnez un nom à la nouvelle sauvegarde.');if(!input.reportValidity())return;result=value;dialog.close();};document.getElementById('projectSaveAsCancel').onclick=()=>dialog.close();input.oninput=()=>input.setCustomValidity('');input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();document.getElementById('projectSaveAsAccept').click();}};dialog.addEventListener('close',()=>resolve(result),{once:true});dialog.showModal();input.focus();input.select();});}
 function pickProjectFile(name,extension){if(typeof window.showSaveFilePicker!=='function')return null;return window.showSaveFilePicker({suggestedName:(name.replace(/[^a-z0-9À-ÿ _-]/gi,'').trim()||'projet')+extension,types:[{description:'Projet SA BUILDERS',accept:{'application/json':['.json']}}]});}
 // Must start the picker before capture (which may render plans asynchronously).
 async function saveProject(session,{name,extension,asNew=false,capture,download}){
   if(shared()){
     let chosenName=name;
     if(asNew){chosenName=await askSharedName(name);if(chosenName===null)return null;}
     const data=await capture();data.name=chosenName;
     return session.save(data,{asNew,fileHandle:null});
   }
   const picker=(!session.handle||asNew)?pickProjectFile(name,extension):null;
   const permission=picker||asNew?null:session.permission();
   let handle;
   try {handle=picker?await picker:(asNew?null:session.handle);}catch(error){if(error.name==='AbortError')return null;throw error;}
   let chosenName=null;
   if(!handle&&(!session.id||asNew)){
     chosenName=await askCopyName(name,{copy:asNew});if(chosenName===null)return null;
   }
   const data=await capture();
   if(chosenName)data.name=chosenName;
   if(handle&&(asNew||picker)){const fileName=handle.name;if(fileName?.endsWith(extension))data.name=fileName.slice(0,-extension.length).slice(0,100)||data.name;}
   const result=await session.save(data,{asNew,fileHandle:handle,permission:permission?await permission:'granted'});
   if(!handle&&chosenName!==null)download(result.data);
   return {...result,downloaded:!handle&&chosenName!==null,fileName:handle?.name||null};
 }
 function saveMessage(result){
   if(result.shared)return 'Projet complet enregistré sur Drive. La version partagée est à jour.';
   if(result.fileUpdated)return 'Projet complet enregistré dans le fichier « '+result.fileName+' ». Enregistrer met à jour ce fichier ; Enregistrer sous… choisit un autre nom ou dossier.';
   if(result.fileError)return 'Copie navigateur enregistrée. Échec de mise à jour du fichier PC : '+result.fileError;
   return result.downloaded?'Projet complet téléchargé et copie navigateur enregistrée. Ce navigateur ne permet pas de réécrire directement le fichier téléchargé.':'Projet complet enregistré dans ce navigateur. Pour télécharger une nouvelle copie, utilisez Enregistrer sous…';
 }
 function askSharedName(name){return new Promise(resolve=>{const dialog=document.getElementById('projectSaveAsDialog'),input=document.getElementById('projectSaveAsName');let result=null;document.getElementById('projectSaveAsTitle').textContent='Créer une copie partagée';const help=dialog.querySelector('p');if(help)help.textContent='La version actuelle reste sur Drive. Vos modifications seront enregistrées dans un nouveau projet partagé.';document.getElementById('projectSaveAsAccept').textContent='Enregistrer la copie sur Drive';input.value=(name.slice(0,90)+' — copie').slice(0,100);input.setCustomValidity('');document.getElementById('projectSaveAsAccept').onclick=()=>{const value=input.value.trim();input.setCustomValidity(value?'':'Donnez un nom à la copie.');if(!input.reportValidity())return;result=value;dialog.close();};document.getElementById('projectSaveAsCancel').onclick=()=>dialog.close();input.oninput=()=>input.setCustomValidity('');input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();document.getElementById('projectSaveAsAccept').click();}};dialog.addEventListener('close',()=>resolve(result),{once:true});dialog.showModal();input.focus();input.select();});}
 return {createSaveSession,askCopyName,pickProjectFile,saveProject,saveMessage,storage,shared,list:listRows,get:getRow,put:putRow};
})();
if(typeof window!=='undefined')window.BuilderProjectStore=BuilderProjectStore;
if(typeof module!=='undefined')module.exports=BuilderProjectStore;
