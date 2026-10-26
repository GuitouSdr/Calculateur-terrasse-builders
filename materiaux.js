'use strict';
const BuilderMaterials=(()=>{
  const key='builders.terrasse.materiaux.v1',types=['Lame','Lambourde','Plot','Vis','Bande bitume','Géotextile'],sections=['45x70','45x95','63x75','63x100','75x150'];
  let storageError='';
  function number(value,label,min,max){const raw=String(value??'').trim(),n=Number(raw.replace(',','.'));if(!raw||!Number.isFinite(n)||n<min||n>max)throw new Error(`${label} : valeur entre ${min} et ${max}.`);return n;}
  function article(data,catalogue=[]){
    const type=data.type;if(!types.includes(type))throw new Error('Choisissez une famille de matériau.');
    const ref=String(data.Reference??'').trim(),name=String(data.Designation??'').trim(),supplier=String(data.Fournisseur??'').trim();
    if(!/^[a-z0-9][a-z0-9_. -]{0,79}$/i.test(ref))throw new Error('Référence : 1 à 80 caractères, lettres, chiffres, espaces, tirets ou points.');
    if(catalogue.some(a=>a.Reference.toLowerCase()===ref.toLowerCase()))throw new Error('Cette référence existe déjà.');
    if(!name||name.length>160||supplier.length>160)throw new Error('Renseignez une désignation (160 caractères maximum).');
    const a={Famille:['Bande bitume','Géotextile'].includes(type)?'Accessoire':type,Reference:ref,Designation:name,Fournisseur:supplier,Unite:type==='Bande bitume'?'ml':type==='Géotextile'?'m2':'u',Prix_public_HT:number(data.Prix_public_HT,'Prix HT',0,100000),Prix_pro_HT:null,Epaisseur_mm:null,Largeur_mm:null,Longueur_m:null,personnalise:true,type};
    if(type==='Lame'){a.Epaisseur_mm=number(data.Epaisseur_mm,'Épaisseur (mm)',1,200);a.Largeur_mm=number(data.Largeur_mm,'Largeur (mm)',10,1000);a.Longueur_m=number(data.Longueur_m,'Longueur (m)',.1,30);}
    if(type==='Lambourde'){if(!sections.includes(data.Section))throw new Error('Choisissez une section prise en charge.');[a.Epaisseur_mm,a.Largeur_mm]=data.Section.split('x').map(Number);a.Section=data.Section;a.Longueur_m=number(data.Longueur_m,'Longueur (m)',.1,30);}
    if(type==='Plot'){a.Hauteur_min_mm=number(data.Hauteur_min_mm,'Hauteur minimale (mm)',1,2000);a.Hauteur_max_mm=number(data.Hauteur_max_mm,'Hauteur maximale (mm)',a.Hauteur_min_mm,2000);}
    return a;
  }
  function decode(text,catalogue){const data=JSON.parse(text);if(data.version!==1||!Array.isArray(data.articles)||data.articles.length>500)throw new Error('Fichier de catalogue invalide (500 références maximum).');const added=[];for(const row of data.articles)added.push(article(row,[...catalogue,...added]));return added;}
  function encode(articles){return JSON.stringify({version:1,articles:articles.filter(a=>a.personnalise)},null,2);}
  function persist(catalogue,store=window.localStorage){store.setItem(key,encode(catalogue));}
  function add(catalogue,data,store){const a=article(data,catalogue);if(catalogue.filter(a=>a.personnalise).length>=500)throw new Error('Limite de 500 références personnelles.');persist([...catalogue,a],store);catalogue.push(a);return a;}
  function restore(catalogue){try{const text=window.localStorage.getItem(key);if(text)catalogue.push(...decode(text,catalogue));}catch(error){storageError='Catalogue personnel non chargé : '+error.message;}}
  function mount(catalogue,refresh,select){
    const $=id=>document.getElementById(id),dialog=$('materialDialog'),form=$('materialForm'),status=$('materialStatus');let removed=null;
    const message=text=>{status.textContent=text;};
    function rows(){const root=$('materialList');root.replaceChildren();for(const a of catalogue.filter(a=>a.personnalise)){const row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');label.textContent=`${a.Reference} · ${a.Designation} · ${a.Prix_public_HT.toFixed(2).replace('.',',')} €/${a.Unite}`;button.type='button';button.className='secondary';button.textContent='Retirer';button.setAttribute('aria-label','Retirer '+a.Reference);button.onclick=()=>{try{persist(catalogue.filter(x=>x!==a));catalogue.splice(catalogue.indexOf(a),1);removed=a;$('materialUndo').hidden=false;refresh();rows();message('Référence retirée. Vous pouvez annuler.');}catch(e){message('Enregistrement impossible : '+e.message);}};row.className='material-row';row.append(label,button);root.append(row);}if(!root.children.length)root.textContent='Aucune référence personnelle pour le moment.';}
    function fields(){const type=$('materialType').value;for(const e of form.querySelectorAll('[data-material-types]')){const visible=e.dataset.materialTypes.split('|').includes(type);e.hidden=!visible;for(const input of e.querySelectorAll('input,select'))input.disabled=!visible;}$('materialPriceUnit').textContent=type==='Bande bitume'?'€/mètre linéaire':type==='Géotextile'?'€/m²':'€/pièce';}
    $('materialOpen').onclick=()=>{rows();fields();message(storageError||'');dialog.showModal();};$('materialClose').onclick=()=>dialog.close();$('materialType').onchange=fields;
    form.onsubmit=event=>{event.preventDefault();try{const a=add(catalogue,{type:$('materialType').value,Reference:$('materialReference').value,Designation:$('materialName').value,Fournisseur:$('materialSupplier').value,Prix_public_HT:$('materialPrice').value,Epaisseur_mm:$('materialThickness').value,Largeur_mm:$('materialWidth').value,Longueur_m:$('materialLength').value,Section:$('materialSection').value,Hauteur_min_mm:$('materialMinHeight').value,Hauteur_max_mm:$('materialMaxHeight').value});refresh();select(a);rows();message(`${a.Reference} ajoutée, sélectionnée et enregistrée dans ce navigateur.`);$('materialReference').value='';$('materialName').value='';}catch(e){message(e.message);}};
    $('materialUndo').onclick=()=>{try{if(removed){const a=add(catalogue,removed);removed=null;$('materialUndo').hidden=true;refresh();select(a);rows();message('Référence restaurée.');}}catch(e){message(e.message);}};
    $('materialExport').onclick=()=>{const url=URL.createObjectURL(new Blob([encode(catalogue)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='mes-materiaux-terrasse.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $('materialImport').onchange=async event=>{const input=event.target;try{const file=input.files?.[0];if(!file)return;if(file.size>1000000)throw new Error('Fichier trop volumineux.');const added=decode(await file.text(),catalogue);if(catalogue.filter(a=>a.personnalise).length+added.length>500)throw new Error('Limite de 500 références personnelles.');persist([...catalogue,...added]);catalogue.push(...added);refresh();rows();message(`${added.length} référence(s) importée(s).`);}catch(e){message(e.message);}input.value='';};
    if(storageError)$('materialStorageNote').textContent=storageError;
  }
  return {article,decode,encode,add,persist,restore,mount,key};
})();
