'use strict';
const BuilderDossierPDF=(()=>{
  function selection(options,zones){
    const ids=new Set(options.zoneIds||[]),known=new Set(zones.map(z=>z.id));
    if([...ids].some(id=>!known.has(id)))throw new Error('Une terrasse sélectionnée n’existe plus.');
    const selected=options.plans?zones.filter(z=>ids.has(z.id)):[];
    if(!options.quote&&!options.plans&&!options.three)throw new Error('Choisissez au moins un document.');
    if(options.plans&&!options.overview&&!selected.length)throw new Error('Choisissez une terrasse ou le plan d’ensemble.');
    return selected;
  }
  function addThree(doc,image,name,newPage){
    if(newPage)doc.addPage('a4','landscape');
    doc.setTextColor(22,51,61);doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('VUE 3D DU PROJET',10,14);doc.setFontSize(11);doc.text(doc.splitTextToSize(String(name),277).slice(0,2),10,23);
    const props=doc.getImageProperties(image),width=Math.min(277,154*props.width/props.height),height=width*props.height/props.width;
    doc.addImage(image,'PNG',(297-width)/2,34+(154-height)/2,width,height,undefined,'FAST');
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(100);doc.text('Vue de présentation. Dimensions et quantités : voir les plans cotés et le pré-devis.',10,199);
  }
  async function generate({quote,records=[],image,name}){
    if(!quote&&!records.length&&!image)throw new Error('Aucun document à générer.');
    await window.PlanZonePDF.load();
    const doc=quote?await window.BuilderQuotePDF.generate(quote):new window.jspdf.jsPDF({unit:'mm',format:'a4',orientation:'landscape',compress:true});
    if(records.length)await window.PlanZonePDF.append(doc,records,!quote);
    if(image)addThree(doc,image,name,!!quote||!!records.length);
    const count=doc.getNumberOfPages();for(let i=1;i<=count;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(100);const w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight();doc.text(`Dossier chantier - ${i} / ${count}`,w-10,h-4,{align:'right'});}
    return doc;
  }
  return {selection,addThree,generate};
})();
if(typeof window!=='undefined')window.BuilderDossierPDF=BuilderDossierPDF;
if(typeof window!=='undefined'&&document.getElementById('projectDossier')){
  const $=id=>document.getElementById(id),esc=BuilderUtils.escape;
  const dialog=document.createElement('dialog');dialog.id='dossierDialog';dialog.setAttribute('aria-labelledby','dossierTitle');
  dialog.innerHTML=`<h2 id="dossierTitle">Dossier PDF du chantier</h2><p>Choisissez les documents à réunir dans un seul PDF.</p><div class="dossier-options"><label><input id="dossierQuote" type="checkbox" checked> Devis (pré-devis actuel)</label><label><input id="dossierPlans" type="checkbox" checked> Plans du chantier</label><label><input id="dossierThree" type="checkbox" checked> Vue 3D actuelle</label></div><fieldset id="dossierPlanOptions"><legend>Plans à inclure</legend><label><input id="dossierOverview" type="checkbox" checked> Plan d’ensemble</label><p>Chaque terrasse cochée aura sa propre page détaillée, avec ses cotes et sa structure.</p><div class="import-toolbar"><button id="dossierAll" type="button" class="secondary">Tout sélectionner</button><button id="dossierNone" type="button" class="secondary">Tout désélectionner</button></div><div id="dossierZones"></div></fieldset><p class="small">La vue 3D reprend le cadrage actuel ; si elle n’a pas encore été ouverte, une vue générale est créée.</p><div class="import-toolbar"><button id="dossierGenerate" type="button">Générer le dossier PDF</button><button id="dossierClose" type="button" class="secondary">Fermer</button></div><p id="dossierStatus" role="status"></p><a id="dossierDownload" hidden>Télécharger à nouveau le PDF</a>`;
  document.body.append(dialog);let busy=false;
  function open(plansOnly=false){calculTerrasseMulti({silent:true});const zones=window.PlanChantier.getProjectSnapshot().zones;
    $('dossierQuote').checked=!plansOnly;$('dossierPlans').checked=true;$('dossierThree').checked=!plansOnly;$('dossierOverview').checked=!plansOnly;
    $('dossierZones').innerHTML=zones.map((z,i)=>`<div class="dossier-zone"><label><input type="checkbox" data-dossier-zone="${z.id}" checked> Z${i+1} · ${esc(z.nom)} · ${Number(z.surface).toFixed(2).replace('.',',')} m²</label><button type="button" class="secondary" data-dossier-single="${z.id}">PDF de cette terrasse</button></div>`).join('');
    $('dossierPlanOptions').hidden=false;$('dossierStatus').textContent='';$('dossierDownload').hidden=true;dialog.showModal();
  }
  async function run(singleId=null){if(busy)return;busy=true;const controls=[...dialog.querySelectorAll('input,button')];controls.forEach(e=>e.disabled=true);
    try{calculTerrasseMulti({silent:true});const snapshot=window.PlanChantier.getProjectSnapshot(),options=singleId!==null?{plans:true,zoneIds:[singleId]}:{quote:$('dossierQuote').checked,plans:$('dossierPlans').checked,three:$('dossierThree').checked,overview:$('dossierOverview').checked,zoneIds:[...dialog.querySelectorAll('[data-dossier-zone]:checked')].map(e=>Number(e.dataset.dossierZone))};
      const selected=BuilderDossierPDF.selection(options,snapshot.zones),records=[];
      if(options.plans&&options.overview)records.push(window.PlanChantier.getZoneExport(null));
      records.push(...selected.map(z=>window.PlanChantier.getZoneExport(z.id)));
      const quote=options.quote?window.BuilderCommercial.quote():null,name=$('projectName').value.trim()||'Projet terrasse';
      $('dossierStatus').textContent='Préparation du dossier…';const image=options.three?await window.Terrace3D.captureForDocument():null,doc=await BuilderDossierPDF.generate({quote,records,image,name});
      const link=$('dossierDownload');link.href=doc.output('datauristring');link.download=window.PlanZonePDF.filename(singleId!==null?`${name}-Z${records[0].index}-${records[0].name}`:`${name}-${options.quote||options.three?'dossier':'plans'}`)+'.pdf';link.hidden=false;link.click();$('dossierStatus').textContent=`PDF généré : ${doc.getNumberOfPages()} page(s)${selected.length?`, ${selected.length} terrasse(s) détaillée(s)`:''}.`;
    }catch(error){$('dossierDownload').hidden=true;$('dossierStatus').textContent='Export impossible : '+error.message;}
    finally{busy=false;controls.forEach(e=>e.disabled=false);}
  }
  $('projectDossier').onclick=()=>open();$('planExportChoice').onclick=()=>open(true);$('importExportPlans').onclick=()=>open(true);
  $('dossierGenerate').onclick=()=>run();$('dossierClose').onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('dossierPlans').onchange=()=>{$('dossierPlanOptions').hidden=!$('dossierPlans').checked;};
  $('dossierAll').onclick=()=>dialog.querySelectorAll('[data-dossier-zone]').forEach(e=>e.checked=true);$('dossierNone').onclick=()=>dialog.querySelectorAll('[data-dossier-zone]').forEach(e=>e.checked=false);
  $('dossierZones').onclick=event=>{const button=event.target.closest('[data-dossier-single]');if(button)run(Number(button.dataset.dossierSingle));};
}
