'use strict';
const SupplierCatalogueImport=(()=>{
  const pause=()=>new Promise(r=>setTimeout(r,0));
  function path(value){const p=String(value).replace(/\\/g,'/').replace(/^\.\//,'');if(p.startsWith('/')||p.split('/').includes('..')||p.includes('\0'))throw new Error('Chemin ZIP invalide.');return p;}
  async function hash(bytes){const value=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(value)].map(n=>n.toString(16).padStart(2,'0')).join('');}
  async function read(file,progress=()=>{}){
    if(file.size>150*1024*1024)throw new Error('Fichier limité à 150 Mo.');let bytes=new Uint8Array(await file.arrayBuffer()),name=file.name,assets={},sheets=null;
    if(/\.zip$/i.test(name)){progress('Lecture du ZIP…');assets=await new Promise((resolve,reject)=>{let total=0;fflate.unzip(bytes,{filter(entry){path(entry.name);total+=entry.originalSize;if(total>300*1024*1024||entry.originalSize>80*1024*1024)throw new Error('ZIP décompressé trop volumineux.');return /\.(csv|xlsx|png|jpe?g)$/i.test(entry.name);}},(error,result)=>error?reject(error):resolve(result));});const names=Object.keys(assets).filter(n=>/\.(csv|xlsx)$/i.test(n)&&!n.includes('__MACOSX/'));if(names.length!==1)throw new Error('Le ZIP doit contenir un seul catalogue CSV ou XLSX (trouvé : '+names.length+').');name=names[0];bytes=assets[name];}
    if(/\.xlsx$/i.test(name)){progress('Lecture du classeur Excel…');await pause();const workbook=XLSX.read(bytes,{type:'array',cellDates:false,dense:true});sheets=workbook.SheetNames.map(n=>({name:n,rows:XLSX.utils.sheet_to_json(workbook.Sheets[n],{header:1,defval:'',raw:false,blankrows:false})})).filter(s=>s.rows.length);if(!sheets.length)throw new Error('Classeur vide.');}
    else if(/\.csv$/i.test(name))sheets=[{name:'CSV',rows:SupplierCatalogueCore.csv(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}];else throw new Error('Formats acceptés : CSV, XLSX et ZIP.');
    for(const s of sheets){if(s.rows.length>10001)throw new Error('Limite de 10 000 lignes par feuille.');if(!s.rows.length||s.rows[0].length>100)throw new Error('En-tête absent ou plus de 100 colonnes.');}
    return {source:file.name,sheets,assets};
  }
  async function preview(input,sheetIndex,mapping,existing,progress=()=>{}){
    const sheet=input.sheets[sheetIndex],rows=sheet.rows.slice(1),products=[],errors=[],warnings=[],seen=new Set(),textures=new Map(),textureCache=new Map();let inserted=0,updated=0;
    const fields=mapping.filter(Boolean);if(new Set(fields).size!==fields.length)throw new Error('Un champ logiciel ne peut pas recevoir deux colonnes.');for(const field of ['Fournisseur','Reference','Famille','Designation'])if(!fields.includes(field))throw new Error('Colonne requise non associée : '+field);
    async function texture(value){if(!value)return null;if(/^https?:\/\//i.test(value)){warnings.push('Texture externe ignorée : '+value);return null;}const requested=path(value),names=Object.keys(input.assets),matches=names.filter(n=>n===requested||n.endsWith('/'+requested)||n==='textures/'+requested||n.endsWith('/textures/'+requested));if(matches.length!==1)throw new Error('Texture absente ou ambiguë dans le ZIP : '+value);const name=matches[0];if(textureCache.has(name))return textureCache.get(name);const bytes=input.assets[name];if(bytes.length>8*1024*1024)throw new Error('Texture limitée à 8 Mo : '+name);const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpeg=bytes[0]===255&&bytes[1]===216;if(!png&&!jpeg)throw new Error('Texture PNG/JPG invalide : '+name);const id=await hash(bytes),blob=new Blob([bytes],{type:png?'image/png':'image/jpeg'});if(typeof createImageBitmap==='function'){const image=await createImageBitmap(blob);const large=image.width>4096||image.height>4096;image.close();if(large)throw new Error('Texture limitée à 4096 × 4096 : '+name);}textures.set(id,{id,name,blob});textureCache.set(name,id);return id;}
    for(let i=0;i<rows.length;i++){try{if(rows[i].length>mapping.length)throw new Error('Nombre de colonnes supérieur à l’en-tête');const row={};mapping.forEach((field,j)=>{if(field)row[field]=rows[i][j]??'';});const p=SupplierCatalogueCore.normalize(row,input.source);if(seen.has(p.id))throw new Error('Référence en double pour ce fournisseur');seen.add(p.id);
        if(p.Texture_BaseColor||p.Texture_Normal||p.Texture_Roughness){if(Object.keys(input.assets).length){p.textureBinding={baseColor:await texture(p.Texture_BaseColor),normal:await texture(p.Texture_Normal),roughness:await texture(p.Texture_Roughness),repeat:p.Texture_Repeat_m||2,color:p.Couleur_Fallback||'#b88752'};}
          else warnings.push('Textures de '+p.Reference+' non embarquées : utilisez un ZIP ou « Changer texture ».');}
        products.push(p);if(existing.has(p.id))updated++;else inserted++;
      }catch(e){errors.push({line:i+2,message:e.message});}if(i%200===199){progress(i+1,rows.length);await pause();}}
    // Texture_ID relie les variantes même si le chemin n'est renseigné que sur une ligne.
    const byId=new Map();for(const p of products)if(p.Texture_ID&&p.textureBinding)byId.set(p.supplierId+'|'+p.Texture_ID,p.textureBinding);for(const p of products)if(p.Texture_ID&&!p.textureBinding&&byId.has(p.supplierId+'|'+p.Texture_ID))p.textureBinding={...byId.get(p.supplierId+'|'+p.Texture_ID)};
    progress(rows.length,rows.length);return {products,textures:[...textures.values()],errors,warnings:[...new Set(warnings)],detected:rows.length,inserted,updated,withTexture:products.filter(p=>p.textureBinding?.baseColor).length};
  }
  return {read,preview,hash,path};
})();
if(typeof window!=='undefined')window.SupplierCatalogueImport=SupplierCatalogueImport;
if(typeof module!=='undefined')module.exports=SupplierCatalogueImport;
