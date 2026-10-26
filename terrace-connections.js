'use strict';
const TerraceConnections=(()=>{
  let stairs=[];
  const copy=x=>JSON.parse(JSON.stringify(x));
  function validate(input=[]){if(!Array.isArray(input)||input.length>20)throw new Error('Escaliers de liaison invalides.');const ids=new Set();for(const s of input){if(!s||typeof s.id!=='string'||!/^[\w-]{1,80}$/.test(s.id)||ids.has(s.id)||!Number.isInteger(s.fromZone)||!Number.isInteger(s.toZone)||s.fromZone===s.toZone)throw new Error('Liaison escalier invalide.');ids.add(s.id);for(const [key,min,max] of [['width',.2,5],['run',.1,20],['x',-1000,1000],['z',-1000,1000],['rotation',-3600,3600]])if(!Number.isFinite(s[key])||s[key]<min||s[key]>max)throw new Error('Escalier : '+key+' invalide.');if(!Array.isArray(s.products)||s.products.length>100)throw new Error('Catalogue escalier invalide.');for(const p of s.products){if(!p||typeof p.id!=='string'||p.id.length>500||!Number.isFinite(p.Prix_public_HT)||p.Prix_public_HT<0)throw new Error('Tarif escalier invalide.');if(typeof SupplierCatalogueCore!=='undefined')SupplierCatalogueCore.normalize(p);}}
    return copy(input);
  }
  function snapshot(){return copy(stairs);}
  function restore(input){stairs=validate(input||[]);}
  function calculate(zones){return stairs.map(s=>{
    const from=zones.find(z=>z.id===s.fromZone),to=zones.find(z=>z.id===s.toZone);
    if(!from||!to)throw new Error('Zone de départ ou d’arrivée de l’escalier absente.');
    const rise=((to.niveauMm||0)-(from.niveauMm||0))/1000;
    if(rise<=0)throw new Error('L’escalier doit relier un niveau bas à un niveau haut.');
    const E=typeof StaircaseEngine!=='undefined'?StaircaseEngine:null;if(!E)throw new Error('Moteur escalier indisponible.');
    const settings={...E.defaults(),...s.settings,totalRise:rise,totalLength:s.run,width:s.width,type:'straight',lengthKind:'horizontal'};
    const geometry=E.calculate(settings,s.products);if(!geometry.materials.complete)throw new Error('Escalier incomplet : '+geometry.materials.issues.map(i=>i.message).join(' '));
    const fixing=geometry.materials.items.find(i=>i.role==='bolts')?.product,limon=geometry.materials.items.find(i=>i.role==='stringers')?.product;
    if(fixing?.Screw_length_mm&&limon){const through=limon.Epaisseur_mm,receiving=Number(to.section.split('x')[1]),penetration=fixing.Screw_length_mm-through-3;if(penetration<30||penetration>receiving-5)throw new Error('Fixation des limons : longueur de vis incompatible avec l’épaisseur du support d’arrivée.');}
    const model=StaircaseModel.build(geometry),range=typeof Terrace3DModel!=='undefined'?Terrace3DModel.plotRange(from):{min:40};
    const joist=Number(from.section.split('x')[1]),base=(from.niveauMm||0)/1000+(from.hauteur?.finishedMm??(range.min+joist+from.lame.Epaisseur_mm))/1000;
    let placement={x:s.x,z:s.z,rotation:s.rotation};
    if(s.autoPosition&&typeof window!=='undefined'&&window.PlanChantier?.getPlacements){const p=window.PlanChantier.getPlacements().get(to.id);if(p){const point=PlanGeometry.transformPoint({x:to.geometry.outerLength/2-s.width/2,y:to.geometry.outerWidth+s.run},to.geometry,p);placement={x:point.x,z:point.y,rotation:90-p.rotation};}}
    return {...s,...placement,geometry,parts:model.parts,baseElevation:base,fromLevelMm:from.niveauMm||0,toLevelMm:to.niveauMm||0};
  });}
  function chooseScrew(products,through,receiving,entry,gap=3){
    if(![through,receiving,entry,gap].every(Number.isFinite)||through<=0||receiving<=5||entry<=0||entry>receiving-5||gap<0)throw new Error('Épaisseurs ou prise demandée incompatibles.');
    const compatible=products.filter(p=>p.type==='Vis structure'&&Number.isFinite(p.Screw_length_mm)&&p.Screw_length_mm-through-gap>=entry&&p.Screw_length_mm<=through+gap+receiving-5);
    compatible.sort((a,b)=>a.Screw_length_mm-b.Screw_length_mm||a.Prix_public_HT-b.Prix_public_HT);
    if(!compatible.length)throw new Error(`Aucune vis de structure compatible : longueur ${through+gap+entry} à ${through+gap+receiving-5} mm. Une vis trop longue traverserait la seconde pièce.`);
    return compatible[0];
  }
  function joistFixings(zones,stock,controls={}){
    if(controls.mode!=='auto')return null;
    const axis=controls.axis==='height'?'height':'side',entry=Number(controls.entry??30),perJoint=Number(controls.perJoint??4);
    if(!Number.isInteger(perJoint)||perJoint<1||perJoint>40)throw new Error('Nombre de vis par assemblage invalide.');
    const groups=[];
    for(const zone of zones){
      const joist=zone.lambourde,stockLength=joist?.Longueur_m;if(!(stockLength>0))throw new Error('Longueur de lambourde absente.');
      const layout=PlanGeometry.technicalLayout(zone,true);if(layout.light)throw new Error('Plan trop volumineux pour compter les aboutages.');
      const joints=layout.rails.reduce((sum,r)=>sum+Math.max(0,Math.ceil((Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y)-1e-8)/stockLength)-1),0);
      if(!joints)continue;
      const thickness=axis==='height'?Number(zone.section.split('x')[1]):Number(zone.section.split('x')[0]);
      const product=chooseScrew(stock,thickness,thickness,entry);
      groups.push({zoneId:zone.id,joints,quantity:joints*perJoint,product,penetrationMm:product.Screw_length_mm-thickness-3,axis,indicative:layout.indicative});
    }
    return {groups,joints:groups.reduce((n,g)=>n+g.joints,0),note:'Provision pour raccords avec renfort latéral ou assemblage superposé selon le réglage. Les renforts, appuis aux joints, charges et distances aux bords doivent être définis sur le plan d’assemblage.'};
  }
  function pricedExtras(zones,stock,controls){
    const links=calculate(zones),fixings=joistFixings(zones,stock,controls),orders=new Map(),items=[];
    const addFastener=(p,q,label)=>{const ref=p.id||(p.Reference?.startsWith('STRUCT_')?JSON.stringify([(p.Fournisseur||'').toLocaleLowerCase('fr'),p.Reference.slice(7)]):p.Reference);if(!orders.has(ref))orders.set(ref,{product:p,quantity:0,label});orders.get(ref).quantity+=q;};
    for(const link of links)for(const item of link.geometry.materials.items){const p=item.product;if(p.Pack_size)addFastener(p,item.usedQuantity??item.quantity,'Fixations escalier / structure');else items.push({id:'liaison-'+link.id+'-'+item.role,label:'Escalier · '+item.label,quantity:item.quantity,unitPriceHT:item.unitPriceHT,totalHT:item.totalHT,product:p});}
    for(const g of fixings?.groups||[])addFastener(g.product,g.quantity,'Vis assemblage lambourdes');
    for(const [ref,o] of orders){const pack=o.product.Pack_size||1,boxes=Math.ceil(o.quantity/pack),unit=(o.product.Prix_pro_HT??o.product.Prix_public_HT)*pack;
      items.push({id:'liaison-vis-'+encodeURIComponent(ref),label:o.label,quantity:boxes,unitPriceHT:unit,totalHT:Math.round(boxes*unit*100)/100,product:o.product,usedQuantity:o.quantity,boughtQuantity:boxes*pack,packSize:pack});}
    return {links,fixings,items,totalHT:items.reduce((n,i)=>n+i.totalHT,0)};
  }
  function createDefault(zones){
    const ordered=[...zones].sort((a,b)=>(a.niveauMm||0)-(b.niveauMm||0)),from=ordered[0],to=ordered.at(-1);if(!from||!to||from.id===to.id||(to.niveauMm||0)===(from.niveauMm||0))throw new Error('Créez deux zones de niveaux différents.');
    const p=typeof window!=='undefined'&&window.PlanChantier?.getPlacements?window.PlanChantier.getPlacements().get(to.id):{x:0,y:0,rotation:0};
    const products=copy(TerraceConnectionProducts),tread={id:'liaison-lame-'+from.lame.Reference,Fournisseur:from.lame.Fournisseur||'Catalogue chantier',Reference:from.lame.Reference,Famille:'LAME',Designation:from.lame.Designation,Epaisseur_mm:from.lame.Epaisseur_mm,Largeur_mm:from.lame.Largeur_mm,Longueur_m:from.lame.Longueur_m,Unite:'u',Prix_public_HT:from.lame.Prix_public_HT,Prix_pro_HT:null,Active:true,Sur_devis:false,Disponible:'A vérifier en agence'};
    if(from.lame.SupplierProductId)products.push(tread);const product=ref=>products.find(p=>p.Reference===ref),selectedTread=from.lame.SupplierProductId?tread:product('DBK-CAT-PIN-LANDES-28X160-3000');
    const link={autoPosition:true,id:'escalier-'+from.id+'-'+to.id,fromZone:from.id,toZone:to.id,width:1.2,run:1.5,x:p.x+to.geometry.outerLength/2-.6,z:p.y+to.geometry.outerWidth+1.5,rotation:90,products,settings:{stringerCount:3,fixings:{screwsPerBoard:6,boltsPerStringer:4},materials:{stringers:product('P2A072003-006').id,treads:selectedTread.id,screws:product('DBK-CAT-VIS-A4-5X70').id,bolts:product('WV010908').id}}};
    stairs=validate([link]);return link;
  }
  function planMarkup(zones,unit){let links;try{links=calculate(zones);}catch{return '';}
    return links.map(l=>{const f=l.geometry.flights[0];return `<g transform="translate(${l.x} ${l.z}) rotate(${-l.rotation})"><rect width="${l.run}" height="${l.width}" fill="#c8b59d" fill-opacity=".8" stroke="#6b4e32" stroke-width="${unit}"/>${Array.from({length:f.treadCount},(_,i)=>`<path d="M${i*f.going} 0V${l.width}" stroke="#6b4e32" stroke-width="${unit}"/>`).join('')}<text x="${l.run/2}" y="${l.width/2}" font-size="${10*unit}" text-anchor="middle" fill="#17212b">Escalier +${l.geometry.totalRise} m</text></g>`;}).join('');
  }
  return {validate,snapshot,restore,calculate,chooseScrew,joistFixings,pricedExtras,createDefault,planMarkup};
})();
if(typeof window!=='undefined')window.TerraceConnections=TerraceConnections;
if(typeof module!=='undefined')module.exports=TerraceConnections;
