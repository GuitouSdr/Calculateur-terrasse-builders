'use strict';
// Chargement différé : une erreur WebGL ne touche ni le calculateur ni le plan 2D.
(()=>{
  if(typeof window==='undefined')return;
  let viewer=null,snapshot=window.PlanChantier.getProjectSnapshot(),visible=false;
  const status=document.getElementById('threeStatus');
  window.Terrace3D={
    presentationView(preset){viewer?.presentationView?.(preset);},
    startContextWall(){viewer?.startContextWall?.();},
    captureImage(){return viewer?.captureImage?.();},
    async captureForDocument(){
      if(viewer)return await this.captureImage();
      const mode=!document.getElementById('importPlanSection').hidden?'import':!document.getElementById('planChantier').hidden?'plan':!document.getElementById('terrace3d').hidden?'3d':'calculator';
      try{await this.show();const image=await this.captureImage();if(!image)throw new Error('La vue 3D ne peut pas être générée.');return image;}
      finally{if(mode!=='3d')window.PlanChantier.show(mode);}
    },
    sync(data){snapshot=data;if(viewer)viewer.sync(data);},
    hide(){visible=false;viewer?.setVisible(false);},
    async show(){
      visible=true;window.PlanChantier.show('3d');
      if(viewer){viewer.sync(snapshot);viewer.setVisible(visible);return;}
      status.textContent='Chargement de la scène 3D…';
      try{
        if(!window.Terrace3DEngine)throw new Error('Le fichier vue-3d.bundle.js est manquant.');
        viewer=window.Terrace3DEngine.init3D(document.getElementById('threeViewport'));
        viewer.sync(snapshot);viewer.setVisible(visible);
      }catch(error){status.textContent='Vue 3D indisponible : '+error.message;}
    }
  };
  document.getElementById('tabVue3D').addEventListener('click',()=>window.Terrace3D.show());
  document.getElementById('threePerspective').addEventListener('click',()=>viewer?.resetCamera());
  document.getElementById('threeTop').addEventListener('click',()=>viewer?.setTopView());
  document.getElementById('threeFront').addEventListener('click',()=>viewer?.setFrontView());
  document.getElementById('threeReset').addEventListener('click',()=>viewer?.resetCamera());
  for(const [id,layer] of [['threeBoards','boards'],['threeJoists','joists'],['threeSupports','supports']])document.getElementById(id).addEventListener('change',event=>viewer?.toggleLayer(layer,event.target.checked));
  for(const id of ['threeHeight','threeDiameter'])document.getElementById(id).addEventListener('input',()=>{viewer?.sync(snapshot,true);});
  document.getElementById('threePlan').addEventListener('change',e=>viewer?.toggleLayer('plan',e.target.checked));
  document.getElementById('threePlanOpacity').addEventListener('input',e=>{document.getElementById('threePlanOpacityValue').textContent=e.target.value+' %';viewer?.setPlanOpacity(Number(e.target.value)/100);});
})();
