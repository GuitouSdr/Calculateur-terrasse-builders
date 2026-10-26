'use strict';
const SupplierCatalogueCore=(()=>{
  const columns='Fournisseur Reference EAN Famille Sous_famille Designation Essence Gamme Couleur Epaisseur_mm Largeur_mm Longueur_m Unite Prix_public_HT Prix_pro_HT Prix_TTC TVA Prix_m2_HT Prix_ml_HT Classe_emploi Profil Type_fixation Sur_devis Disponible Source Date_tarif Texture_ID Texture_BaseColor Texture_Normal Texture_Roughness Texture_Repeat_m Couleur_Fallback Notes Hauteur_min_mm Hauteur_max_mm'.split(' ');
  const families='LAME LAMBOURDE PLOT VIS FIXATION BANDE GEOTEXTILE DALLETTE CALE RAIL MARGELLE POTEAU STRUCTURE ACCESSOIRE AUTRE MADRIER POUTRE PLANCHE MARCHE CONNECTEUR'.split(' ');
  const key=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const supplierKey=s=>String(s).trim().normalize('NFKC').toLocaleLowerCase('fr');
  const productKey=(supplier,reference)=>JSON.stringify([supplierKey(supplier),String(reference).trim().normalize('NFKC')]);
  const aliases={reference:['ref','réf article','référence article','code article','code produit'],designation:['libellé','désignation produit','nom produit'],fournisseur:['supplier','marque fournisseur'],prixpublicht:['prix ht','pu ht','prix vente ht','prix public ht'],prixproht:['prix achat ht','prix net ht','prix pro'],longueurm:['longueur','longueur m'],largeurmm:['largeur','largeur mm'],epaisseurmm:['épaisseur','épaisseur mm'],unite:['unité vente','unit'],famille:['type','catégorie']};
  function mapping(headers){return headers.map(h=>columns.find(c=>key(c)===key(h))||columns.find(c=>(aliases[key(c)]||[]).some(a=>key(a)===key(h)))||'');}
  function csv(text){text=text.replace(/^\uFEFF/,'');const line=text.split(/\r?\n/)[0]||'',counts=sep=>{let q=false,n=0;for(let i=0;i<line.length;i++){if(line[i]==='"')q=!q;else if(!q&&line[i]===sep)n++;}return n;},sep=counts(';')>=counts(',')?';':',';const rows=[];let row=[],value='',quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else if(!quoted&&value==='')quoted=true;else if(quoted)quoted=false;else throw new Error('Guillemet CSV invalide.');}else if(!quoted&&c===sep){row.push(value);value='';}else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';}else value+=c;}
    if(quoted)throw new Error('Champ CSV non fermé.');row.push(value);if(row.some(v=>v.trim()))rows.push(row);return rows;
  }
  function numeric(value,label){if(value===null||value===undefined||String(value).trim()==='')return null;let raw=String(value).trim().replace(/[\s\u00a0\u202f€%]/g,'');if(raw.includes(',')&&raw.includes('.')){if(raw.lastIndexOf(',')>raw.lastIndexOf('.'))raw=raw.replace(/\./g,'').replace(',','.');else raw=raw.replace(/,/g,'');}else raw=raw.replace(',','.');const n=Number(raw);if(!Number.isFinite(n)||n<0||n>1e7)throw new Error(label+' invalide');return n;}
  function boolean(value,fallback){if(value===undefined||value===null||String(value).trim()==='')return fallback;const k=key(value);if(['true','oui','yes','1','disponible'].includes(k))return true;if(['false','non','no','0','indisponible'].includes(k))return false;throw new Error('Booléen invalide : '+value);}
  function normalize(row,source=''){
    const p={};for(const c of columns)p[c]=String(row[c]??'').trim();for(const c of ['Fournisseur','Reference','Famille','Designation'])if(!p[c])throw new Error(c+' vide');
    if(p.Reference.length>100||p.Fournisseur.length>160||p.Designation.length>500)throw new Error('Libellé trop long');for(const c of columns)if(p[c].length>4000)throw new Error(c+' trop long');
    p.Famille_originale=p.Famille;const f=key(p.Famille);p.Famille=families.find(x=>key(x)===f)||(f==='bandebitume'?'BANDE':f==='lames'?'LAME':f==='lambourdes'?'LAMBOURDE':'AUTRE');
    for(const c of columns.filter(c=>/^(Prix_|TVA$|Epaisseur_|Largeur_|Longueur_|Hauteur_|Texture_Repeat_m$)/.test(c)))p[c]=numeric(row[c],c);
    if(p.TVA!==null&&p.TVA>100)throw new Error('TVA invalide');for(const c of ['Epaisseur_mm','Largeur_mm','Longueur_m','Texture_Repeat_m'])if(p[c]===0)throw new Error(c+' doit être positif');
    p.Unite=p.Unite||'u';const units={piece:'u',pieces:'u',unite:'u',m:'ml',metre:'ml',m2:'m²',m3:'m³',boite:'boîte'};p.Unite=units[key(p.Unite)]||p.Unite;
    p.Sur_devis=boolean(row.Sur_devis,false);p.Disponible=['averifier','averifierenagence','surcommande'].includes(key(row.Disponible))?String(row.Disponible).trim():boolean(row.Disponible,true);p.Active=true;p.Source=p.Source||source;
    if(p.Couleur_Fallback&&!/^#[a-f0-9]{6}$/i.test(p.Couleur_Fallback))throw new Error('Couleur_Fallback attendue : #RRGGBB');
    p.id=productKey(p.Fournisseur,p.Reference);p.supplierId=supplierKey(p.Fournisseur);return p;
  }
  function price(p){let value=p.Prix_pro_HT??p.Prix_public_HT,source=p.Prix_pro_HT!==null&&p.Prix_pro_HT!==undefined?'PRO':'PUBLIC';if(value===null||value===undefined){if(p.Prix_TTC!=null&&p.TVA!=null){value=p.Prix_TTC/(1+p.TVA/100);source='TTC converti HT';}else return null;}return {value,source};}
  function adapter(p){
    if(p.Famille==='LAME'&&['grad','clips','clipsavisser','systemecomposite','systemealuminium'].includes(key(p.Type_fixation)))throw new Error('Système de fixation spécifique : consultable, calcul des rails / clips non intégré.');
    if(!p.Active||!p.Disponible||p.Sur_devis)throw new Error('Produit indisponible, désactivé ou sur devis.');const tariff=price(p);if(!tariff)throw new Error('Prix HT absent : produit consultable, non chiffrable.');
    const familiesMap={LAME:'Lame',LAMBOURDE:'Lambourde',PLOT:'Plot',VIS:'Vis',BANDE:'Accessoire',GEOTEXTILE:'Accessoire'};const family=familiesMap[p.Famille];if(!family)throw new Error('Cette famille reste consultable dans le catalogue ; le moteur ne la calcule pas.');
    let amount=tariff.value,unit=p.Unite,type=family;if(['LAME','LAMBOURDE'].includes(p.Famille)){if(!(p.Epaisseur_mm>0&&p.Largeur_mm>0&&p.Longueur_m>0&&p.Longueur_m<=30&&p.Largeur_mm<=1000&&p.Epaisseur_mm<=200))throw new Error('Dimensions techniques manquantes ou hors limites.');if(unit==='ml')amount*=p.Longueur_m;else if(unit==='m²')amount*=p.Longueur_m*p.Largeur_mm/1000;else if(unit!=='u')throw new Error('Conversion de '+unit+' vers une pièce inconnue.');unit='u';}
    if(['PLOT','VIS'].includes(p.Famille)&&unit!=='u')throw new Error('Conditionnement '+unit+' : prix par unité nécessaire.');
    if(p.Famille==='PLOT'&&!(p.Hauteur_min_mm>0&&p.Hauteur_max_mm>=p.Hauteur_min_mm))throw new Error('Hauteurs minimale et maximale du plot nécessaires.');
    if(p.Famille==='BANDE'){type='Bande bitume';if(unit!=='ml')throw new Error('Prix par ml nécessaire pour la bande.');}if(p.Famille==='GEOTEXTILE'){type='Géotextile';if(unit!=='m²')throw new Error('Prix par m² nécessaire pour le géotextile.');unit='m2';}
    return {Famille:family,type,Reference:'SUP-'+encodeURIComponent(p.id),Designation:p.Designation,Fournisseur:p.Fournisseur,SupplierReference:p.Reference,SupplierProductId:p.id,Unite:unit,Prix_public_HT:amount,Prix_pro_HT:null,Tarif_source:tariff.source,Tarif_original_HT:tariff.value,Tarif_unite:p.Unite,Date_tarif:p.Date_tarif,Epaisseur_mm:p.Epaisseur_mm,Largeur_mm:p.Largeur_mm,Longueur_m:p.Longueur_m,Hauteur_min_mm:p.Hauteur_min_mm,Hauteur_max_mm:p.Hauteur_max_mm,Section:p.Epaisseur_mm+'x'+p.Largeur_mm,Texture_Binding:JSON.stringify(p.textureBinding||null),Couleur_Fallback:p.Couleur_Fallback,Essence:p.Essence,Gamme:p.Gamme};
  }
  function resolveBinding(p,supplier){if(p.textureBinding)return p.textureBinding;for(const scope of ['gamme','essence']){const value=scope==='gamme'?p.Gamme:p.Essence;const b=value&&supplier?.bindings?.find(b=>b.scope===scope&&b.value===value);if(b)return b.binding;}return null;}
  function variantKey(p){return JSON.stringify([p.supplierId,p.Gamme,p.Essence,p.Couleur,p.Epaisseur_mm,p.Largeur_mm,p.Profil,p.Designation.replace(/\b\d+(?:[.,]\d+)?\s*m\b/gi,'').trim()]);}
  function toCSV(products){const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return '\uFEFF'+[columns,...products.map(p=>columns.map(c=>p[c]))].map(row=>row.map(cell).join(';')).join('\r\n');}
  return {columns,families,key,supplierKey,productKey,mapping,csv,numeric,normalize,price,adapter,resolveBinding,variantKey,toCSV};
})();
if(typeof window!=='undefined')window.SupplierCatalogueCore=SupplierCatalogueCore;
if(typeof module!=='undefined')module.exports=SupplierCatalogueCore;
