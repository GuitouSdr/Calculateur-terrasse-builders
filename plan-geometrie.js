'use strict';
// Unités du modèle : mètres. Aucun prix ni quantité du calculateur n'est modifié ici.
const PlanGeometry = (() => {
  const EPS = 1e-8;
  function validatePolygon(points,options={}) {
    const minimum=options.freeForm?3:4;
    if(!Array.isArray(points)||points.length<minimum||points.length>200)throw new Error(`La forme doit avoir de ${minimum} à 200 sommets.`);
    const p=points.map(v=>({x:Number(v.x),y:Number(v.y)}));
    if(p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)||Math.abs(v.x)>10000||Math.abs(v.y)>10000))throw new Error('Coordonnées invalides.');
    const edges=p.map((a,i)=>({a,b:p[(i+1)%p.length]}));
    for(const {a,b} of edges){const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);if(dx<EPS&&dy<EPS)throw new Error('Un côté ne peut pas être nul.');if(!options.freeForm&&dx>EPS&&dy>EPS)throw new Error('La fermeture doit être horizontale ou verticale.');}
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const intersects=(e,f)=>Math.max(Math.min(e.a.x,e.b.x),Math.min(f.a.x,f.b.x))<=Math.min(Math.max(e.a.x,e.b.x),Math.max(f.a.x,f.b.x))+EPS&&Math.max(Math.min(e.a.y,e.b.y),Math.min(f.a.y,f.b.y))<=Math.min(Math.max(e.a.y,e.b.y),Math.max(f.a.y,f.b.y))+EPS&&cross(e.a,e.b,f.a)*cross(e.a,e.b,f.b)<=EPS&&cross(f.a,f.b,e.a)*cross(f.a,f.b,e.b)<=EPS;
    for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
      if(j===i+1||i===0&&j===edges.length-1){
        const shared=j===i+1?edges[i].b:edges[i].a,otherA=j===i+1?edges[i].a:edges[i].b,otherB=j===i+1?edges[j].b:edges[j].a;
        if(Math.abs(cross(shared,otherA,otherB))<EPS&&(otherA.x-shared.x)*(otherB.x-shared.x)+(otherA.y-shared.y)*(otherB.y-shared.y)>EPS)throw new Error('Un côté revient sur lui-même.');
      }else if(intersects(edges[i],edges[j]))throw new Error('La forme se croise ou se touche elle-même.');
    }
    const signed=edges.reduce((a,e)=>a+e.a.x*e.b.y-e.b.x*e.a.y,0)/2;
    if(Math.abs(signed)<EPS)throw new Error('La surface doit être positive.');return p;
  }
  function polygonGeometry(points,options={}) {
    const p=validatePolygon(points,options),minX=Math.min(...p.map(v=>v.x)),minY=Math.min(...p.map(v=>v.y));
    const normalized=p.map(v=>({x:v.x-minX,y:v.y-minY}));
    const area=Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.y-b.x*a.y;},0))/2;
    const perimeter=p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+Math.hypot(b.x-a.x,b.y-a.y);},0);
    return {forme:'polygone',pathType:'polygone',label:'Forme personnalisée — estimation',points:normalized,outerLength:Math.max(...p.map(v=>v.x))-minX,outerWidth:Math.max(...p.map(v=>v.y))-minY,surface:area,perimeter,recommendedMargin:15,complexityLabel:'Estimation',holeArea:0,origin:{x:minX,y:minY},...(options.freeForm?{freeForm:true}:{})};
  }
  function orthogonalPoint(last,point){return Math.abs(point.x-last.x)>=Math.abs(point.y-last.y)?{x:point.x,y:last.y}:{x:last.x,y:point.y};}
  function resizePolygonSide(points,index,length,options={}) {
    if(!Number.isFinite(length)||length<=EPS)throw new Error('Longueur strictement positive requise.');
    if(options.freeForm){const p=points.map(v=>({...v})),a=p[index],b=p[(index+1)%p.length],old=Math.hypot(b.x-a.x,b.y-a.y);b.x=a.x+(b.x-a.x)*length/old;b.y=a.y+(b.y-a.y)*length/old;validatePolygon(p,options);return p;}
    const p=points.map(v=>({...v})),a=p[index],b=p[(index+1)%p.length],axis=Math.abs(b.x-a.x)>EPS?'x':'y';
    const old=b[axis],target=a[axis]+Math.sign(old-a[axis])*length;
    p.forEach(v=>{if(Math.abs(v[axis]-old)<EPS)v[axis]=target;});validatePolygon(p);return p;
  }
  function movePolygonVertex(points,index,point,options={}) {
    if(options.freeForm){const p=points.map(v=>({...v}));p[index]={...point};validatePolygon(p,options);return p;}
    const previous=points[(index+points.length-1)%points.length],next=points[(index+1)%points.length],vertex=points[index];
    const horizontal=Math.abs(previous.y-vertex.y)<EPS&&Math.abs(next.y-vertex.y)<EPS;
    const vertical=Math.abs(previous.x-vertex.x)<EPS&&Math.abs(next.x-vertex.x)<EPS;
    if(horizontal&&Math.abs(point.y-vertex.y)>EPS||vertical&&Math.abs(point.x-vertex.x)>EPS){
      const along=horizontal?'x':'y',cross=horizontal?'y':'x',direction=Math.sign(next[along]-previous[along]);
      const half=Math.min(Math.abs(point[along]-previous[along]),Math.abs(next[along]-point[along]))/2;
      if(half<EPS)throw new Error('Le décrochement doit rester à l’intérieur du côté.');
      const start=point[along]-direction*half,end=point[along]+direction*half,base=vertex[cross];
      const p=points.map(v=>({...v}));p.splice(index,1,{[along]:start,[cross]:base},{[along]:start,[cross]:point[cross]},{[along]:end,[cross]:point[cross]},{[along]:end,[cross]:base});validatePolygon(p);return p;
    }
    const old=points[index],p=points.map(v=>({x:Math.abs(v.x-old.x)<EPS?point.x:v.x,y:Math.abs(v.y-old.y)<EPS?point.y:v.y}));
    validatePolygon(p);return p;
  }
  function insertPolygonVertex(points,index,options={}) {
    const p=points.map(v=>({...v})),a=p[index],b=p[(index+1)%p.length];p.splice(index+1,0,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});validatePolygon(p,options);return p;
  }
  function removePolygonVertex(points,index,options={}){const p=points.map(v=>({...v}));p.splice(index,1);validatePolygon(p,options);return p;}
  function polygonSegments(points,axis,at) {
    const vertical=axis==='y',cross=vertical?'x':'y',along=vertical?'y':'x',values=[];
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[cross]<=at&&b[cross]>at)||(b[cross]<=at&&a[cross]>at))values.push(a[along]+(at-a[cross])*(b[along]-a[along])/(b[cross]-a[cross]));}
    values.sort((a,b)=>a-b);const result=[];for(let i=0;i+1<values.length;i+=2)if(values[i+1]-values[i]>EPS)result.push([values[i],values[i+1]]);return result;
  }
  function transformPoint(point, geometry, placement) {
    const cx = geometry.outerLength / 2, cy = geometry.outerWidth / 2;
    const angle = placement.rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle))<EPS?0:Math.cos(angle), sin = Math.abs(Math.sin(angle))<EPS?0:Math.sin(angle);
    return {x:placement.x + cx + (point.x-cx)*cos - (point.y-cy)*sin,
      y:placement.y + cy + (point.x-cx)*sin + (point.y-cy)*cos};
  }
  function bounds(geometry, placement) {
    const W=geometry.outerLength,H=geometry.outerWidth;
    const points=[{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}].map(p=>transformPoint(p,geometry,placement));
    return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
      minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
  }
  function projectBounds(zones, placements) {
    if (!zones.length) return {minX:0,minY:0,maxX:4,maxY:3};
    const boxes=zones.map(z=>bounds(z.geometry,placements.get(z.id)));
    return {minX:Math.min(...boxes.map(b=>b.minX)),minY:Math.min(...boxes.map(b=>b.minY)),
      maxX:Math.max(...boxes.map(b=>b.maxX)),maxY:Math.max(...boxes.map(b=>b.maxY))};
  }
  function vertices(g) {
    const W=g.outerLength,H=g.outerWidth;
    if(g.pathType==='polygone')return g.points;
    if(g.pathType==='L')return [{x:0,y:0},{x:W,y:0},{x:W,y:H-g.cutW},{x:W-g.cutL,y:H-g.cutW},{x:W-g.cutL,y:H},{x:0,y:H}];
    if(g.pathType==='circle')return [{x:W/2,y:0},{x:W,y:H/2},{x:W/2,y:H},{x:0,y:H/2}];
    if(g.pathType==='semi_circle')return [{x:0,y:H},{x:W/2,y:0},{x:W,y:H}];
    return [{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}];
  }
  function path(g) {
    const W=g.outerLength,H=g.outerWidth;
    if(g.pathType==='polygone')return g.points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join('')+'Z';
    if(g.pathType==='L')return `M0 0H${W}V${H-g.cutW}H${W-g.cutL}V${H}H0Z`;
    if(g.pathType==='circle')return `M0 ${H/2}A${W/2} ${H/2} 0 1 1 ${W} ${H/2}A${W/2} ${H/2} 0 1 1 0 ${H/2}Z`;
    if(g.pathType==='semi_circle')return `M0 ${H}A${W/2} ${H} 0 0 1 ${W} ${H}Z`;
    let value=`M0 0H${W}V${H}H0Z`;
    if(g.pathType==='rectangle_hole') {
      const x=(W-g.holeL)/2,y=(H-g.holeW)/2;
      value+=`M${x} ${y}h${g.holeL}v${g.holeW}h${-g.holeL}Z`;
    }
    return value;
  }
  // Intersection géométrique d'une ligne de structure avec le contour existant.
  function segments(g, axis, at) {
    const W=g.outerLength,H=g.outerWidth,vertical=axis==='y';
    const full=vertical?H:W;
    if(g.pathType==='polygone'){const maximum=vertical?W:H;return polygonSegments(g.points,axis,at>=maximum-EPS?maximum-EPS:at);}
    if(g.pathType==='circle'||g.pathType==='semi_circle') {
      const r=W/2,cross=vertical?r:(g.pathType==='circle'?r:H);
      const delta=at-cross,root=Math.sqrt(Math.max(0,r*r-delta*delta));
      if(root<EPS)return [];
      return [vertical ? (g.pathType==='circle'?[r-root,r+root]:[H-root,H]) : [r-root,r+root]];
    }
    if(g.pathType==='L') {
      const cut=vertical?at>W-g.cutL+EPS:at>H-g.cutW+EPS;
      return [[0,cut?(vertical?H-g.cutW:W-g.cutL):full]];
    }
    if(g.pathType==='rectangle_hole') {
      const crossStart=vertical?(W-g.holeL)/2:(H-g.holeW)/2;
      const crossSize=vertical?g.holeL:g.holeW;
      if(at>crossStart+EPS&&at<crossStart+crossSize-EPS) {
        const start=vertical?(H-g.holeW)/2:(W-g.holeL)/2;
        const size=vertical?g.holeW:g.holeL;
        return [[0,start],[start+size,full]];
      }
    }
    return [[0,full]];
  }
  function contains(g,x,y) {
    if(x<-EPS||y<-EPS||x>g.outerLength+EPS||y>g.outerWidth+EPS)return false;
    return segments(g,'y',x).some(([a,b])=>y>=a-EPS&&y<=b+EPS);
  }
  function sampledIndices(count,limit) {
    const step=Math.max(1,Math.ceil(count/limit));
    const result=[];
    for(let i=0;i<count;i+=step)result.push(i);
    if(result.at(-1)!==count-1)result.push(count-1);
    return result;
  }
  function technicalLayout(zone,raw=false) {
    const g=zone.geometry,vertical=zone.orientation==='longueur';
    const length=vertical?g.outerLength:g.outerWidth;
    const count=zone.nbLambourdes; // Nombre issu du scénario réellement choisi.
    const railIndices=sampledIndices(count,250);
    const rails=[],supports=[];
    let supportCount=0,light=railIndices.length<count;
    const supportLimit=Math.max(2,Math.floor(1500/Math.max(railIndices.length*2,1)));
    for(const i of railIndices) {
      const at=length*i/(count-1);
      for(const [start,end] of segments(g,vertical?'y':'x',at)) {
        const a=vertical?{x:at,y:start}:{x:start,y:at};
        const b=vertical?{x:at,y:end}:{x:end,y:at};
        rails.push({a,b});
        // Rectangle : quantité exacte du calculateur. Autres formes : même helper,
        // utilisé sur les fragments réels ; les renforts forfaitaires restent non placés.
        const n=g.forme==='rectangle'?zone.plotsParLambourde:BuilderUtils.supports(end-start,zone.entraxePlot);
        supportCount+=n;
        const indices=sampledIndices(n,supportLimit);
        if(indices.length<n)light=true;
        for(const j of indices) {
          const t=j/(n-1);
          supports.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
        }
      }
    }
    const shared=new Set(raw?[]:zone.sharedSupportIndices||[]);return {rails,supports:supports.filter((p,i)=>!shared.has(i)),supportCount:supportCount-shared.size,light,indicative:g.forme!=='rectangle'};
  }
  // Une jonction exige une rive commune de longueur positive et des intérieurs opposés.
  // On mutualise uniquement les appuis déjà placés au même point, jamais une rangée par proximité.
  function terraceJunctions(zones,placements,enabled=true){
    const tolerance=.0001,cross=(a,b)=>a.x*b.y-a.y*b.x,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),length=v=>Math.hypot(v.x,v.y),dot=(a,b)=>a.x*b.x+a.y*b.y;
    const on=(p,a,b)=>{const v=sub(b,a),w=sub(p,a),l=length(v);return l>tolerance&&Math.abs(cross(v,w))/l<=tolerance&&dot(w,v)>=-tolerance*l&&dot(w,v)<=l*l+tolerance*l;};
    const signed=ps=>ps.reduce((sum,a,i)=>sum+cross(a,ps[(i+1)%ps.length]),0);
    function inside(p,ps){if(ps.some((a,i)=>on(p,a,ps[(i+1)%ps.length])))return false;let yes=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
    function overlap(a,b){if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return true;for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const p=a[i],q=a[(i+1)%a.length],r=b[j],t=b[(j+1)%b.length],v=sub(q,p),w=sub(t,r),x=cross(v,sub(r,p))/length(v),y=cross(v,sub(t,p))/length(v),u=cross(w,sub(p,r))/length(w),z=cross(w,sub(q,r))/length(w);if(x*y<0&&u*z<0&&Math.min(Math.abs(x),Math.abs(y),Math.abs(u),Math.abs(z))>tolerance)return true;}return false;}
    function seams(a,b){const out=[],sa=Math.sign(signed(a)),sb=Math.sign(signed(b));if(overlap(a,b))return out;for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const p=a[i],q=a[(i+1)%a.length],r=b[j],t=b[(j+1)%b.length],v=sub(q,p),w=sub(t,r),l=length(v),m=length(w);if(l<=tolerance||m<=tolerance||Math.abs(cross(v,w))/(l*m)>1e-7||dot(v,w)*sa*sb>=0||Math.abs(cross(v,sub(r,p)))/l>tolerance)continue;const lo=Math.max(0,Math.min(dot(sub(r,p),v)/l,dot(sub(t,p),v)/l)),hi=Math.min(l,Math.max(dot(sub(r,p),v)/l,dot(sub(t,p),v)/l));if(hi-lo>tolerance)out.push([{x:p.x+v.x*lo/l,y:p.y+v.y*lo/l},{x:p.x+v.x*hi/l,y:p.y+v.y*hi/l}]);}return out;}
    const fields=['nbPlots','coutPlots','nbDallettes','coutDallettes','totalHT','prixM2'];for(const z of zones){if(!z.junctionBase)z.junctionBase=Object.fromEntries(fields.map(k=>[k,z[k]]));else Object.assign(z,z.junctionBase);z.sharedSupportIndices=[];z.junctionSupportCount=0;}
    const summary={removed:0,savingHT:0,junctions:[],tolerance};if(!enabled)return summary;
    const entries=zones.map(z=>{const p=placements.get(z.id),layout=technicalLayout(z,true);if(!p||layout.light||!['rectangle','L','rectangle_hole','polygone'].includes(z.geometry.pathType))return null;const transform=q=>transformPoint(q,z.geometry,p),angle=((z.orientation==='longueur'?0:90)+p.rotation)*Math.PI/180;return {z,layout,bounds:bounds(z.geometry,p),points:vertices(z.geometry).map(transform),supports:layout.supports.map(transform),axis:{x:Math.cos(angle),y:Math.sin(angle)}};});
    const parent=new Map(),records=new Map(),find=k=>{if(!parent.has(k))parent.set(k,k);let root=k;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(k)!==k){const next=parent.get(k);parent.set(k,root);k=next;}return root;};
    const cell=p=>[Math.floor(p.x/tolerance),Math.floor(p.y/tolerance)];
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){const a=entries[i],b=entries[j];if(!a||!b||a.bounds.maxX<b.bounds.minX-tolerance||b.bounds.maxX<a.bounds.minX-tolerance||a.bounds.maxY<b.bounds.minY-tolerance||b.bounds.maxY<a.bounds.minY-tolerance||Math.abs(cross(a.axis,b.axis))>1e-7||(a.z.niveauMm||0)!==(b.z.niveauMm||0)||a.z.section!==b.z.section||a.z.plot?.Reference!==b.z.plot?.Reference||a.z.lame?.Epaisseur_mm!==b.z.lame?.Epaisseur_mm)continue;const edges=seams(a.points,b.points);if(!edges.length)continue;const boundary=p=>edges.some(([x,y])=>on(p,x,y)),hash=new Map();a.supports.forEach((p,index)=>{if(!boundary(p))return;const k=cell(p).join(','),list=hash.get(k)||[];list.push({p,index});hash.set(k,list);});let matches=0;b.supports.forEach((p,index)=>{if(!boundary(p))return;const [cx,cy]=cell(p);for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)for(const q of hash.get([x,y].join(','))||[]){if(length(sub(p,q.p))>tolerance)continue;const ak=`${a.z.id}:${q.index}`,bk=`${b.z.id}:${index}`;records.set(ak,{z:a.z,index:q.index});records.set(bk,{z:b.z,index});parent.set(find(bk),find(ak));matches++;}});summary.junctions.push({zones:[a.z.id,b.z.id],length:edges.reduce((sum,[x,y])=>sum+length(sub(x,y)),0),shared:matches});}
    const groups=new Map();for(const [key,r] of records){const root=find(key),list=groups.get(root)||[];list.push(r);groups.set(root,list);}for(const list of groups.values()){list.sort((a,b)=>a.z.id-b.z.id||a.index-b.index);for(const r of list.slice(1))if(r.z.sharedSupportIndices.length<r.z.junctionBase.nbPlots)r.z.sharedSupportIndices.push(r.index);}
    for(const z of zones){const n=z.sharedSupportIndices.length,b=z.junctionBase;if(!n)continue;const plotUnit=b.nbPlots?b.coutPlots/b.nbPlots:0,dalletteUnit=b.nbDallettes?b.coutDallettes/b.nbDallettes:0,d=Math.min(n,b.nbDallettes||0),saving=n*plotUnit+d*dalletteUnit;z.junctionSupportCount=n;z.nbPlots=b.nbPlots-n;z.coutPlots=b.coutPlots-n*plotUnit;z.nbDallettes=b.nbDallettes-d;z.coutDallettes=b.coutDallettes-d*dalletteUnit;z.totalHT=b.totalHT-saving;z.prixM2=z.totalHT/z.surface;summary.removed+=n;summary.savingHT+=saving;}
    return summary;
  }
  function spacingDimensions(zone) {
    if(zone.geometry.forme!=='rectangle')return [];
    const l=technicalLayout(zone);if(l.light)return [];
    const g=zone.geometry,vertical=zone.orientation==='longueur',out=[];
    const unique=values=>[...new Set(values.map(v=>Math.round(v*1e8)/1e8))].sort((a,b)=>a-b);
    const xs=unique(l.supports.map(p=>p.x)),ys=unique(l.supports.map(p=>p.y));
    // Limite les chaînes très denses ; aucune distance forfaitaire n'est inventée.
    if(xs.length<=60)for(let i=1;i<xs.length;i++)out.push({a:{x:xs[i-1],y:g.outerWidth},b:{x:xs[i],y:g.outerWidth},offset:{x:0,y:.34},value:xs[i]-xs[i-1],kind:vertical?'lambourdes':'plots'});
    if(ys.length<=60)for(let i=1;i<ys.length;i++)out.push({a:{x:0,y:ys[i-1]},b:{x:0,y:ys[i]},offset:{x:-.34,y:0},value:ys[i]-ys[i-1],kind:vertical?'plots':'lambourdes'});
    return out;
  }
  function snapPlacement(zone, proposed, zones, placements, tolerance) {
    const moving=vertices(zone.geometry).map(v=>transformPoint(v,zone.geometry,proposed));
    const targets=zones.filter(z=>z.id!==zone.id).flatMap(z=>vertices(z.geometry).map(v=>transformPoint(v,z.geometry,placements.get(z.id))));
    let dx=0,dy=0,bestX=tolerance,bestY=tolerance,guideX=null,guideY=null;
    for(const a of moving)for(const b of targets) {
      if(Math.abs(b.x-a.x)<bestX){bestX=Math.abs(b.x-a.x);dx=b.x-a.x;guideX=b.x;}
      if(Math.abs(b.y-a.y)<bestY){bestY=Math.abs(b.y-a.y);dy=b.y-a.y;guideY=b.y;}
    }
    return {placement:{...proposed,x:proposed.x+dx,y:proposed.y+dy},guideX,guideY};
  }
  function dimensions(g) {
    const W=g.outerLength,H=g.outerWidth,o=g.forme==='rectangle'?Math.max(.85,Math.max(W,H)*.14):Math.max(.3,Math.max(W,H)*.05);
    if(g.pathType==='polygone'){const signed=g.points.reduce((s,a,i)=>{const b=g.points[(i+1)%g.points.length];return s+a.x*b.y-b.x*a.y;},0);return g.points.map((a,i)=>{const b=g.points[(i+1)%g.points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),sign=Math.sign(signed);return {a,b,offset:{x:sign*dy/length*o,y:-sign*dx/length*o},value:length};});}
    const dims=[{a:{x:0,y:H},b:{x:W,y:H},offset:{x:0,y:o},value:W,prefix:g.pathType==='circle'||g.pathType==='semi_circle'?'Ø ':''},
      {a:{x:0,y:0},b:{x:0,y:H},offset:{x:-o,y:0},value:H}];
    if(g.pathType==='L') {
      dims.push({a:{x:W-g.cutL,y:H-g.cutW},b:{x:W,y:H-g.cutW},offset:{x:0,y:g.cutW+2*o},value:g.cutL},
        {a:{x:W,y:H-g.cutW},b:{x:W,y:H},offset:{x:o,y:0},value:g.cutW});
    }
    if(g.pathType==='rectangle_hole') {
      const x=(W-g.holeL)/2,y=(H-g.holeW)/2;
      dims.push({a:{x,y:y+g.holeW},b:{x:x+g.holeL,y:y+g.holeW},offset:{x:0,y:H-(y+g.holeW)+2*o},value:g.holeL,prefix:'Vide '},
        {a:{x:x+g.holeL,y},b:{x:x+g.holeL,y:y+g.holeW},offset:{x:W-(x+g.holeL)+o,y:0},value:g.holeW,prefix:'Vide '});
    }
    return dims;
  }
  function dimensionLines(zones,placements) {
    if(!zones.length)return [];
    const boxes=zones.map(z=>bounds(z.geometry,placements.get(z.id)));
    const extent=projectBounds(zones,placements);
    const scale=Math.max(...zones.map(z=>Math.max(z.geometry.outerLength,z.geometry.outerWidth)));
    const spacing=Math.max(.4,scale*.075),lines=[],occupied=[];
    function addDimension(a,b,offset,value,prefix='',global=false) {
      const dx=Math.abs(b.x-a.x),dy=Math.abs(b.y-a.y),horizontal=dx>=dy;
      // Les petits écarts du pointage ne doivent pas incliner toute la chaîne de cotes.
      // La longueur reste celle du côté réel ; seules ses lignes de rappel sont projetées.
      const aligned=Math.min(dx,dy)>Math.max(dx,dy)*.15;
      if(aligned){lines.push({a,b,offset,value,prefix,global,da:{x:a.x+offset.x,y:a.y+offset.y},db:{x:b.x+offset.x,y:b.y+offset.y}});return;}
      const start=Math.min(horizontal?a.x:a.y,horizontal?b.x:b.y),end=Math.max(horizontal?a.x:a.y,horizontal?b.x:b.y);
      const direction=Math.sign(horizontal?offset.y:offset.x)||1;
      let position=(horizontal?(a.y+b.y)/2+offset.y:(a.x+b.x)/2+offset.x);
      const blocked=coordinate=>boxes.some(box=>horizontal?
        coordinate>box.minY+EPS&&coordinate<box.maxY-EPS&&end>box.minX+EPS&&start<box.maxX-EPS:
        coordinate>box.minX+EPS&&coordinate<box.maxX-EPS&&end>box.minY+EPS&&start<box.maxY-EPS)||occupied.some(line=>line.horizontal===horizontal&&Math.abs(line.position-coordinate)<spacing-EPS&&end>line.start+EPS&&start<line.end-EPS);
      while(blocked(position))position+=direction*spacing;
      const routed=horizontal?{x:offset.x,y:position-a.y}:{x:position-a.x,y:offset.y};
      const da=horizontal?{x:a.x,y:position}:{x:position,y:a.y},db=horizontal?{x:b.x,y:position}:{x:position,y:b.y};
      occupied.push({horizontal,position,start,end});lines.push({a,b,offset:routed,value,prefix,global,da,db});
    }
    for(const zone of zones)for(const d of dimensions(zone.geometry)) {
      const p=placements.get(zone.id),a=transformPoint(d.a,zone.geometry,p),b=transformPoint(d.b,zone.geometry,p);
      const shifted=transformPoint({x:d.a.x+d.offset.x,y:d.a.y+d.offset.y},zone.geometry,p);
      addDimension(a,b,{x:shifted.x-a.x,y:shifted.y-a.y},d.value,d.prefix);
    }
    addDimension({x:extent.minX,y:extent.minY},{x:extent.maxX,y:extent.minY},{x:0,y:-Math.max(.8,scale*.12)},extent.maxX-extent.minX,'Projet ',true);
    addDimension({x:extent.maxX,y:extent.minY},{x:extent.maxX,y:extent.maxY},{x:Math.max(.8,scale*.12),y:0},extent.maxY-extent.minY,'Projet ',true);
    return lines;
  }
  function drawingBounds(zones,placements,includeDimensions) {
    const b=projectBounds(zones,placements);
    if(!includeDimensions)return b;
    for(const line of dimensionLines(zones,placements).filter(d=>zones.length>1||!d.global))for(const p of [line.da,line.db]) {
      const x=p.x,y=p.y;
      b.minX=Math.min(b.minX,x);b.maxX=Math.max(b.maxX,x);b.minY=Math.min(b.minY,y);b.maxY=Math.max(b.maxY,y);
    }
    const labelRoom=Math.max(.5,Math.max(b.maxX-b.minX,b.maxY-b.minY)*.08);b.minX-=labelRoom;b.maxX+=labelRoom;b.minY-=labelRoom*.4;b.maxY+=labelRoom*.4;
    return b;
  }
  return {spacingDimensions,validatePolygon,polygonGeometry,orthogonalPoint,resizePolygonSide,movePolygonVertex,insertPolygonVertex,removePolygonVertex,polygonSegments,transformPoint,bounds,projectBounds,vertices,path,segments,contains,technicalLayout,terraceJunctions,snapPlacement,dimensions,dimensionLines,drawingBounds};
})();
