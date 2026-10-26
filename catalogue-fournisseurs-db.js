'use strict';
const SupplierCatalogueDB=(()=>{
  let pending;
  function open(){return pending??=new Promise((resolve,reject)=>{const req=indexedDB.open('builders-terrasse-catalogues',1);req.onupgradeneeded=()=>{for(const name of ['suppliers','catalogProducts','catalogTextures']){const s=req.result.createObjectStore(name,{keyPath:'id'});if(name==='catalogProducts')s.createIndex('supplierId','supplierId');}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>{pending=null;reject(req.error);};req.onblocked=()=>{pending=null;reject(new Error('Fermez les autres fenêtres qui bloquent la base catalogue.'));};});}
  async function read(name,id){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(name),req=id===undefined?tx.objectStore(name).getAll():tx.objectStore(name).get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function commit(products,textures,mode='merge',progress=()=>{}){
    const [db,oldProducts,oldSuppliers]=await Promise.all([open(),read('catalogProducts'),read('suppliers')]);const old=new Map(oldProducts.map(p=>[p.id,p])),suppliers=new Map(oldSuppliers.map(s=>[s.id,s])),imported=new Set(products.map(p=>p.supplierId)),ids=new Set(products.map(p=>p.id)),now=new Date().toISOString(),writes=[];
    if(mode==='replace')for(const p of oldProducts)if(imported.has(p.supplierId)&&!ids.has(p.id))writes.push({...p,Active:false});
    for(const p of products){const previous=old.get(p.id),history=(previous?.priceHistory||[]).slice(-19),tariff=SupplierCatalogueCore.price(p),before=previous&&SupplierCatalogueCore.price(previous);if(tariff&&(!before||before.value!==tariff.value||before.source!==tariff.source))history.push({date:p.Date_tarif||now,priceHT:tariff.value,source:tariff.source});writes.push({...p,importedAt:now,priceHistory:history,textureBinding:p.textureBinding===undefined?previous?.textureBinding:p.textureBinding});suppliers.set(p.supplierId,{...(suppliers.get(p.supplierId)||{}),id:p.supplierId,name:p.Fournisseur,active:true,importedAt:now,dateTarif:p.Date_tarif||''});}
    const allWrites=[...textures.map(t=>['catalogTextures',t]),...writes.map(p=>['catalogProducts',p]),...[...suppliers.values()].filter(s=>imported.has(s.id)).map(s=>['suppliers',s])];
    await new Promise((resolve,reject)=>{const tx=db.transaction(['suppliers','catalogProducts','catalogTextures'],'readwrite');let done=0,index=0;tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Import annulé : ancienne base conservée.'));function batch(){try{const end=Math.min(index+200,allWrites.length);for(;index<end;index++){const [store,value]=allWrites[index],req=tx.objectStore(store).put(value);req.onsuccess=()=>{done++;if(done%200===0||done===allWrites.length)progress(done,allWrites.length);if(done===end&&index<allWrites.length)batch();};}}catch(error){tx.abort();reject(error);}}batch();});return products.length;
  }
  async function supplierAction(id,action){const db=await open(),supplier=await read('suppliers',id);if(!supplier)return;const products=await read('catalogProducts');await new Promise((resolve,reject)=>{const tx=db.transaction(['suppliers','catalogProducts'],'readwrite');if(action==='delete'){tx.objectStore('suppliers').delete(id);for(const p of products)if(p.supplierId===id)tx.objectStore('catalogProducts').delete(p.id);}else tx.objectStore('suppliers').put({...supplier,active:!supplier.active});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function binding(supplierId,scope,value,textureBinding,textures=[]){const db=await open(),supplier=await read('suppliers',supplierId);if(!supplier)throw new Error('Fournisseur absent.');const bindings=(supplier.bindings||[]).filter(b=>!(b.scope===scope&&b.value===value));if(textureBinding)bindings.push({scope,value,binding:textureBinding});await new Promise((resolve,reject)=>{const tx=db.transaction(['suppliers','catalogTextures'],'readwrite');tx.objectStore('suppliers').put({...supplier,bindings});for(const t of textures)tx.objectStore('catalogTextures').put(t);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function seedBuiltin(products,version){
    const marker='builders-builtin-catalogue-'+version;
    try{if(localStorage.getItem(marker)==='done')return;}catch{}
    const [db,existing,knownSuppliers]=await Promise.all([open(),read('catalogProducts'),read('suppliers')]);
    const ids=new Set(existing.map(p=>p.id)),suppliers=new Map(knownSuppliers.map(s=>[s.id,s]));
    await new Promise((resolve,reject)=>{const tx=db.transaction(['suppliers','catalogProducts'],'readwrite');
      for(const p of products)if(!ids.has(p.id))tx.objectStore('catalogProducts').put({...p,builtinVersion:version});
      for(const id of new Set(products.map(p=>p.supplierId))){const old=suppliers.get(id);if(old?.builtinVersion===version)continue;tx.objectStore('suppliers').put({...old,id,name:products.find(p=>p.supplierId===id).Fournisseur,active:old?.active??true,builtinVersion:version,dateTarif:old?.dateTarif||products.find(p=>p.supplierId===id).Date_tarif});}
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Ajout du catalogue intégré annulé.'));
    });
    try{localStorage.setItem(marker,'done');}catch{}
  }
  return {open,read,commit,supplierAction,binding,seedBuiltin};
})();
if(typeof window!=='undefined')window.SupplierCatalogueDB=SupplierCatalogueDB;
if(typeof module!=='undefined')module.exports=SupplierCatalogueDB;
