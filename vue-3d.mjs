import * as THREE from './vendor/three/build/three.module.js';
import {OrbitControls} from './vendor/three/examples/jsm/controls/OrbitControls.js';
import {buildPlanOverlay} from './three-plan-overlay.mjs';
import {initPresentation3D} from './presentation-3d.mjs';

// Chaque ressource partagée est libérée une seule fois lors d'un nouveau calcul.
export function disposeObject(object){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  object.traverse(node=>{if(node.isInstancedMesh)node.dispose();});
  object.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of (Array.isArray(node.material)?node.material:[node.material]))if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
  textures.forEach(t=>{if(!t.userData.presentationShared)t.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>{if(!m.userData.presentationShared)m.dispose();});object.removeFromParent();object.clear();
}
export function buildConnectionMeshes(link,baseElevation=link.baseElevation){
  const root=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0xb88b59,roughness:.85});
  for(const p of link.parts){const mesh=new THREE.Mesh(new THREE.BoxGeometry(p.dx,p.dy,p.dz),wood);mesh.position.set(p.x,p.y,p.z);mesh.rotation.z=p.angle||0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.part=p.role;root.add(mesh);}
  root.position.set(link.x,baseElevation,link.z);root.rotation.y=THREE.MathUtils.degToRad(link.rotation);return root;
}
function boardGeometry(polygons,bottom,thickness){
  const vertices=[],edges=new Map();
  const vertex=(p,y)=>vertices.push(p.x,y,p.y);
  const triangle=(a,ya,b,yb,c,yc)=>{vertex(a,ya);vertex(b,yb);vertex(c,yc);};
  for(let polygon of polygons){
    const signed=polygon.reduce((s,a,i)=>{const b=polygon[(i+1)%polygon.length];return s+a.x*b.y-b.x*a.y;},0);if(signed<0)polygon=polygon.slice().reverse();
    for(let i=1;i<polygon.length-1;i++){triangle(polygon[0],bottom+thickness,polygon[i+1],bottom+thickness,polygon[i],bottom+thickness);triangle(polygon[0],bottom,polygon[i],bottom,polygon[i+1],bottom);}
    for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],key=[`${Math.round(a.x*1e8)},${Math.round(a.y*1e8)}`,`${Math.round(b.x*1e8)},${Math.round(b.y*1e8)}`].sort().join('|');if(edges.has(key))edges.delete(key);else edges.set(key,{a,b});}
  }
  for(const {a,b} of edges.values()){triangle(a,bottom,a,bottom+thickness,b,bottom);triangle(b,bottom,a,bottom+thickness,b,bottom+thickness);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry;
}
export function buildZoneMeshes(spec,model){
  const boards=new THREE.Group(),joists=new THREE.Group(),supports=new THREE.Group();
  const contour=spec.contour.outer.map(p=>new THREE.Vector2(p.x,p.y)),holes=spec.contour.holes.map(h=>h.map(p=>new THREE.Vector2(p.x,p.y)));
  const all=[...spec.contour.outer,...spec.contour.holes.flat()],triangles=THREE.ShapeUtils.triangulateShape(contour,holes).map(indices=>indices.map(i=>all[i]));
  const wood=Array.from({length:7},(_,i)=>new THREE.MeshStandardMaterial({color:new THREE.Color(0xb88752).offsetHSL(0,0,(i-3)*.009),roughness:.85,metalness:0}));
  const bottom=(spec.supportHeight||0)+spec.plotHeight+spec.joistHeight+(spec.extraHeight||0),coverage=spec.horizontal?spec.geometry.outerWidth:spec.geometry.outerLength;
  for(let i=0;i<spec.boardCount;i++){
    const start=i*spec.pitch,end=Math.min(start+spec.boardWidth,coverage),axis=spec.horizontal?'y':'x';
    const polygons=triangles.map(t=>model.clipTriangle(t,axis,start,end)).filter(p=>p.length);
    if(!polygons.length)continue;
    // Les lames restent éclairées par leurs normales ; les ombres sont reçues
    // par la structure et le sol pour éviter les artefacts sur les faces coplanaires.
    const mesh=new THREE.Mesh(boardGeometry(polygons,bottom,spec.boardThickness),wood[i%wood.length]);mesh.castShadow=true;mesh.receiveShadow=false;mesh.userData={part:'board',index:i,start,end};boards.add(mesh);
  }
  // Les matériaux sans lame associée sont également à libérer.
  for(const material of wood)if(!boards.children.some(m=>m.material===material))material.dispose();
  const joistMaterial=new THREE.MeshStandardMaterial({color:0x785433,roughness:.95}),joistGeometry=new THREE.BoxGeometry(1,1,1);
  const rails=new THREE.InstancedMesh(joistGeometry,joistMaterial,spec.rails.length),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  spec.rails.forEach((r,i)=>{
    const alongX=Math.abs(r.b.x-r.a.x)>1e-8,length=Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y);
    position.set((r.a.x+r.b.x)/2,(spec.supportHeight||0)+spec.plotHeight+spec.joistHeight/2,(r.a.y+r.b.y)/2);scale.set(alongX?length:spec.joistWidth,spec.joistHeight,alongX?spec.joistWidth:length);
    matrix.compose(position,rotation,scale);rails.setMatrixAt(i,matrix);
  });rails.castShadow=true;rails.receiveShadow=true;rails.userData.part='joist';joists.add(rails);
  const pedestalMaterial=new THREE.MeshStandardMaterial({color:0x303338,roughness:.9}),pedestalGeometry=new THREE.CylinderGeometry(.5,.5,1,20);
  const plots=new THREE.InstancedMesh(pedestalGeometry,pedestalMaterial,spec.supports.length);
  spec.supports.forEach((p,i)=>{position.set(p.x,(spec.supportHeight||0)+spec.plotHeight/2,p.y);scale.set(spec.plotDiameter,spec.plotHeight,spec.plotDiameter);matrix.compose(position,rotation,scale);plots.setMatrixAt(i,matrix);});
  plots.castShadow=true;plots.receiveShadow=true;plots.userData.part='support';supports.add(plots);
  for(const layer of [boards,joists,supports]){
    const inner=new THREE.Group();inner.position.set(-spec.geometry.outerLength/2,0,-spec.geometry.outerWidth/2);for(const child of [...layer.children])inner.add(child);layer.add(inner);
    layer.position.set(spec.placement.x+spec.geometry.outerLength/2,spec.elevation||0,spec.placement.y+spec.geometry.outerWidth/2);layer.rotation.y=-THREE.MathUtils.degToRad(spec.placement.rotation);
  }
  return {boards,joists,supports};
}
export function cameraDistance(box,aspect,fov,mode='perspective'){
  const center=box.getCenter(new THREE.Vector3()),direction=mode==='top'?new THREE.Vector3(0,1,.0001).normalize():mode==='front'?new THREE.Vector3(0,0,1):new THREE.Vector3(1,.8,1).normalize();
  const right=new THREE.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right),tan=Math.tan(THREE.MathUtils.degToRad(fov)/2);let distance=.01;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).sub(center);distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/(tan*aspect),p.dot(direction)+Math.abs(p.dot(up))/tan);}
  return distance*1.12;
}

export function init3D(container){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.setClearColor(0xf8fafb);container.appendChild(renderer.domElement);
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Vue 3D : glisser pour tourner, molette pour zoomer');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,1000),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.09;controls.maxPolarAngle=Math.PI/2;controls.screenSpacePanning=true;
  const ambient=new THREE.AmbientLight(0xffffff,1.8);scene.add(ambient);const sun=new THREE.DirectionalLight(0xfff6e8,3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.01;sun.shadow.bias=-.0002;scene.add(sun);scene.add(sun.target);
  let root=null,layers={},box=null,lastSnapshot=null,lastSignature='',visible=false,frame=null,view='perspective',generation=0;
  const $=id=>document.getElementById(id),status=$('threeStatus');
  const presentation=window.Presentation3D?initPresentation3D({scene,renderer,camera,controls,sun,ambient,container,render,dispose:disposeObject,status:text=>{document.getElementById('presentationStatus').textContent=text;}}):null;
  function resize(){const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();presentation?.apply();if(box){if(window.Presentation3D?.snapshot().presentation3D.mode==='client')presentation?.cameraView(window.Presentation3D.snapshot().presentation3D.cameraPreset);else fitCameraToTerrace(view);}render();}
  function render(){if(visible){controls.update();renderer.render(scene,camera);}}
  function animate(){if(!visible){frame=null;return;}render();frame=requestAnimationFrame(animate);}
  function setVisible(value){visible=value;if(value){resize();if(frame===null)animate();}else if(frame!==null){cancelAnimationFrame(frame);frame=null;}}
  function clearTerrace3D(){presentation?.beforeClear();if(root){disposeObject(root);root=null;}layers={};box=null;container.dataset.zones='0';container.dataset.boards='0';container.dataset.supports='0';container.dataset.importedPlans='0';renderer.renderLists.dispose();}
  function fitCameraToTerrace(mode='perspective'){
    if(!box)return;view=mode;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),distance=cameraDistance(box,camera.aspect,camera.fov,mode);
    controls.target.copy(center);camera.near=Math.max(.001,distance/10000);camera.far=distance*20;controls.minDistance=Math.max(.04,Math.min(size.x,size.z)*.025);controls.maxDistance=distance*12;
    if(mode==='top')camera.position.set(center.x,center.y+distance,center.z+distance*.0001);
    else if(mode==='front')camera.position.set(center.x,center.y,center.z+distance);
    else camera.position.copy(center).add(new THREE.Vector3(1,.8,1).normalize().multiplyScalar(distance));
    camera.lookAt(center);camera.updateProjectionMatrix();controls.update();render();
  }
  function buildTerrace3D(snapshot){
    const settings={heightMm:$('threeHeight').value.trim()===''?null:Number($('threeHeight').value),diameterMm:Number($('threeDiameter').value)};
    const specs=Terrace3DModel.projectSpecs(snapshot,settings);
    if(specs.reduce((n,s)=>n+s.boardCount,0)>5000)throw new Error('Projet trop dense pour cette vue 3D : plus de 5 000 rangées de lames.');
    clearTerrace3D();if(!specs.length){status.textContent='Calculez un projet valide pour afficher la 3D.';$('threeSummary').textContent='';$('threeNote').textContent='';render();return;}
    root=new THREE.Group();layers={boards:new THREE.Group(),joists:new THREE.Group(),supports:new THREE.Group()};Object.values(layers).forEach(g=>root.add(g));
    try{
      for(const spec of specs){const parts=buildZoneMeshes(spec,Terrace3DModel);for(const key of Object.keys(layers))layers[key].add(parts[key]);}
      layers.connections=new THREE.Group();root.add(layers.connections);
      for(const link of snapshot.connections||[]){const base=specs.find(s=>s.id===link.fromZone)?.totalHeight??link.baseElevation;layers.connections.add(buildConnectionMeshes(link,base));}
      layers.plan=new THREE.Group();root.add(layers.plan);
      const drawnPlans=new Set();
      for(const record of snapshot.importedPlans||[]){if(record.metadata?.type==='grid')continue;const zone=snapshot.zones.find(z=>z.id===record.id),placement=snapshot.placements.get(record.id);if(!zone||!placement)continue;const key=JSON.stringify([record.metadata?.editorState?.plan.documentId||record.metadata?.source,record.metadata?.page,record.corners.map(p=>{const q=PlanGeometry.transformPoint(p,zone.geometry,placement);return [Math.round(q.x*1e5),Math.round(q.y*1e5)];})]);if(drawnPlans.has(key))continue;drawnPlans.add(key);layers.plan.add(buildPlanOverlay(THREE,record,zone.geometry,placement,PlanGeometry.transformPoint,Number($('threePlanOpacity').value)/100));}
      layers.plan.visible=$('threePlan').checked;container.dataset.importedPlans=String(layers.plan.children.length);
      const extent=PlanGeometry.projectBounds(snapshot.zones,snapshot.placements),height=Math.max(...specs.map(s=>s.totalHeight));
      box=new THREE.Box3(new THREE.Vector3(extent.minX,0,extent.minY),new THREE.Vector3(extent.maxX,height,extent.maxY));
      const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),ground=new THREE.Mesh(new THREE.PlaneGeometry(size.x*1.35,size.z*1.35),new THREE.MeshStandardMaterial({color:0xe9ecee,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(center.x,-.003,center.z);ground.receiveShadow=true;root.add(ground);scene.add(root);
      sun.position.copy(center).add(new THREE.Vector3(size.x*.6,Math.max(size.x,size.z),size.z*.4));sun.target.position.copy(center);const span=Math.max(size.x,size.z)*.9;Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:.01,far:Math.max(size.x,size.z)*5});sun.shadow.camera.updateProjectionMatrix();
      for(const [key,id] of [['boards','threeBoards'],['joists','threeJoists'],['supports','threeSupports']])layers[key].visible=$(id).checked;
      container.dataset.layers=JSON.stringify(Object.fromEntries(Object.entries(layers).map(([name,g])=>[name,g.visible])));
      const count=specs.reduce((n,s)=>n+s.supports.length,0),rows=specs.reduce((n,s)=>n+s.boardCount,0);generation++;
      container.dataset.generation=String(generation);container.dataset.supports=String(count);container.dataset.boards=String(rows);container.dataset.zones=String(specs.length);
      status.textContent=`Scène à jour · ${specs.length} zone(s) · ${rows} rangées de lames · ${count} plots représentés`;
      $('threeSummary').textContent=`Emprise ${size.x.toFixed(2).replace('.',',')} × ${size.z.toFixed(2).replace('.',',')} m · Hauteur totale ${height.toFixed(3).replace('.',',')} m · 1 unité = 1 mètre. Les achats incluent chutes et marges ; les rangées dessinées représentent la pose.`;
      $('threeNote').textContent=(specs.some(s=>s.indicative)?'Formes complexes : structure issue du plan 2D, appuis projetés ; le chiffrage et les renforts restent estimatifs. ':'Rectangles : coordonnées et nombre d’appuis repris du plan calculé. ')+(specs.some(s=>s.light)?'Affichage allégé identique au plan 2D. ':'')+'Plots cylindriques schématiques : diamètre réglable, absent du catalogue. Hauteur dans la plage du plot choisi.';
      presentation?.afterBuild({root,layers,box,specs,ground});fitCameraToTerrace(view);if(window.Presentation3D?.snapshot().presentation3D.mode==='client')presentation?.cameraView(window.Presentation3D.snapshot().presentation3D.cameraPreset);
    }catch(error){clearTerrace3D();throw error;}
  }
  function sync(snapshot,force=false){
    lastSnapshot=snapshot;
    const signature=JSON.stringify([snapshot.zones,snapshot.connections||[],[...snapshot.placements],$('threeHeight').value,$('threeDiameter').value,(snapshot.importedPlans||[]).map(p=>[p.id,p.version])]);
    if(!force&&signature===lastSignature)return;
    try{buildTerrace3D(snapshot);lastSignature=signature;}catch(error){clearTerrace3D();status.textContent='Scène non disponible : '+error.message;$('threeSummary').textContent='';$('threeNote').textContent='';container.dataset.zones='0';render();}
  }
  function toggleLayer(key,value){if(layers[key])layers[key].visible=value;container.dataset.layers=JSON.stringify(Object.fromEntries(Object.entries(layers).map(([name,g])=>[name,g.visible])));render();}
  function setPlanOpacity(value){layers.plan?.traverse(node=>{if(node.material)node.material.opacity=value;});render();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();setVisible(false);status.textContent='Le contexte graphique a été interrompu. Rouvrez la vue 3D.';});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{lastSignature='';if(lastSnapshot)sync(lastSnapshot,true);setVisible(!document.getElementById('terrace3d').hidden);});
  window.addEventListener('pagehide',()=>{setVisible(false);observer.disconnect();clearTerrace3D();presentation?.dispose();controls.dispose();renderer.dispose();});
  return {sync,setVisible,buildTerrace3D,clearTerrace3D,fitCameraToTerrace,setTopView:()=>fitCameraToTerrace('top'),setFrontView:()=>fitCameraToTerrace('front'),resetCamera:()=>fitCameraToTerrace('perspective'),toggleLayer,setPlanOpacity,presentationView:preset=>presentation?.cameraView(preset),startContextWall:()=>presentation?.startWall(),captureImage:()=>presentation?.capture()};
}
