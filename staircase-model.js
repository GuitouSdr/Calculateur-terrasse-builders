'use strict';
const StaircaseModel=(()=>{
 function build(g){if(g.cad)return g.cad.model;const s=g.settings,l=g.landing,parts=[];let index=0;const product=role=>g.materials.items.find(i=>i.role===role)?.product;const section=(role,fallback)=>{const p=product(role);return p?.Epaisseur_mm>0&&p.Largeur_mm>0?[p.Epaisseur_mm/1000,p.Largeur_mm/1000]:fallback;};
 const box=(role,x,y,z,dx,dy,dz,angle=0)=>parts.push({role,x,y,z,dx,dy,dz,angle,index:index++,product:product(role)||null});
 const beam=(role,x,y,z,x2,y2,z2,width,depth)=>{if(Math.abs(z-z2)>1e-9)box(role,(x+x2)/2,(y+y2)/2,(z+z2)/2,width,depth,Math.abs(z2-z));else box(role,(x+x2)/2,(y+y2)/2,z,Math.hypot(x2-x,y2-y),depth,width,Math.atan2(y2-y,x2-x));};
 const [sw,sd]=section('stringers',[.08,.24]),[tt]=section('treads',[.028,.14]);
 // The arrival floor replaces the last tread: the nosing line has pitch h/g,
 // not totalRise/run. Keep the full blank length for end trimming.
 for(const f of g.flights){const angle=Math.atan2(f.stepHeight,f.going),centerY=f.elevation+f.stepHeight+f.run/2*Math.tan(angle)-sd/(2*Math.cos(angle));for(let j=0;j<f.stringerCount;j++){const z=-sw/2+j*(s.width+sw)/(f.stringerCount-1);box('stringers',f.x+f.run/2,centerY,z,f.stringerLength,sd,sw,angle);}
  for(let j=0;j<f.treadCount;j++){const y=f.elevation+(j+1)*f.stepHeight-tt/2;const count=f.planksPerTread,depth=(f.treadDepth-(count-1)*s.boardGap)/count;for(let p=0;p<count;p++)box('treads',f.x+j*f.going+p*(depth+s.boardGap)+depth/2,y,s.width/2,depth,tt,s.width);if(s.risers)box('risers',f.x+j*f.going,f.elevation+(j+.5)*f.stepHeight,s.width/2,.02,f.stepHeight,s.width);}
  if(s.risers)box('risers',f.x+f.run,f.elevation+f.rise-f.stepHeight/2,s.width/2,.02,f.stepHeight,s.width);
 }
 if(l.enabled){const [pt,pw]=section('posts',[.12,.12]),[bt,bd]=section('beams',[.08,.24]),[jt,jd]=section('joists',[.045,.145]),[dt]=section('deck',[.028,.14]);for(let j=0;j<l.postCount;j++){const a=Math.floor(j/2)/Math.max(1,Math.ceil(l.postCount/2)-1),z=j%2?(l.width-pw/2):pw/2;box('posts',l.x+pt/2+a*(l.length-pt),l.elevation-l.postHeight/2-dt-jd,z,pt,l.postHeight,pw);}for(const z of [bt/2,l.width-bt/2])box('beams',l.x+l.length/2,l.elevation-dt-jd-bd/2,z,l.length,bd,bt);for(let j=0;j<l.joistCount;j++)box('joists',l.x+j*l.length/(l.joistCount-1),l.elevation-dt-jd/2,l.width/2,jt,jd,l.width);const count=l.deckBoardCount||1,across=l.direction==='length'?l.width:l.length,d=(across-(count-1)*s.boardGap)/count;for(let j=0;j<count;j++)if(l.direction==='length')box('deck',l.x+l.length/2,l.elevation-dt/2,j*(d+s.boardGap)+d/2,l.length,dt,d);else box('deck',l.x+j*(d+s.boardGap)+d/2,l.elevation-dt/2,l.width/2,d,dt,l.width);}
 for(const r of g.railing.segments){const f=r.flight?g.flights[r.flight-1]:null,x=f?f.x:l.x,run=f?f.run:l.length,y=f?f.elevation:l.elevation,rise=f?f.rise:0,z=r.side==='left'?0:(f?s.width:l.width),rh=s.railing.height;beam('rail',x,y+rh,z,x+run,y+rise+rh,z,.06,.07);for(let j=0;j<r.postCount;j++){const t=j/(r.postCount-1);box('railPosts',x+t*run,y+t*rise+rh/2,z,.065,rh,.065);}if(r.guard&&s.railing.fill){const count=Math.ceil(r.length/s.railing.fillSpacing)-1;for(let j=1;j<=count;j++){const t=j/(count+1);box('infill',x+t*run,y+t*rise+rh/2,z,.035,rh,.035);}}}
 return {parts,bounds:{run:g.totalRun,rise:g.totalRise,width:Math.max(s.width,l.width||0)},provisional:g.materials.issues.length>0};
 }
 return {build};
})();
if(typeof window!=='undefined')window.StaircaseModel=StaircaseModel;
if(typeof module!=='undefined')module.exports=StaircaseModel;
