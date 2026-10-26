'use strict';
const PlanTransform=(()=>{
  const rotate=(p,degrees)=>{const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return {x:p.x*c-p.y*s,y:p.x*s+p.y*c};};
  function planToScreen(p,t){const q=rotate(p,t.rotation);return {x:q.x*t.zoom+t.offsetX,y:q.y*t.zoom+t.offsetY};}
  function screenToPlan(p,t){return rotate({x:(p.x-t.offsetX)/t.zoom,y:(p.y-t.offsetY)/t.zoom},-t.rotation);}
  function screenToCanvas(p,rect,canvas){return {x:(p.x-rect.left)*canvas.width/rect.width,y:(p.y-rect.top)*canvas.height/rect.height};}
  function canvasToScreen(p,rect,canvas){return {x:rect.left+p.x*rect.width/canvas.width,y:rect.top+p.y*rect.height/canvas.height};}
  // La rotation est celle de la vue de travail. Le chantier garde les axes du document.
  function planToWorld(p,plan,origin={x:0,y:0}){if(!(plan.scale>0))throw new Error('Définissez d’abord l’échelle du plan.');return {x:(p.x-origin.x)*plan.scale,y:(p.y-origin.y)*plan.scale};}
  function worldToPlan(p,plan,origin={x:0,y:0}){return {x:p.x/plan.scale+origin.x,y:p.y/plan.scale+origin.y};}
  const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
  function calibration(a,b,value,unit='m'){const n=Number(String(value).trim().replace(',','.'))*({m:1,cm:.01,mm:.001}[unit]||0),d=distance(a,b);if(!Number.isFinite(n)||n<=0||n>10000||d<1e-6)throw new Error('Distance réelle positive et deux points distincts requis.');return n/d;}
  function nearest(p,points,closed,tolerance){let best=null;for(let i=0;i<points.length;i++){const d=distance(p,points[i]);if(d<=tolerance&&(!best||d<best.distance))best={point:{...points[i]},vertex:i,distance:d};}if(best)return best;for(let i=0;i<(closed?points.length:points.length-1);i++){const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)continue;const u=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)),q={x:a.x+u*dx,y:a.y+u*dy},d=distance(p,q);if(d<=tolerance&&(!best||d<best.distance))best={point:q,edge:i,distance:d};}return best;}
  function project(points,plan,originIndex=0,direction=null){
    const origin=plan.worldOrigin||points[originIndex]||points[0],angle=direction?Math.atan2(direction[1].y-direction[0].y,direction[1].x-direction[0].x)*180/Math.PI:0;
    const world=points.map(p=>planToWorld(p,plan,origin)),local=world.map(p=>rotate(p,-angle)),geometry=PlanGeometry.polygonGeometry(local,{freeForm:true}),c={x:geometry.outerLength/2,y:geometry.outerWidth/2},rc=rotate(c,angle),rm=rotate(geometry.origin,angle);
    return {geometry,world,terracePolygon:world.map(p=>({x:p.x,z:p.y})),origin,angle,placement:{x:rm.x-c.x+rc.x,y:rm.y-c.y+rc.y,rotation:angle},localFromDocument(p){const q=rotate(planToWorld(p,plan,origin),-angle);return {x:q.x-geometry.origin.x,y:q.y-geometry.origin.y};}};
  }
  function gridPlan(documentId){return {type:'grid',source:'Grille XYZ',page:1,scale:.02,rotation:0,offsetX:0,offsetY:0,zoom:1,locked:false,documentId,worldOrigin:{x:500,y:500},gridStep:.1,gridSnap:true};}
  function gridPoint(p,plan){if(plan.type!=='grid'||plan.gridSnap===false)return p;const step=plan.gridStep/plan.scale,o=plan.worldOrigin;return {x:o.x+Math.round((p.x-o.x)/step)*step,y:o.y+Math.round((p.y-o.y)/step)*step};}
  function validateGrid(plan){if(plan.type!=='grid'||plan.scale!==.02||plan.page!==1||plan.gridStep!==.1||!plan.worldOrigin||plan.worldOrigin.x!==500||plan.worldOrigin.y!==500||typeof plan.gridSnap!=='boolean')throw new Error('Grille de dessin invalide.');return plan;}
  class History{constructor(limit=100){this.limit=limit;this.undo=[];this.redo=[];}push(state){this.undo.push(JSON.stringify(state));if(this.undo.length>this.limit)this.undo.shift();this.redo=[];}back(state){if(!this.undo.length)return state;this.redo.push(JSON.stringify(state));return JSON.parse(this.undo.pop());}forward(state){if(!this.redo.length)return state;this.undo.push(JSON.stringify(state));return JSON.parse(this.redo.pop());}clear(){this.undo=[];this.redo=[];}}
  return {rotate,planToScreen,screenToPlan,screenToCanvas,canvasToScreen,planToWorld,worldToPlan,distance,calibration,nearest,project,gridPlan,gridPoint,validateGrid,History};
})();
