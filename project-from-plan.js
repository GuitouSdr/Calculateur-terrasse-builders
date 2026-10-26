'use strict';
const ProjectFromPlan=(()=>{
  const records=new Map();let version=0;
  function create(state,raster){
    if(!state.closed)throw new Error('Fermez d’abord le tracé.');const converted=PlanTransform.project(state.points,state.plan,state.originIndex,state.direction),g=converted.geometry;
    if(g.outerLength>100||g.outerWidth>100)throw new Error('La terrasse dépasse 100 m : vérifiez l’échelle.');
    let id=state.zoneId;const existing=dernierCalculZones.some(z=>z.id===id),direction=['longueur','largeur','auto'].includes(state.sensPose)?state.sensPose:existing?document.getElementById(`sensPose-${id}`).value:'longueur';
    if(!existing){id=createPolygonZone(g.points,{freeForm:true,sensPose:direction}).id;state.zoneId=id;}else setZonePolygon(id,g.points,{freeForm:true});
    document.getElementById(`zoneNom-${id}`).value=document.getElementById('importZoneName').value.trim()||'Terrasse sur plan';document.getElementById(`sensPose-${id}`).value=direction;state.sensPose=direction;
    const corners=[{x:0,y:0},{x:raster.width,y:0},{x:raster.width,y:raster.height},{x:0,y:raster.height}].map(converted.localFromDocument);
    records.set(id,{id,version:++version,canvas:raster.canvas,corners,metadata:{type:state.plan.type,source:state.plan.source,page:state.plan.page,scale:state.plan.scale,rotation:state.plan.rotation,locked:state.plan.locked,origin:{...converted.origin},direction:state.direction,terracePolygon:converted.terracePolygon,editorState:JSON.parse(JSON.stringify(state))}});
    window.PlanChantier.setPlacement(id,converted.placement);calculTerrasseMulti({silent:true});return id;
  }
  function overlays(zones){return zones.filter(z=>records.has(z.id)&&z.geometry.forme==='polygone').map(z=>records.get(z.id));}
  function shiftOrigin(id,offset){const record=records.get(id);if(record){record.corners=record.corners.map(p=>({x:p.x-offset.x,y:p.y-offset.y}));record.version=++version;}}
  function traces(plan){return [...records.values()].filter(r=>{const p=r.metadata.editorState?.plan;return p&&p.page===plan.page&&(p.documentId&&plan.documentId?p.documentId===plan.documentId:p.source===plan.source);});}
  function realign(plan){
    const changes=traces(plan).filter(r=>dernierCalculZones.some(z=>z.id===r.id)).map(r=>{
      const s=r.metadata.editorState,p=PlanTransform.project(s.points,s.plan,s.originIndex,s.direction),z=dernierCalculZones.find(z=>z.id===r.id);
      if(Math.abs(z.geometry.outerLength-p.geometry.outerLength)>1e-6||Math.abs(z.geometry.outerWidth-p.geometry.outerWidth)>1e-6)throw new Error('Une terrasse a été redimensionnée hors du PDF. Reprenez son tracé avant de la recaler.');
      return {r,p};
    });
    if(!changes.length)throw new Error('Aucune terrasse créée sur cette page.');
    window.PlanChantier.setPlacements(changes.map(({r,p})=>[r.id,p.placement]),'Recalage des terrasses sur le PDF');
    for(const {r,p} of changes){r.metadata.terracePolygon=p.terracePolygon;r.version=++version;}
    return changes.length;
  }
  return {create,overlays,traces,realign,shiftOrigin,forget:id=>records.delete(id),clear:()=>records.clear(),restore(items){records.clear();for(const item of items)records.set(item.id,{...item,version:++version});}};
})();
if(typeof window!=='undefined')window.ProjectFromPlan=ProjectFromPlan;
