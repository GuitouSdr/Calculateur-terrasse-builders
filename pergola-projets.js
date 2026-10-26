'use strict';
const PergolaProjects=(()=>{
 const fields=['typePergola','largeur','avancee','hauteurAvant','hauteurMur','toiture','formeToit','nbPoteauxFace','nbPoteauxArriere','woodSelection','woodEssence','woodLoad','woodE','woodStress','sectionPoteau','sectionPoutre','sectionChevron','entraxeChevron','platines','sabots','finitions','marge','pdfCompany','pdfClient','pdfProject','pdfSite','pdfReference','pdfVat','pdfNotes'];
 const copy=v=>JSON.parse(JSON.stringify(v));
 function validate(data){
   if(!data||data.kind!=='builders-pergola'||data.moduleType!=='pergola'||data.version!==1||typeof data.name!=='string'||!data.name.trim()||data.name.length>100)throw new Error('Fichier projet Pergola invalide.');
   if(data.projectId!==undefined&&(typeof data.projectId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(data.projectId)))throw new Error('Identifiant de sauvegarde invalide.');
   if(!data.controls||typeof data.controls!=='object'||Array.isArray(data.controls)||Object.keys(data.controls).length!==fields.length||fields.some(id=>typeof data.controls[id]!=='string'||data.controls[id].length>1500)||Object.keys(data.controls).some(id=>!fields.includes(id)))throw new Error('Réglages de pergola invalides.');
   const enums={typePergola:['adossee','autoportee'],toiture:['ajouree','polycarbonate','bacacier'],formeToit:['mono','plate'],woodSelection:['auto','manual'],woodEssence:['all','douglas','pin'],platines:['oui','non'],sabots:['oui','non'],finitions:['brut','sature','lasure']};
   for(const [id,values] of Object.entries(enums))if(!values.includes(data.controls[id]))throw new Error('Choix invalide : '+id);
   if(!Array.isArray(data.catalogue)||!data.catalogue.length||data.catalogue.length>2000)throw new Error('Catalogue pergola invalide.');
   const refs=new Set();for(const p of data.catalogue){
     if(!p||typeof p.Reference!=='string'||!p.Reference||p.Reference.length>500||refs.has(p.Reference)||typeof p.Designation!=='string'||p.Designation.length>500||!Number.isFinite(p.Prix_public_HT)||p.Prix_public_HT<0||p.Prix_public_HT>1000000)throw new Error('Matériau pergola invalide.');
     refs.add(p.Reference);for(const [key,value] of Object.entries(p)){if(key==='Usages'&&Array.isArray(value)&&value.length<=10&&value.every(v=>['Poteau','Poutre','Chevron'].includes(v)))continue;if(['__proto__','constructor','prototype'].includes(key)||!(value===null||typeof value==='boolean'||typeof value==='string'&&value.length<=2000||typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<10000000))throw new Error('Donnée matériau invalide.');}
     for(const key of ['Longueur_m','Largeur_mm','Hauteur_mm'])if(p[key]!==undefined&&(!Number.isFinite(p[key])||p[key]<=0))throw new Error('Dimension matériau invalide.');
   }
   for(const id of ['sectionPoteau','sectionPoutre','sectionChevron'])if(!refs.has(data.controls[id]))throw new Error('Référence sélectionnée absente du catalogue.');
   if(!Array.isArray(data.manualChoices)||data.manualChoices.some(id=>!['nbPoteauxFace','nbPoteauxArriere','sectionPoteau','sectionPoutre','sectionChevron'].includes(id)))throw new Error('Choix manuels invalides.');
   return data;
 }
 function capture(){const data={kind:'builders-pergola',moduleType:'pergola',version:1,name:document.getElementById('projectName').value.trim()||'Projet pergola',savedAt:new Date().toISOString(),controls:Object.fromEntries(fields.map(id=>[id,String(document.getElementById(id).value)])),catalogue:copy(catalogue),manualChoices:[...choixManuelsPergola]};validate(data);return data;}
 function restore(data){validate(data);catalogue.splice(0,catalogue.length,...copy(data.catalogue));for(const [id,family] of [['sectionPoteau','Poteau'],['sectionPoutre','Poutre'],['sectionChevron','Chevron']])populateSelect(id,getByFamily(family),formatArticlePergola);for(const id of fields)document.getElementById(id).value=data.controls[id];choixManuelsPergola.clear();for(const id of data.manualChoices)choixManuelsPergola.add(id);document.getElementById('projectName').value=data.name;calculPergola();}
 function mount(){const $=id=>document.getElementById(id),session=BuilderProjectStore.createSaveSession(),defaults=capture();let busy=false;
   const status=text=>$('projectStatus').textContent=text;
   const download=data=>{const a=$('projectDownload');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,2));a.download=data.name.replace(/[^a-z0-9À-ÿ _-]/gi,'')+'.pergola.json';a.hidden=false;a.click();};
   async function list(){const rows=(await BuilderProjectStore.list()).filter(r=>r.data.kind==='builders-pergola');$('projectList').replaceChildren(new Option('Choisir un projet…',''));for(const row of rows.sort((a,b)=>String(b.data.savedAt).localeCompare(String(a.data.savedAt))))$('projectList').add(new Option(row.data.name,row.id));$('projectList').value=session.id||'';}
   async function run(fn){if(busy)return;busy=true;const ids=['projectSave','projectSaveAs','projectNew','projectOpen','projectFile'];for(const id of ids)$(id).disabled=true;try{await fn();}catch(error){status('Impossible : '+error.message);}finally{busy=false;for(const id of ids)$(id).disabled=false;}}
   async function save(asNew=false){const result=await BuilderProjectStore.saveProject(session,{name:$('projectName').value.trim()||'Projet pergola',extension:'.pergola.json',asNew,capture,download});if(!result)return;$('projectName').value=result.data.name;await list();status(BuilderProjectStore.saveMessage(result));}
   function confirmReplace(message){return new Promise(resolve=>{const dialog=$('projectConfirmDialog');let accepted=false;$('projectConfirmText').textContent=message;$('projectConfirmAccept').onclick=()=>{accepted=true;dialog.close();};$('projectConfirmCancel').onclick=()=>dialog.close();dialog.addEventListener('close',()=>resolve(accepted),{once:true});dialog.showModal();});}
   $('projectSave').onclick=()=>run(()=>save());$('projectSaveAs').onclick=()=>run(()=>save(true));
   $('projectOpen').onclick=()=>run(async()=>{const row=await BuilderProjectStore.get($('projectList').value);if(!row)throw new Error('Choisissez un projet enregistré.');validate(row.data);if(!await confirmReplace('Ouvrir ce projet ? Les modifications non enregistrées seront remplacées.'))return;restore(row.data);session.use(row.id,row.fileHandle||null,row.revision);status('Projet « '+row.data.name+' » rouvert avec ses réglages, tarifs et pré-devis.');});
   $('projectFile').onchange=e=>run(async()=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>15*1024*1024)throw new Error('Fichier limité à 15 Mo.');const data=JSON.parse(await file.text());validate(data);if(!await confirmReplace('Ouvrir ce fichier projet ? Les modifications non enregistrées seront remplacées.'))return;restore(data);session.use(data.projectId||null);$('projectDownload').hidden=true;await list();status('Projet « '+data.name+' » rouvert. Enregistrer permet de choisir son fichier sur le PC.');}finally{e.target.value='';}});
   $('projectNew').onclick=()=>run(async()=>{if(!await confirmReplace('Créer un nouveau chantier ? Enregistrez le projet actuel pour conserver vos modifications.'))return;restore(copy(defaults));session.use();$('projectName').value='Nouveau projet pergola';$('projectDownload').hidden=true;await list();status('Nouveau chantier prêt.');});
   list().catch(error=>status('Liste des projets indisponible : '+error.message));return {capture,restore,save:()=>run(()=>save()),saveAs:()=>run(()=>save(true))};
 }
 return {fields,validate,capture,restore,mount};
})();
if(typeof window!=='undefined')window.PergolaProjects=PergolaProjects.mount();
if(typeof module!=='undefined')module.exports=PergolaProjects;
