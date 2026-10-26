'use strict';
// Adaptateur métrique en lecture seule. Les coordonnées techniques viennent du plan.
const Terrace3DModel=(()=>{
  function plotRange(zone){const p=zone.plot;if(Number.isFinite(p?.Hauteur_min_mm)&&Number.isFinite(p?.Hauteur_max_mm)&&p.Hauteur_min_mm>0&&p.Hauteur_max_mm>=p.Hauteur_min_mm)return {min:p.Hauteur_min_mm,max:p.Hauteur_max_mm};const match=p?.Reference?.match(/PLOT_(\d+)_(\d+)/);if(!match)throw new Error('Plage de hauteur du plot absente du catalogue.');return {min:Number(match[1]),max:Number(match[2])};}
  function contours(g){
    const W=g.outerLength,H=g.outerWidth;
    if(g.pathType==='circle')return {outer:Array.from({length:96},(_,i)=>{const a=i*Math.PI*2/96;return {x:W/2+W/2*Math.cos(a),y:H/2+H/2*Math.sin(a)};}),holes:[]};
    if(g.pathType==='semi_circle')return {outer:Array.from({length:65},(_,i)=>{const a=Math.PI+i*Math.PI/64;return {x:W/2+W/2*Math.cos(a),y:H+H*Math.sin(a)};}),holes:[]};
    const outer=PlanGeometry.vertices(g).map(p=>({...p}));
    const x=(W-g.holeL)/2,y=(H-g.holeW)/2;
    return {outer,holes:g.pathType==='rectangle_hole'?[[{x,y},{x:x+g.holeL,y},{x:x+g.holeL,y:y+g.holeW},{x,y:y+g.holeW}]]:[]};
  }
  function clipTriangle(triangle,axis,start,end){
    let points=triangle.map(p=>({...p}));
    for(const [value,sign] of [[start,1],[end,-1]]){
      const output=[];for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],inA=sign*(a[axis]-value)>=-1e-10,inB=sign*(b[axis]-value)>=-1e-10;
        if(inA)output.push(a);if(inA!==inB){const t=(value-a[axis])/(b[axis]-a[axis]);output.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
      }points=output;if(!points.length)break;
    }
    const clean=points.filter((p,i)=>i===0||Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)>1e-9);
    if(clean.length>1&&Math.hypot(clean[0].x-clean.at(-1).x,clean[0].y-clean.at(-1).y)<1e-9)clean.pop();
    return clean.length>=3&&polygonArea(clean)>1e-10?clean:[];
  }
  function polygonArea(points){return Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a.x*b.y-b.x*a.y;},0))/2;}
  function zoneSpec(zone,placement,layout,settings={}){
    const boardWidth=zone.lame.Largeur_mm/1000,boardThickness=zone.lame.Epaisseur_mm/1000,pitch=boardWidth+zone.jeuLameMm/1000;
    const [joistWidth,joistHeight]=zone.section.split('x').map(v=>Number(v)/1000),range=plotRange(zone);
    const heightMm=zone.hauteur?.plotHeightMm??(settings.heightMm==null?range.min:Number(settings.heightMm)),diameterMm=Number(settings.diameterMm);
    if(!Number.isFinite(heightMm)||heightMm<range.min||heightMm>range.max)throw new Error(`Zone ${zone.id} : hauteur des plots entre ${range.min} et ${range.max} mm.`);
    if(!Number.isFinite(diameterMm)||diameterMm<20||diameterMm>1000)throw new Error('Renseignez le diamètre schématique des plots (20 à 1000 mm).');
    if(![boardWidth,boardThickness,joistWidth,joistHeight,pitch].every(v=>Number.isFinite(v)&&v>0))throw new Error('Dimensions des matériaux incomplètes.');
    const horizontal=zone.orientation==='longueur',coverage=horizontal?zone.geometry.outerWidth:zone.geometry.outerLength;
    const count=Math.ceil(coverage/pitch),elevation=(zone.niveauMm||0)/1000;
    if(!Number.isFinite(elevation)||elevation<0||elevation>10)throw new Error('Niveau de terrasse invalide.');
    return {supplierMaterial:zone.lame.SupplierProductId?{binding:JSON.parse(zone.lame.Texture_Binding||'null'),color:zone.lame.Couleur_Fallback,essence:zone.lame.Essence}:null,elevation,id:zone.id,name:zone.nom,geometry:zone.geometry,placement:{...placement},contour:contours(zone.geometry),horizontal,boardWidth,boardThickness,pitch,boardCount:count,joistWidth,joistHeight,supportHeight:(zone.hauteur?.supportMm||0)/1000,extraHeight:(zone.hauteur?.extraMm||0)/1000,plotHeight:heightMm/1000,plotDiameter:diameterMm/1000,totalHeight:elevation+(zone.hauteur?zone.hauteur.finishedMm/1000:heightMm/1000+joistHeight+boardThickness),rails:layout.rails,supports:layout.supports,indicative:layout.indicative,light:layout.light,pricedSupports:zone.nbPlots};
  }
  function projectSpecs(snapshot,settings){return snapshot.zones.map(z=>zoneSpec(z,snapshot.placements.get(z.id),snapshot.layouts.get(z.id),settings));}
  return {plotRange,contours,clipTriangle,polygonArea,zoneSpec,projectSpecs};
})();
