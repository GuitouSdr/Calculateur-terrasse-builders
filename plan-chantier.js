'use strict';
// Un seul état graphique. state.zones référence les résultats du calculateur.
(() => {
  if(typeof window==='undefined')return;
  const root=document.getElementById('planChantier');
  const svg=document.getElementById('planSvg');
  const state={zones:[],placements:new Map(),selected:null,view:{x:-1,y:-1,w:10,h:7},
    visible:false,printing:false,printView:null,drag:null,guides:null,snap:true,
    display:{zones:true,names:true,dimensions:true,boards:false,joists:true,supports:true,spacing:true,grid:false}};
  const $=id=>document.getElementById(id);
  const esc=value=>BuilderUtils.escape(value);
  const fmt=value=>Number(value).toFixed(2).replace('.',',');
  const metres=value=>fmt(value)+' m';
  let timer=null,frame=null;
  let drawing=null,sideIndex=0,vertexIndex=0,editorBusy=false;
  const layouts=new WeakMap();
  let exportScope=null;
  const displayedZones=()=>exportScope?.zones||state.zones;
  const displayedPlacements=()=>exportScope?.placements||state.placements;
  const decimal=value=>Number(String(value).trim().replace(',','.'));
  const undoStack=[],redoStack=[];
  let coordinateEdit=null,historySignature='';
  function planSnapshot(){return {placements:[...state.placements].map(([id,p])=>[id,{...p}]),view:{...state.view},selected:state.selected};}
  function updateHistory(){$('planUndo').disabled=!undoStack.length;$('planRedo').disabled=!redoStack.length;}
  function recordPlan(before,label){
    const after=planSnapshot();
    if(JSON.stringify(before.placements)===JSON.stringify(after.placements)&&(label!=='Réinitialisation du plan'||JSON.stringify(before.view)===JSON.stringify(after.view)))return;
    undoStack.push({snapshot:before,label});if(undoStack.length>50)undoStack.shift();redoStack.length=0;updateHistory();
    $('planHistoryStatus').textContent=label==='Réinitialisation du plan'?'Plan réinitialisé. Cliquez sur Annuler pour retrouver sa disposition.':'';
  }
  function finishCoordinate(){if(coordinateEdit){recordPlan(coordinateEdit,'Déplacement de la zone');coordinateEdit=null;refreshCalculation();}}
  function historyAction(label,action){finishCoordinate();const before=planSnapshot();action();recordPlan(before,label);refreshCalculation();}
  function restoreHistory(from,to,verb){
    finishCoordinate();if(state.drag||drawing)return;
    const entry=from.pop();if(!entry)return;
    to.push({snapshot:planSnapshot(),label:entry.label});
    state.placements=new Map(entry.snapshot.placements.map(([id,p])=>[id,{...p}]));state.view={...entry.snapshot.view};state.selected=entry.snapshot.selected;state.guides=null;
    updateHistory();updateSelection();renderPlanChantier();$('planHistoryStatus').textContent=entry.label+' '+verb+'.';refreshCalculation();
  }
  function clearHistory(){undoStack.length=redoStack.length=0;coordinateEdit=null;updateHistory();$('planHistoryStatus').textContent='';}
  function editorStatus(message){$('polygonStatus').textContent=message;}
  function editorPoints(){return drawing?drawing.points:selectedZone()?.geometry.points;}
  function updatePolygonEditor(){
    if(editorBusy)return;
    const points=editorPoints(),custom=selectedZone()?.geometry.forme==='polygone';
    $('planPolygonEditor').hidden=!drawing&&!custom;
    for(const id of ['polygonClose','polygonUndo','polygonCancel'])$(id).hidden=!drawing;
    for(const id of ['polygonVertex','polygonVertexX','polygonVertexY','polygonMove','polygonInsert','polygonDelete'])$(id).hidden=!!drawing;
    $('polygonBoardDirection').hidden=!drawing;$('polygonBoardDirection').disabled=!drawing;
    for(const label of $('planPolygonEditor').querySelectorAll('label[for]'))label.hidden=$(label.htmlFor).hidden;
    $('polygonEditHelp').hidden=!!drawing;
    $('polygonEditHelp').textContent=selectedZone()?.geometry.freeForm?'Forme importée : les côtés obliques sont conservés. Déplacez librement un sommet ; les intersections sont refusées.':'Les raccords partageant la même coordonnée suivent la cote pour garder des angles droits. Un sommet ajouté divise un côté.';
    if(!points)return;
    const count=drawing?Math.max(0,points.length-1):points.length;
    sideIndex=Math.max(0,Math.min(sideIndex,count-1));vertexIndex=Math.max(0,Math.min(vertexIndex,points.length-1));
    $('polygonSide').innerHTML=Array.from({length:count},(_,i)=>`<option value="${i}">Côté ${i+1} · ${metres(Math.hypot(points[(i+1)%points.length].x-points[i].x,points[(i+1)%points.length].y-points[i].y))}</option>`).join('');
    $('polygonSide').value=String(sideIndex);
    const a=points[sideIndex],b=points[(sideIndex+1)%points.length];
    $('polygonLength').value=count&&a&&b?fmt(Math.hypot(b.x-a.x,b.y-a.y)):'';
    $('polygonLength').disabled=!count;$('polygonConfirm').disabled=!count;
    $('polygonSide').disabled=!!drawing;
    $('polygonVertex').innerHTML=points.map((p,i)=>`<option value="${i}">Sommet ${i+1}</option>`).join('');$('polygonVertex').value=String(vertexIndex);
    if(points[vertexIndex]){$('polygonVertexX').value=fmt(points[vertexIndex].x);$('polygonVertexY').value=fmt(points[vertexIndex].y);}
  }
  function startDrawing(){drawing={points:[],preview:null,pending:false};state.drag=null;sideIndex=0;updatePolygonEditor();editorStatus('Cliquez pour placer le premier sommet. Échap annule.');svg.classList.add('drawing');requestRender();}
  function cancelDrawing(){drawing=null;svg.classList.remove('drawing');updatePolygonEditor();requestRender();}
  function acceptDrawingPoint(point){
    if(drawing.pending){editorStatus('Validez la longueur avec Entrée avant le prochain sommet.');return;}
    const p=drawing.points,last=p.at(-1),next=last?PlanGeometry.orthogonalPoint(last,point):point;
    if(last&&Math.hypot(next.x-last.x,next.y-last.y)<.001)return;
    p.push({x:Math.round(next.x*100)/100,y:Math.round(next.y*100)/100});drawing.preview=null;drawing.pending=p.length>1;sideIndex=Math.max(0,p.length-2);updatePolygonEditor();requestRender();
    editorStatus(drawing.pending?'Saisissez la longueur, puis Entrée pour continuer.':'Déplacez le pointeur puis cliquez pour créer le premier côté.');
    if(drawing.pending)$('polygonLength').focus({preventScroll:true});
  }
  function changeLength(commit=false){
    try{
      const points=editorPoints(),length=decimal($('polygonLength').value);if(!points||!Number.isFinite(length)||length<=0)throw new Error('Saisissez une longueur positive.');
      editorBusy=true;
      if(drawing){const a=points[sideIndex],b=points[sideIndex+1],axis=Math.abs(b.x-a.x)>.00000001?'x':'y';b[axis]=a[axis]+Math.sign(b[axis]-a[axis])*length;if(commit){drawing.pending=false;svg.focus({preventScroll:true});}}
      else commitPolygon(PlanGeometry.resizePolygonSide(points,sideIndex,length,selectedZone().geometry));
      editorStatus(drawing?(commit?'Cliquez pour ajouter le côté suivant.':'Cote mise à jour. Entrée pour continuer.'):'Cote mise à jour ; calcul et structure recalculés.');requestRender();return true;
    }catch(error){editorStatus(error.message);return false;}finally{editorBusy=false;if(commit)updatePolygonEditor();}
  }
  function commitPolygon(points){
    const z=selectedZone();if(!z)return;
    // Conserve les coordonnées mondiales malgré la normalisation et le nouveau centre de rotation.
    const old=z.geometry,p=state.placements.get(z.id),g=PlanGeometry.polygonGeometry(points,old),r=p.rotation*Math.PI/180,c=Math.cos(r),si=Math.sin(r);
    const dx=old.outerLength/2-g.outerLength/2,dy=old.outerWidth/2-g.outerWidth/2;
    p.x+=dx+c*(g.origin.x-dx)-si*(g.origin.y-dy);p.y+=dy+si*(g.origin.x-dx)+c*(g.origin.y-dy);
    window.ProjectFromPlan?.shiftOrigin(z.id,g.origin);
    setZonePolygon(z.id,g.points);updatePolygonEditor();requestRender();
  }
  function closeDrawing(){
    if(!drawing)return;
    try{
      if(drawing.pending&&!changeLength(true))return;
      const points=drawing.points.slice();if(points.length>1&&Math.hypot(points.at(-1).x-points[0].x,points.at(-1).y-points[0].y)<.001)points.pop();
      PlanGeometry.validatePolygon(points);const created=createPolygonZone(points,{sensPose:$('polygonBoardDirection').value});
      drawing=null;svg.classList.remove('drawing');state.placements.set(created.id,{x:created.origin.x,y:created.origin.y,rotation:0});selectPlanZone(created.id);editorStatus('Zone créée dans le calculateur — chiffrage estimatif.');fitPlanToView();
    }catch(error){editorStatus(error.message+' Ajustez ou annulez le dernier point.');}
  }
  function renderPolygonEditor(){
    const unit=screenUnit(),points=state.drag?.kind==='vertex'&&state.drag.candidate?state.drag.candidate:editorPoints();if(!points||state.printing)return '';
    if(drawing){const p=points.slice();if(drawing.preview&&!drawing.pending)p.push(drawing.preview);return `<g class="polygon-draft"><path d="${p.map((v,i)=>`${i?'L':'M'}${v.x} ${v.y}`).join('')}"/>${p.map((v,i)=>`<circle cx="${v.x}" cy="${v.y}" r="${5*unit}"/>${i?dimensionMarkup(p[i-1],v,{x:0,y:-.2},Math.hypot(v.x-p[i-1].x,v.y-p[i-1].y)):''}`).join('')}</g>`;}
    const z=selectedZone();if(z?.geometry.forme!=='polygone')return '';
    return `<g class="polygon-handles" transform="${shapeTransform(z)}">${state.drag?.candidate?`<path class="polygon-preview" d="${points.map((v,i)=>`${i?'L':'M'}${v.x} ${v.y}`).join('')}Z"/>`:''}${points.map((a,i)=>{const b=points[(i+1)%points.length];return `<line class="polygon-side ${i===sideIndex?'active':''}" data-polygon-side="${i}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><circle data-polygon-vertex="${i}" cx="${a.x}" cy="${a.y}" r="${5*unit}"/><text pointer-events="none" x="${a.x+8*unit}" y="${a.y-8*unit}" font-size="${11*unit}">${i+1}</text>`;}).join('')}</g>`;
  }
  function localPoint(point,z){const p=state.placements.get(z.id),g=z.geometry,r=-p.rotation*Math.PI/180,c=Math.cos(r),si=Math.sin(r),x=point.x-p.x-g.outerLength/2,y=point.y-p.y-g.outerWidth/2;return {x:Math.round((g.outerLength/2+x*c-y*si)*100)/100,y:Math.round((g.outerWidth/2+x*si+y*c)*100)/100};}

  function layout(zone){if(!layouts.has(zone))layouts.set(zone,PlanGeometry.technicalLayout(zone));return layouts.get(zone);}
  function activeDisplay(){return state.printing?{...state.display,zones:true,names:true,dimensions:true,grid:false}:state.display;}
  function dimensionsMargin(){return Math.max(1.2,...state.zones.map(z=>Math.max(z.geometry.outerLength,z.geometry.outerWidth)*.16));}
  function viewAspect(){const box=svg.getBoundingClientRect();return box.width/Math.max(box.height,1)||1.5;}
  function fitPlanToView(){
    const zones=displayedZones(),b=PlanGeometry.drawingBounds(zones,displayedPlacements(),activeDisplay().dimensions),pad=zones.length===1&&zones[0].geometry.forme==='rectangle'?.2:Math.max(.4,exportScope?1.2*.35:dimensionsMargin()*.35);
    if(activeDisplay().dimensions)b.maxX+=(b.maxX-b.minX)*Math.min(.35,110/(exportScope?1100:Math.max(svg.getBoundingClientRect().width,300)));
    if(drawing&&!exportScope)for(const p of [...drawing.points,...(drawing.preview?[drawing.preview]:[])]){b.minX=Math.min(b.minX,p.x-.4);b.maxX=Math.max(b.maxX,p.x+.4);b.minY=Math.min(b.minY,p.y-.4);b.maxY=Math.max(b.maxY,p.y+.4);}
    let w=b.maxX-b.minX+2*pad,h=b.maxY-b.minY+2*pad;
    const aspect=state.printing?277/142:viewAspect();
    if(w/h<aspect)w=h*aspect;else h=w/aspect;
    state.view={x:(b.minX+b.maxX-w)/2,y:(b.minY+b.maxY-h)/2,w,h};
    renderPlanChantier();
  }
  function requestRender(){if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;renderPlanChantier();});}
  function screenUnit(){return state.view.w/(exportScope?1100:Math.max(svg.getBoundingClientRect().width,300));}
  function defaultPlacement(zone,index){
    if(!index)return {x:0,y:0,rotation:0};
    const previous=state.zones.slice(0,index).filter(z=>state.placements.has(z.id));
    const b=PlanGeometry.projectBounds(previous,state.placements);
    return {x:b.maxX+.75,y:0,rotation:0};
  }
  function getProjectSnapshot(){let connections=[];try{connections=window.TerraceConnections?.calculate(state.zones)||[];}catch{}return {connections,zones:state.zones,placements:new Map([...state.placements].map(([id,p])=>[id,{...p}])),layouts:new Map(state.zones.map(z=>[z.id,layout(z)])),importedPlans:window.ProjectFromPlan?.overlays(state.zones)||[]};}
  function notify3D(){if(typeof window.Terrace3D?.sync==='function')window.Terrace3D.sync(getProjectSnapshot());}
  function sync(zones){
    const first=!state.zones.length;
    const signature=JSON.stringify(zones.map(z=>[z.id,z.geometry]));
    if(signature!==historySignature){clearHistory();historySignature=signature;}
    state.zones=zones;
    const ids=new Set(zones.map(z=>z.id));
    for(const id of state.placements.keys())if(!ids.has(id))state.placements.delete(id);
    zones.forEach((z,i)=>{if(!state.placements.has(z.id))state.placements.set(z.id,defaultPlacement(z,i));});
    if(!ids.has(state.selected))state.selected=zones[0]?.id??null;
    $('planEmpty').hidden=!!zones.length;
    $('planEmpty').textContent=zones.length?'':'Saisissez des dimensions valides dans le calculateur pour afficher le plan.';
    updateSelection();
    if(first&&state.visible)fitPlanToView();else requestRender();
    notify3D();
  }
  function invalidate(message){
    state.zones=[];state.selected=null;state.drag=null;state.guides=null;
    // Les positions des identifiants existants restent conservées pendant la correction.
    $('planEmpty').hidden=false;
    $('planEmpty').textContent=message||'Les données du calculateur sont incomplètes.';
    updateSelection();requestRender();notify3D();
  }
  function selectPlanZone(id){state.selected=Number(id);updateSelection();requestRender();}
  function updateSelection(){
    updatePolygonEditor();
    const zone=state.zones.find(z=>z.id===state.selected);
    $('planZoneSelect').innerHTML=state.zones.map(z=>`<option value="${z.id}">${esc(z.nom)}</option>`).join('');
    if(zone)$('planZoneSelect').value=String(zone.id);
    $('planBoardDirection').value=zone?document.getElementById(`sensPose-${zone.id}`).value:'auto';
    for(const element of root.querySelectorAll('[data-requires-selection]'))element.disabled=!zone;
    if(!zone){$('planSelection').textContent='Aucune zone sélectionnée.';$('planX').value='';$('planY').value='';return;}
    const p=state.placements.get(zone.id),l=layout(zone);
    $('planX').value=p.x.toFixed(2);$('planY').value=p.y.toFixed(2);
    $('planSelection').innerHTML=`<dl><dt>Nom</dt><dd>${esc(zone.nom)}</dd><dt>Niveau relatif</dt><dd>+${((zone.niveauMm||0)/1000).toFixed(2)} m${zone.niveauMm?" · support surélevé à chiffrer séparément":""}</dd><dt>Forme</dt><dd>${esc(zone.geometry.label)}</dd>
      <dt>Longueur</dt><dd>${metres(zone.geometry.outerLength)}</dd><dt>Largeur</dt><dd>${metres(zone.geometry.outerWidth)}</dd>
      <dt>Surface</dt><dd>${fmt(zone.surface)} m²</dd><dt>Lames</dt><dd>${zone.orientation==='longueur'?'Longueur':'Largeur'}</dd>
      <dt>Entraxe lambourdes</dt><dd>${metres(zone.entraxeLamb)}</dd><dt>Entraxe plots max.</dt><dd>${metres(zone.entraxePlot)}</dd>
      <dt>Rotation</dt><dd>${p.rotation}°</dd><dt>Plots chiffrés</dt><dd>${zone.nbPlots}</dd>
      <dt>Appuis ${l.indicative?'projetés':'placés'}</dt><dd>${l.light?'Affichage allégé':l.supports.length}</dd></dl>`;
  }
  function shapeTransform(zone){const p=displayedPlacements().get(zone.id),g=zone.geometry;return `translate(${p.x} ${p.y}) rotate(${p.rotation} ${g.outerLength/2} ${g.outerWidth/2})`;}
  function renderDeckBoards(zone){
    const g=zone.geometry,pitch=(zone.lame.Largeur_mm+zone.jeuLameMm)/1000;
    const size=screenUnit(),font=12*size;
    const horizontal=zone.orientation==='longueur';
    const cx=g.outerLength/2,cy=g.outerWidth*.32,arrow=Math.min(horizontal?g.outerLength:g.outerWidth,.9);
    const x=horizontal?cx-arrow/2:cx,y=horizontal?cy:cy-arrow/2;
    return `<path d="${PlanGeometry.path(g)}" fill="url(#plan-board-${zone.id})" fill-rule="evenodd" pointer-events="none"/>
      <g class="plan-direction" font-size="${font}"><path d="M${x} ${y} ${horizontal?'h':'v'}${arrow}" fill="none" stroke="#776247" stroke-width="1.5" vector-effect="non-scaling-stroke" marker-end="url(#plan-direction-arrow)"/>
      <text x="${x}" y="${y-font*.6}">Sens des lames</text></g>`;
  }
  function renderJoists(zone){
    const width=Number(zone.section.split('x')[0])/1000;
    return `<path class="plan-joists" data-section="${esc(zone.section)}" d="${layout(zone).rails.map(r=>Math.abs(r.a.x-r.b.x)<1e-8?`M${r.a.x-width/2} ${r.a.y}h${width}v${r.b.y-r.a.y}h${-width}Z`:`M${r.a.x} ${r.a.y-width/2}h${r.b.x-r.a.x}v${width}h${r.a.x-r.b.x}Z`).join('')}"/>`;
  }
  function renderSupports(zone){
    const radius=Math.min(.095,zone.entraxeLamb*.22,zone.entraxePlot*.22),points=layout(zone).supports;
    return `<path class="plan-supports" data-support-count="${points.length}" d="${points.map(p=>`M${p.x-radius} ${p.y}a${radius} ${radius} 0 1 0 ${2*radius} 0a${radius} ${radius} 0 1 0 ${-2*radius} 0`).join('')}"/>`;
  }
  function renderPlanZones(display){
    const font=14*screenUnit();
    return displayedZones().map(zone=>{const index=state.zones.indexOf(zone);
      const g=zone.geometry,d=PlanGeometry.path(g),clip=`url(#plan-clip-${zone.id})`;
      return `<g class="plan-zone${state.selected===zone.id&&!state.printing?' selected':''}" data-zone-id="${zone.id}" transform="${shapeTransform(zone)}" tabindex="0" role="button" aria-label="Sélectionner ${esc(zone.nom)}">
        <path class="plan-outline" d="${d}" fill-rule="evenodd"/>
        ${display.supports?renderSupports(zone):''}<g clip-path="${clip}" pointer-events="none">${display.boards?renderDeckBoards(zone):''}${display.joists?renderJoists(zone):''}</g>
        ${display.names?`<text class="plan-name" text-anchor="middle" x="${g.outerLength/2}" y="${g.outerWidth*.56}" font-size="${font}" transform="rotate(${-displayedPlacements().get(zone.id).rotation} ${g.outerLength/2} ${g.outerWidth*.56})">Z${index+1} · ${esc(zone.nom)}</text>`:''}
      </g>`;
    }).join('');
  }
  let dimensionLabels=[];
  function dimensionMarkup(a,b,offset,value,prefix='',extra='',endpoints=null){
    const da=endpoints?.da||{x:a.x+offset.x,y:a.y+offset.y},db=endpoints?.db||{x:b.x+offset.x,y:b.y+offset.y};
    const unit=screenUnit(),small=extra.includes('spacing'),font=(small?11:14)*unit,text=prefix+metres(value),width=(text.length*(small?6:7.5)+12)*unit,height=(small?17:22)*unit;
    const vertical=Math.abs(db.x-da.x)<Math.abs(db.y-da.y),mx=(da.x+db.x)/2,my=(da.y+db.y)/2;
    let tx=mx+(vertical?width/2+7*unit:0),ty=my-(vertical?0:height/2+5*unit);
    const overlap=(x,y)=>dimensionLabels.some(r=>Math.abs(r.x-x)<(r.width+width)/2+4*unit&&Math.abs(r.y-y)<(r.height+height)/2+3*unit);
    for(let i=0;i<30&&overlap(tx,ty);i++){if(vertical)ty+=height+5*unit;else tx+=width+8*unit;}
    dimensionLabels.push({x:tx,y:ty,width,height});
    return `<g class="plan-dimension ${extra}" data-dimension="${value}" pointer-events="none">
      <line class="plan-dimension-extension" x1="${a.x}" y1="${a.y}" x2="${da.x}" y2="${da.y}"/><line class="plan-dimension-extension" x1="${b.x}" y1="${b.y}" x2="${db.x}" y2="${db.y}"/>
      <line x1="${da.x}" y1="${da.y}" x2="${db.x}" y2="${db.y}" /><path d="M${da.x-3*unit} ${da.y+3*unit}l${6*unit} ${-6*unit}M${db.x-3*unit} ${db.y+3*unit}l${6*unit} ${-6*unit}" fill="none" stroke="#222" stroke-width="1" vector-effect="non-scaling-stroke"/>
      ${Math.abs(tx-mx)>width/2+8*unit||Math.abs(ty-my)>height*1.5?`<path class="plan-dimension-extension" d="M${mx} ${my}H${tx}V${ty}" fill="none"/>`:''}
      <rect class="plan-dimension-label" x="${tx-width/2}" y="${ty-height/2}" width="${width}" height="${height}" rx="${3*unit}"/>
      <text x="${tx}" y="${ty}" dy="${font*.34}" text-anchor="middle" font-size="${font}">${esc(text)}</text></g>`;
  }
  function renderDimensions(){
    dimensionLabels=[];
    const zones=displayedZones(),placements=displayedPlacements();
    const main=PlanGeometry.dimensionLines(zones,placements).filter(d=>zones.length>1||!d.global).sort((a,b)=>Number(b.global)-Number(a.global)).map(d=>dimensionMarkup(d.a,d.b,d.offset,d.value,d.prefix,d.global?'global':'',d)).join('');
    const z=exportScope?.zones[0]||selectedZone();if(!activeDisplay().spacing||!z)return main;
    const p=placements.get(z.id),g=z.geometry;
    const spacings=PlanGeometry.spacingDimensions(z),unit=screenUnit();
    return main+spacings.filter(d=>d.value/unit>=48).map(d=>{const a=PlanGeometry.transformPoint(d.a,g,p),b=PlanGeometry.transformPoint(d.b,g,p),shift=PlanGeometry.transformPoint({x:d.a.x+d.offset.x,y:d.a.y+d.offset.y},g,p);return dimensionMarkup(a,b,{x:shift.x-a.x,y:shift.y-a.y},d.value,'','spacing');}).join('');
  }
  function updatePlanTransform(){svg.setAttribute('viewBox',`${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);}
  function updateScale(){
    const unit=screenUnit(),target=100*unit;
    const base=10**Math.floor(Math.log10(target));
    const length=[1,2,5,10].map(v=>v*base).filter(v=>v<=target).at(-1)||base;
    const width=length/unit;
    $('planScale').innerHTML=`<path d="M15 15v9m0-4h${width}m0-4v9" fill="none" stroke="#17212b" stroke-width="2"/><text x="${15+width/2}" y="39" text-anchor="middle" font-size="12" fill="#17212b">${metres(length)}</text>`;
  }
  function renderPlanChantier(){
    if(!state.visible&&!state.printing)return;
    const restoreFocus=svg.contains(document.activeElement);
    const display=activeDisplay(),size=screenUnit(),view=state.view;
    const defs=displayedZones().map(z=>{
      const pitch=(z.lame.Largeur_mm+z.jeuLameMm)/1000;
      const line=z.orientation==='longueur'?`M0 0h${pitch}`:`M0 0v${pitch}`;
      return `<clipPath id="plan-clip-${z.id}"><path d="${PlanGeometry.path(z.geometry)}" clip-rule="evenodd"/></clipPath>
        <pattern id="plan-board-${z.id}" patternUnits="userSpaceOnUse" width="${pitch}" height="${pitch}"><path d="${line}" fill="none" stroke="#ac936f" stroke-width=".7" vector-effect="non-scaling-stroke"/></pattern>`;
    }).join('');
    const gridStep=10**Math.floor(Math.log10(Math.max(view.w/20,.01)));
    const grid=display.grid?`<rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="url(#plan-grid)" pointer-events="none"/>`:'';
    const guides=state.guides?`<g class="plan-guides">${state.guides.guideX!==null?`<line x1="${state.guides.guideX}" x2="${state.guides.guideX}" y1="${view.y}" y2="${view.y+view.h}"/>`:''}${state.guides.guideY!==null?`<line y1="${state.guides.guideY}" y2="${state.guides.guideY}" x1="${view.x}" x2="${view.x+view.w}"/>`:''}</g>`:'';
    svg.innerHTML=`<defs>${defs}<pattern id="plan-support-hatch" width="${5*size}" height="${5*size}" patternUnits="userSpaceOnUse"><rect width="${5*size}" height="${5*size}" fill="white"/><path d="M0 ${5*size}L${5*size} 0M${-size} ${size}L${size} ${-size}M${4*size} ${6*size}L${6*size} ${4*size}" stroke="#333" stroke-width=".65" vector-effect="non-scaling-stroke"/></pattern><pattern id="plan-joist-dots" width="${4*size}" height="${4*size}" patternUnits="userSpaceOnUse"><rect width="${4*size}" height="${4*size}" fill="white"/><circle cx="${2*size}" cy="${2*size}" r="${.5*size}" fill="#555"/></pattern><pattern id="plan-grid" width="${gridStep}" height="${gridStep}" patternUnits="userSpaceOnUse"><path d="M${gridStep} 0H0V${gridStep}" stroke="#dbe3e7" fill="none" stroke-width=".7" vector-effect="non-scaling-stroke"/></pattern>
      <marker id="plan-dim-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="${6*size}" markerHeight="${6*size}" orient="auto-start-reverse"><path d="M10 0L0 5L10 10" fill="none" stroke="#475569" stroke-width="1.2"/></marker>
      <marker id="plan-direction-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="${7*size}" markerHeight="${7*size}" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#776247" stroke="none"/></marker></defs>
      ${grid}<g id="planScene">${display.zones?renderPlanZones(display):''}${window.ContextPlan?.markup(size,state.printing)||''}${window.TerraceConnections?.planMarkup(state.zones,size)||''}${display.dimensions?renderDimensions():''}</g>${guides}${renderPolygonEditor()}`;
    updatePlanTransform();updateScale();if(!exportScope)notify3D();
    if(restoreFocus)svg.focus({preventScroll:true});
    const current=selectedZone();$('planJoistLabel').textContent='Lambourdes '+(current?current.section.replace('x',' × ')+' mm':'');$('planBoardLabel').textContent='Lames '+(current?current.lame.Epaisseur_mm+' × '+current.lame.Largeur_mm+' mm':'');
    $('planSurface').textContent=fmt(state.zones.reduce((s,z)=>s+z.surface,0))+' m²';
    $('planZoneCount').textContent=String(state.zones.length);
    $('planDate').textContent=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris'}).format(new Date());
    $('planProjectName').textContent=$('planProject').value.trim()||'Projet terrasse';
    const indicative=state.zones.some(z=>layout(z).indicative),light=state.zones.some(z=>layout(z).light);
    $('planTechnicalNote').textContent=(indicative?'Formes complexes : appuis projetés à partir des entraxes ; les quantités chiffrées comprennent des estimations et les renforts de rive restent à définir. ':'Rectangles : lignes de lambourdes et nombres de plots repris des résultats du calculateur. ')+(light?'Affichage allégé pour les grandes zones. ':'')+'Surface cumulée des zones, sans déduction des superpositions. Plan coté ; ne pas mesurer sur une impression redimensionnée.';
  }
  function zoom(factor,point){
    const v=state.view;
    const newW=Math.min(2000,Math.max(.8,v.w*factor)),ratio=newW/v.w;
    const center=point||{x:v.x+v.w/2,y:v.y+v.h/2};
    state.view={x:center.x-(center.x-v.x)*ratio,y:center.y-(center.y-v.y)*ratio,w:newW,h:v.h*ratio};requestRender();
  }
  function selectedZone(){return state.zones.find(z=>z.id===state.selected);}
  function rotate(degrees){const z=selectedZone();if(!z)return;const p=state.placements.get(z.id);p.rotation=(p.rotation+degrees+360)%360;updateSelection();requestRender();}
  function centerSelected(){const z=selectedZone();if(!z)return;const p=state.placements.get(z.id);p.x=state.view.x+state.view.w/2-z.geometry.outerLength/2;p.y=state.view.y+state.view.h/2-z.geometry.outerWidth/2;updateSelection();requestRender();}
  function resetPosition(){const z=selectedZone();if(!z)return;state.placements.set(z.id,defaultPlacement(z,state.zones.indexOf(z)));updateSelection();requestRender();}
  function resetPlan(){state.placements.clear();state.zones.forEach((z,i)=>state.placements.set(z.id,defaultPlacement(z,i)));state.guides=null;updateSelection();fitPlanToView();}
  function show(mode){
    clearTimeout(timer);refreshCalculation();
    state.visible=mode==='plan';
    $('calculateurSection').hidden=mode!=='calculator';root.hidden=!state.visible;
    const imported=document.getElementById('importPlanSection'),importTab=document.getElementById('tabImportPlan');if(imported)imported.hidden=mode!=='import';if(importTab)importTab.setAttribute('aria-selected',String(mode==='import'));
    const three=document.getElementById('terrace3d'),threeTab=document.getElementById('tabVue3D');if(three)three.hidden=mode!=='3d';if(threeTab)threeTab.setAttribute('aria-selected',String(mode==='3d'));
    if(mode!=='3d')window.Terrace3D?.hide?.();
    $('tabCalculateur').setAttribute('aria-selected',String(mode==='calculator'));$('tabPlanChantier').setAttribute('aria-selected',String(state.visible));
    if(state.visible)fitPlanToView();
  }
  function preset(technical){
    Object.assign(state.display,{zones:true,names:true,dimensions:true,boards:false,joists:technical,supports:technical,spacing:technical});
    for(const input of root.querySelectorAll('[data-plan-display]'))input.checked=state.display[input.dataset.planDisplay];
    requestRender();
  }
  function refreshCalculation(){calculTerrasseMulti({silent:true});}
  function scheduleSync(){clearTimeout(timer);timer=setTimeout(refreshCalculation,160);}
  function pointFromEvent(event){const matrix=svg.getScreenCTM();if(!matrix)return {x:0,y:0};const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return {x:point.x,y:point.y};}
  function pointerDown(event){
    if(event.button!==0)return;
    if(drawing){event.preventDefault();if(event.detail<2)acceptDrawingPoint(pointFromEvent(event));return;}
    const handle=event.target.closest('[data-polygon-vertex]'),side=event.target.closest('[data-polygon-side]');
    if(handle){vertexIndex=Number(handle.dataset.polygonVertex);updatePolygonEditor();const z=selectedZone();state.drag={kind:'vertex',id:z.id,points:z.geometry.points.map(p=>({...p}))};svg.setPointerCapture(event.pointerId);event.preventDefault();return;}
    if(side){sideIndex=Number(side.dataset.polygonSide);updatePolygonEditor();editorStatus('Modifiez la longueur du côté sélectionné.');requestRender();return;}
    const group=event.target.closest('[data-zone-id]');
    const point=pointFromEvent(event);
    if(group){finishCoordinate();const before=planSnapshot(),id=Number(group.dataset.zoneId);selectPlanZone(id);state.drag={kind:'zone',id,start:point,placement:{...state.placements.get(id)},before};}
    else state.drag={kind:'view',start:point,view:{...state.view},clientX:event.clientX,clientY:event.clientY};
    svg.setPointerCapture(event.pointerId);event.preventDefault();
  }
  function pointerMove(event){
    if(drawing){const last=drawing.points.at(-1);if(last&&!drawing.pending){drawing.preview=PlanGeometry.orthogonalPoint(last,pointFromEvent(event));requestRender();}return;}
    if(state.drag?.kind==='vertex'){
      try{const z=selectedZone(),point=localPoint(pointFromEvent(event),z);const candidate=PlanGeometry.movePolygonVertex(state.drag.points,vertexIndex,point,z.geometry);state.drag.candidate=candidate;editorStatus('Relâchez pour valider le sommet.');
        // Aperçu validé dans le moteur, recalcul seulement au relâchement.
        const at=candidate[vertexIndex];$('polygonVertexX').value=fmt(at.x);$('polygonVertexY').value=fmt(at.y);requestRender();
      }catch(error){state.drag.candidate=null;editorStatus(error.message);}return;
    }
    const drag=state.drag;if(!drag)return;
    if(drag.kind==='view'){
      const box=svg.getBoundingClientRect();
      state.view={...drag.view,x:drag.view.x-(event.clientX-drag.clientX)*drag.view.w/box.width,y:drag.view.y-(event.clientY-drag.clientY)*drag.view.h/box.height};
    }else{
      const point=pointFromEvent(event),z=state.zones.find(z=>z.id===drag.id);
      if(!z)return;
      const proposed={...drag.placement,x:drag.placement.x+point.x-drag.start.x,y:drag.placement.y+point.y-drag.start.y};
      const result=state.snap?PlanGeometry.snapPlacement(z,proposed,state.zones,state.placements,12*screenUnit()):{placement:proposed};
      state.placements.set(z.id,result.placement);state.guides=state.snap?result:null;
    }
    requestRender();
  }
  function pointerUp(event){if(!state.drag)return;const movedZone=state.drag.kind==='zone';if(state.drag.kind==='zone')recordPlan(state.drag.before,'Déplacement de la zone');if(event.type!=='pointercancel'&&state.drag.kind==='vertex'&&state.drag.candidate){try{commitPolygon(state.drag.candidate);editorStatus('Sommet déplacé ; calcul recalculé.');}catch(error){editorStatus(error.message);}}state.drag=null;state.guides=null;if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);updateSelection();requestRender();if(movedZone)refreshCalculation();}
  function beforePrint(){
    if(state.printing)return;
    clearTimeout(timer);refreshCalculation();
    state.printView={...state.view};state.printing=true;fitPlanToView();
  }
  function afterPrint(){if(!state.printing)return;state.printing=false;if(state.printView)state.view=state.printView;state.printView=null;requestRender();}
  function printPlan(){beforePrint();try{window.print();}finally{afterPrint();}}
  function getZoneExport(id){
    const overview=id===null,zone=overview?state.zones[0]:state.zones.find(z=>z.id===Number(id));if(!zone)throw new Error('Choisissez une zone valide à exporter.');
    const textIds=['planSurface','planZoneCount','planDate','planProjectName','planJoistLabel','planBoardLabel','planTechnicalNote'];
    const previous={view:state.view,printing:state.printing,html:svg.innerHTML,texts:textIds.map(key=>[key,$(key).textContent]),scale:$('planScale').innerHTML};
    try{exportScope={zones:overview?state.zones:[zone],placements:overview?state.placements:new Map([[zone.id,{x:0,y:0,rotation:0}]])};state.printing=true;fitPlanToView();
      return {id:overview?null:zone.id,index:overview?null:state.zones.indexOf(zone)+1,name:overview?'Vue d’ensemble du chantier':zone.nom,project:$('planProject').value.trim()||'Projet terrasse',surface:exportScope.zones.reduce((n,z)=>n+z.surface,0),perimeter:exportScope.zones.reduce((n,z)=>n+z.perimeter,0),orientation:overview?'par zone':zone.orientation,section:zone.section,boardLabel:`Lames ${zone.lame.Epaisseur_mm} × ${zone.lame.Largeur_mm} mm`,indicative:exportScope.zones.some(z=>layout(z).indicative),light:exportScope.zones.some(z=>layout(z).light),viewBox:`${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`,markup:svg.innerHTML};
    }finally{exportScope=null;state.printing=previous.printing;state.view=previous.view;svg.innerHTML=previous.html;updatePlanTransform();$('planScale').innerHTML=previous.scale;for(const [key,value] of previous.texts)$(key).textContent=value;}
  }
  $('planDraw').addEventListener('click',startDrawing);
  $('polygonLength').addEventListener('input',()=>changeLength(false));
  $('polygonLength').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();changeLength(true);}});
  $('polygonConfirm').addEventListener('click',()=>changeLength(true));$('polygonClose').addEventListener('click',closeDrawing);$('polygonCancel').addEventListener('click',cancelDrawing);
  $('polygonUndo').addEventListener('click',()=>{if(!drawing)return;drawing.points.pop();drawing.pending=false;drawing.preview=null;sideIndex=Math.max(0,drawing.points.length-2);updatePolygonEditor();requestRender();});
  $('polygonSide').addEventListener('change',event=>{sideIndex=Number(event.target.value);updatePolygonEditor();requestRender();});
  $('polygonVertex').addEventListener('change',event=>{vertexIndex=Number(event.target.value);updatePolygonEditor();requestRender();});
  const editAction=fn=>{try{commitPolygon(fn(editorPoints()));editorStatus('Géométrie mise à jour ; calcul recalculé.');}catch(error){editorStatus(error.message);}};
  $('polygonMove').addEventListener('click',()=>editAction(points=>PlanGeometry.movePolygonVertex(points,vertexIndex,{x:decimal($('polygonVertexX').value),y:decimal($('polygonVertexY').value)},selectedZone().geometry)));
  $('polygonInsert').addEventListener('click',()=>editAction(points=>PlanGeometry.insertPolygonVertex(points,sideIndex,selectedZone().geometry)));
  $('polygonDelete').addEventListener('click',()=>editAction(points=>PlanGeometry.removePolygonVertex(points,vertexIndex,selectedZone().geometry)));
  svg.addEventListener('dblclick',event=>{if(drawing){event.preventDefault();closeDrawing();}});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&drawing){event.preventDefault();cancelDrawing();}});
  $('tabCalculateur').addEventListener('click',()=>show('calculator'));
  $('tabPlanChantier').addEventListener('click',()=>show('plan'));
  $('planSimple').addEventListener('click',()=>preset(false));$('planTechnique').addEventListener('click',()=>preset(true));
  $('planFit').addEventListener('click',fitPlanToView);$('planZoomIn').addEventListener('click',()=>zoom(.8));$('planZoomOut').addEventListener('click',()=>zoom(1.25));
  $('planRotateLeft').addEventListener('click',()=>historyAction('Rotation de la zone',()=>rotate(-90)));$('planRotateRight').addEventListener('click',()=>historyAction('Rotation de la zone',()=>rotate(90)));
  $('planCenter').addEventListener('click',()=>historyAction('Centrage de la zone',centerSelected));$('planResetPosition').addEventListener('click',()=>historyAction('Réinitialisation de la position',resetPosition));$('planReset').addEventListener('click',()=>historyAction('Réinitialisation du plan',resetPlan));
  $('planUndo').addEventListener('click',()=>restoreHistory(undoStack,redoStack,'annulée'));$('planRedo').addEventListener('click',()=>restoreHistory(redoStack,undoStack,'rétablie'));
  root.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||event.target.isContentEditable)return;
    const key=event.key.toLowerCase();if(key!=='z'&&key!=='y')return;
    event.preventDefault();restoreHistory(key==='y'||event.shiftKey?redoStack:undoStack,key==='y'||event.shiftKey?undoStack:redoStack,key==='y'||event.shiftKey?'rétablie':'annulée');
  });
  $('planSnap').addEventListener('click',()=>{state.snap=!state.snap;$('planSnap').textContent='Aimantation : '+(state.snap?'OUI':'NON');$('planSnap').setAttribute('aria-pressed',String(state.snap));});
  $('planPrint').addEventListener('click',printPlan);
  $('planZoneSelect').addEventListener('change',event=>selectPlanZone(event.target.value));
  $('planBoardDirection').addEventListener('change',event=>{const zone=selectedZone();if(!zone)return;document.getElementById(`sensPose-${zone.id}`).value=event.target.value;calculTerrasseMulti({silent:true});});
  for(const input of root.querySelectorAll('[data-plan-display]'))input.addEventListener('change',()=>{state.display[input.dataset.planDisplay]=input.checked;requestRender();});
  for(const [id,axis] of [['planX','x'],['planY','y']]) {
    const updateCoordinate=commit=>{
      const z=selectedZone();if(!z)return;const value=Number($(id).value);
      if(!$(id).value||!Number.isFinite(value)||Math.abs(value)>10000){if(commit)updateSelection();return;}
      const p=state.placements.get(z.id),proposed={...p,[axis]:value};
      if(!coordinateEdit)coordinateEdit=planSnapshot();
      state.placements.set(z.id,proposed);if(commit)updateSelection();requestRender();
      if(commit){finishCoordinate();refreshCalculation();}
    };
    $(id).addEventListener('input',()=>updateCoordinate(false));
    $(id).addEventListener('change',()=>updateCoordinate(true));
    $(id).addEventListener('blur',finishCoordinate);
  }
  $('planProject').addEventListener('input',requestRender);
  svg.addEventListener('pointerdown',pointerDown);svg.addEventListener('pointermove',pointerMove);svg.addEventListener('pointerup',pointerUp);svg.addEventListener('pointercancel',pointerUp);
  svg.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY>0?1.12:1/1.12,pointFromEvent(event));},{passive:false});
  svg.addEventListener('keydown',event=>{
    const group=event.target.closest('[data-zone-id]');
    if(group&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectPlanZone(group.dataset.zoneId);return;}
    if(event.key==='Escape'&&drawing){cancelDrawing();return;}
    if(event.key==='Escape'){state.selected=null;updateSelection();requestRender();return;}
    if(drawing)return;
    const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=arrows[event.key];
    if(!delta)return;event.preventDefault();
    if(group)state.selected=Number(group.dataset.zoneId);
    const z=selectedZone();if(!z)return;
    const step=event.shiftKey?.01:.1,p=state.placements.get(z.id);
    historyAction('Déplacement de la zone',()=>{p.x+=delta[0]*step;p.y+=delta[1]*step;updateSelection();requestRender();});
  });
  const source=$('calculateurSection');source.addEventListener('input',scheduleSync);source.addEventListener('change',scheduleSync);
  new MutationObserver(scheduleSync).observe($('zonesContainer'),{childList:true});
  new ResizeObserver(()=>{if(!state.visible||state.printing)return;const ratio=viewAspect();const cy=state.view.y+state.view.h/2;state.view.h=state.view.w/ratio;state.view.y=cy-state.view.h/2;requestRender();}).observe(svg);
  window.addEventListener('beforeprint',beforePrint);window.addEventListener('afterprint',afterPrint);
  window.PlanChantier={getPlacements:()=>new Map([...state.placements].map(([id,p])=>[id,{...p}])),getProjectSnapshot,getZoneExport,sync,invalidate,show,renderPlanChantier,fitPlanToView,selectPlanZone,updatePlanTransform,pointFromEvent,undo(){restoreHistory(undoStack,redoStack,'annulée');},redo(){restoreHistory(redoStack,undoStack,'rétablie');},getHistoryState(){return {undo:undoStack.length,redo:redoStack.length};},setPlacements(items,label){historyAction(label,()=>{for(const [id,p] of items)if(state.zones.some(z=>z.id===id))state.placements.set(id,{...p});updateSelection();fitPlanToView();});},setPlacement(id,placement){state.placements.set(id,{...placement});requestRender();notify3D();scheduleSync();}};
  for(const input of root.querySelectorAll('[data-plan-display]'))input.checked=state.display[input.dataset.planDisplay];
  sync(dernierCalculZones);
})();
