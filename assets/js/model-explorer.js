/* Dennis Tan Portfolio — dependency-free WebGL model explorer.
 * Detailed interpretive geometry derived from supplied original CAD references and built photographs, not exact measured CAD output.
 * No CAD dimensions, structural engineering or built compliance is implied.
 * Lazy-started by the visitor. No analytics, no network calls, no external 3D assets.
 */
(() => {
  'use strict';
  const host = document.querySelector('.model-explorer');
  if (!host) return;
  const isShelter = host.dataset.model === 'shelter';
  const stage = host.querySelector('.model-stage');
  const canvas = host.querySelector('canvas');
  const launch = host.querySelector('.model-launch');
  const cover = host.querySelector('.model-start');
  const fallback = host.querySelector('.model-fallback');
  const annotations = host.querySelector('.model-hotspots');
  const info = host.querySelector('.model-info-copy');
  const infoTitle = host.querySelector('.model-active-name');
  const infoData = isShelter ? [
    ['Three-part design','The original design folio describes the shelter as a bolted base, wall body and roof. This interactive assembly separates these parts for exploration.',[0,3.10,0],'roof'],
    ['Mobile base','Four braking swivel castors support the plywood floor and timber subframe, as recorded in the school design folio.',[2.25,.12,1.1],'wheels'],
    ['Access and security','The physical prototype used a smart keypad/NFC/fingerprint lock and an internal safety chain; these are not certified security specifications.',[.12,1.36,1.49],'door'],
    ['Openings and light','Two front windows, a rear small square window and a circular end opening appear in the CAD and folio. The finished project includes interior solar-powered lighting.',[-1.76,1.48,1.36],'windows']
  ] : [
    ['Layered tabletop','Folio p.17 specifies mitred Tasmanian Oak, a dyed Blue Gum middle layer, a second Oak ring and a flat red epoxy centre.',[0,2.44,0],'resin'],
    ['Laminated X-frames','Timber folio p.19 documents laminated angled cross joints, Tasmanian Oak faces and a Blue Gum centre.',[1.92,1.14,.55],'legRight'],
    ['Housing joint','A rebated housing joint seats each top rail into the angled end support. Internal rebate shapes are interpreted rather than measured.',[-1.92,2.20,.56],'capLeft'],
    ['Longitudinal stretcher','A three-way layered lap detail is described for the centre connection. The long rail links the end supports.',[0,1.075,.12],'stretcher']
  ];
  let gl, ctx2d, program, groups = {}, state = {
    theta: isShelter ? .62 : .84, phi: isShelter ? .30 : .41,
    radius: isShelter ? (window.innerWidth<700?9.0:7.7) : (window.innerWidth<700?6.6:5.55), mode: 'exterior', auto: false,
    light: false, blue: false, started: false, running: false,
    explode: 0, explodeTarget: 0, selected: -1
  };
  // Manual build challenge: each moving assembly is a separate transform group.
  // 'Placement' is intentionally constrained to a 3D translation plane: the
  // artwork is a reconstruction, not a mechanical-safety or structural simulator.
  const assemblyParts = isShelter ? [
    {id:'walls',label:'Timber wall frame',items:['frame'],anchor:[0,1.7,0],home:[-1.52,.15,0],note:'Stand the bolted wall body onto the wheel-mounted base.'},
    {id:'roofFrame',label:'Rafters & gables',items:['rafters','gableTrim'],anchor:[0,3.08,0],home:[1.0,1.33,-.4],note:'Position the pitched timber roof structure.'},
    {id:'shell',label:'Exterior wall shell',items:['skin'],anchor:[0,1.6,1.31],home:[1.02,0,1.42],note:'Fit the wall cladding around the timber frame.'},
    {id:'fittings',label:'Windows & entry',items:['door','windows','windowTrim'],anchor:[-1.78,1.5,1.42],home:[-1.20,-.15,1.48],note:'Locate the framed openings and hinged access.'},
    {id:'roofCover',label:'Roof covering',items:['roof','roofDetails','glow'],anchor:[0,3.5,0],home:[0,1.75,.82],note:'Finish with the pitched roof enclosure.'}
  ] : [
    {id:'left',label:'Left laminated X-frame',items:['legLeft','inlayLeft','capLeft'],anchor:[-1.92,1.17,0],home:[-1.05,-.15,0.6],note:'Fit the first crossed laminated end frame.'},
    {id:'right',label:'Right laminated X-frame',items:['legRight','inlayRight','capRight'],anchor:[1.92,1.17,0],home:[1.15,-.15,.6],note:'Fit the matching end frame.'},
    {id:'rail',label:'Long stretcher',items:['stretcher'],anchor:[0,1.075,0],home:[0,-.6,1.60],note:'Bridge the X-frames with the long central rail.'},
    {id:'surround',label:'Mitred tabletop frame',items:['plyBase','outerOak','blueGum','innerOak','accent','supports'],anchor:[0,2.35,.79],home:[0,1.20,-.45],note:'Seat the laminated, mitred tabletop surround.'},
    {id:'river',label:'Central resin panel',items:['resin','resinHighlight'],anchor:[0,2.43,0],home:[0,1.90,1.10],note:'Insert the red rectangular resin centre.'}
  ];
  const partOf = Object.fromEntries(assemblyParts.flatMap((p,i)=>p.items.map(n=>[n,i])));
  let assemblyMode=false,assemblyOrbit=false,selectedPart=-1;
  let partOffsets=assemblyParts.map(p=>p.home.slice());
  let isAssembled=assemblyParts.map(()=>false);
  // A reversible history of user actions. Part movement is exploratory; no
  // structural assembly tolerance or actual installation safety is implied.
  let assemblyHistory=[];
  function recordAssembly(){
    assemblyHistory.push({offsets:partOffsets.map(a=>a.slice()),placed:isAssembled.slice(),selected:selectedPart});
    if(assemblyHistory.length>30)assemblyHistory.shift();
  }
  function undoAssembly(){
    if(!assemblyMode || !assemblyHistory.length)return;
    const previous=assemblyHistory.pop();
    partOffsets=previous.offsets.map(a=>a.slice());
    isAssembled=previous.placed.slice();selectedPart=previous.selected;
    assemblyStatus('Last assembly action undone. Continue with any component.');
    assemblyUI();render();
  }
  let assemblyHost=host.querySelector('.assembly-lab');
  let assemblyList=assemblyHost?.querySelector('.assembly-parts');
  let assemblyProgress=assemblyHost?.querySelector('.assembly-progress');
  let assemblyMessage=assemblyHost?.querySelector('.assembly-message');
  let assemblyTarget=stage.querySelector('.assembly-target');
  let assemblyPicked=stage.querySelector('.assembly-picked');
  const dock=stage.querySelector('.assembly-dock');
  const assemblyDist=(i)=>Math.hypot(...partOffsets[i]);
  const partText=(i)=>assemblyParts[i].label;
  function assemblyStatus(message){if(assemblyMessage)assemblyMessage.textContent=message;}
  function assemblyUI(){
    if(!assemblyHost)return;
    assemblyHost.classList.toggle('is-on',assemblyMode);
    stage.classList.toggle('assembly-active',assemblyMode);
    const count=isAssembled.filter(Boolean).length;
    if(dock){dock.hidden=!assemblyMode;dock.querySelector('.dock-count').textContent=count+'/'+assemblyParts.length;dock.querySelector('[data-assembly-dock="orbit"]').setAttribute('aria-pressed',String(assemblyOrbit));}
    assemblyProgress.textContent=`${count} / ${assemblyParts.length} components placed`;
    const undoAvailable=assemblyMode && assemblyHistory.length>0;
    host.querySelectorAll('[data-assembly="undo"], [data-assembly-dock="undo"]').forEach(btn=>{btn.disabled=!undoAvailable;});
    const next=assemblyParts.findIndex((p,i)=>!isAssembled[i]);
    const step=assemblyHost.querySelector('.assembly-next-step');
    if(step)step.textContent=!assemblyMode?'Start the workshop to reveal the first component.':
       next<0?'✓ Assembly complete. You can detach or undo any part.':
       `Step ${count+1} of ${assemblyParts.length} · Next: ${assemblyParts[next].label}. ${assemblyParts[next].note}`;
    assemblyHost.querySelector('[data-assembly="toggle"]').textContent=assemblyMode?'Exit assembly mode':'Start assembly challenge';
    assemblyHost.querySelector('[data-assembly="orbit"]').setAttribute('aria-pressed',String(assemblyOrbit));
    if(assemblyList){assemblyList.replaceChildren();assemblyParts.forEach((p,i)=>{
      const btn=document.createElement('button');btn.type='button';btn.className='assembly-piece';
      btn.classList.toggle('selected',selectedPart===i);btn.classList.toggle('placed',isAssembled[i]);
      btn.setAttribute('aria-pressed',String(selectedPart===i));
      btn.innerHTML=`<span class="assembly-check" aria-hidden="true">${isAssembled[i]?'✓':String(i+1).padStart(2,'0')}</span><span>${p.label}</span><small>${isAssembled[i]?'Placed':'Drag to install'}</small>`;
      btn.addEventListener('click',()=>{selectedPart=i;assemblyOrbit=false;assemblyStatus(`${p.label}: ${p.note} Drag on the model canvas towards the outlined target, or choose “Snap selected”.`);assemblyUI();render();stage.scrollIntoView({block:'center',behavior:'smooth'});});
      assemblyList.append(btn);
    });}
    if(dock){const list=dock.querySelector('.dock-parts');list.replaceChildren();assemblyParts.forEach((p,i)=>{
      const b=document.createElement('button');b.type='button';b.textContent=(isAssembled[i]?'✓ ':'')+p.label;
      b.className='dock-piece'+(selectedPart===i?' selected':'')+(isAssembled[i]?' placed':'');
      b.addEventListener('click',()=>{selectedPart=i;assemblyOrbit=false;assemblyStatus(p.note);assemblyUI();render();});
      list.append(b);
    });}

  }
  function snapPiece(i,force=false){
    if(i<0)return false;
    // Screen-aligned magnetic snap permits assembly from any orbit angle;
    // depth placement is illustrative rather than a tolerance/fit simulation.
    if(!force){
      const target=project(assemblyParts[i].anchor);
      const source=project(assemblyParts[i].anchor,partOffsets[i]);
      if(Math.hypot(source[0]-target[0],source[1]-target[1])>64)return false;
    }
    if(!wasMovingPart)recordAssembly();
    partOffsets[i]=[0,0,0];isAssembled[i]=true;
    selectedPart=assemblyParts.findIndex((p,k)=>!isAssembled[k]);
    if(selectedPart<0)selectedPart=i;
    assemblyStatus(`${assemblyParts[i].label} installed. ${isAssembled.every(Boolean)?'Assembly completed — all five parts connected!':'Select the next component to continue.'}`);
    assemblyUI();render();return true;
  }
  function resetAssembly(keepHistory=false){if(keepHistory)recordAssembly();else assemblyHistory=[];partOffsets=assemblyParts.map(p=>p.home.slice());isAssembled=assemblyParts.map(()=>false);selectedPart=0;assemblyOrbit=false;assemblyStatus('Select a part, drag the model component towards its target and release to snap it into position.');assemblyUI();render();}
  const cameraTarget = isShelter ? [0,1.69,0] : [0,1.29,0];
  const clamp = (v,a,b)=>Math.max(a, Math.min(b,v));
  const add = (a,b)=>a.map((v,i)=>v+b[i]);
  const sub = (a,b)=>a.map((v,i)=>v-b[i]);
  const scale = (v,n)=>v.map(x=>x*n);
  const dot = (a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm = a=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d);};
  const hex=c=>{let h=c.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);};
  const C={wood:'#c69a65', light:'#e4c79a', trim:'#b98951', dark:'#5b3629',
    roof:'#604637', roof2:'#765546', wall:'#dddcd3', wall2:'#f3f0e6',
    glass:'#8ba9aa', glassOn:'#e7b36c', metal:'#969b95', tire:'#292d2c',
    red:'#aa5149', blue:'#6a9d9a', ground:'#e9e8df', clay:'#ae8976', under:'#a78f72'};
  const dataStore={};
  function grp(name){return dataStore[name] ||= {positions:[], normals:[], colors:[]};}
  function tri(a,b,c,color,name){
    const normal=norm(cross(sub(b,a),sub(c,a)));
    const bfr=grp(name),co=hex(color);
    [a,b,c].forEach(p=>{bfr.positions.push(...p);bfr.normals.push(...normal);bfr.colors.push(...co);});
  }
  function quad(a,b,c,d,color,name){tri(a,b,c,color,name);tri(a,c,d,color,name);}
  function cuboid(center,w,h,d,color,name){
    const [x,y,z]=center, x0=x-w/2,x1=x+w/2,y0=y-h/2,y1=y+h/2,z0=z-d/2,z1=z+d/2;
    const p=(xx,yy,zz)=>[xx,yy,zz];
    quad(p(x0,y0,z1),p(x1,y0,z1),p(x1,y1,z1),p(x0,y1,z1),color,name);
    quad(p(x1,y0,z0),p(x0,y0,z0),p(x0,y1,z0),p(x1,y1,z0),color,name);
    quad(p(x1,y0,z1),p(x1,y0,z0),p(x1,y1,z0),p(x1,y1,z1),color,name);
    quad(p(x0,y0,z0),p(x0,y0,z1),p(x0,y1,z1),p(x0,y1,z0),color,name);
    quad(p(x0,y1,z1),p(x1,y1,z1),p(x1,y1,z0),p(x0,y1,z0),color,name);
    quad(p(x0,y0,z0),p(x1,y0,z0),p(x1,y0,z1),p(x0,y0,z1),color,name);
  }
  function beam(a,b,w,d,color,name){
    const direction=norm(sub(b,a));
    let u=norm(cross(direction,[0,0,1]));
    if(Math.hypot(...u)<.05 || Math.abs(dot(u,direction))>.9) u=[1,0,0];
    const v=norm(cross(direction,u));
    const corner=(p,s,t)=>add(add(p,scale(u,s*w/2)),scale(v,t*d/2));
    const aa=[corner(a,1,1),corner(a,-1,1),corner(a,-1,-1),corner(a,1,-1)];
    const bb=[corner(b,1,1),corner(b,-1,1),corner(b,-1,-1),corner(b,1,-1)];
    for(let i=0;i<4;i++)quad(aa[i],aa[(i+1)%4],bb[(i+1)%4],bb[i],color,name);
    quad(...aa,color,name);quad(...bb,color,name);
  }
  function circle(origin,radius,thickness,color,name,axis='x'){
    const n=20, vec=i=>{
      const t=i/n*Math.PI*2;
      return axis==='x'?[origin[0],origin[1]+Math.cos(t)*radius,origin[2]+Math.sin(t)*radius]:
        [origin[0]+Math.cos(t)*radius,origin[1]+Math.sin(t)*radius,origin[2]];
    };
    for(let i=0;i<n;i++)tri(origin,vec(i),vec(i+1),color,name);
  }
  function gridGround(){
    cuboid([0,-.27,0],7.3,.027,4.8,C.ground,'ground');
    for(let i=-3;i<=3;i++)cuboid([i,-.250,0],.005,.006,4.75,'#e3e3da','ground');
    for(let i=-2;i<=2;i++)cuboid([0,-.250,i],7.25,.006,.005,'#e3e3da','ground');
  }
  // A visible castor composed of a rubber tread, a metal centre and a top bracket.
  function caster(x,z){
    cuboid([x,.19,z],.14,.21,.12,C.metal,'wheels');
    cuboid([x,.285,z],.27,.05,.26,'#7c8583','wheels');
    cylinder([x,.074,z],.215,.105,C.tire,'wheels','x');
    cylinder([x+.063,.074,z],.115,.108,C.metal,'wheels','x');
    cylinder([x+.070,.074,z],.039,.109,'#4b5654','wheels','x');
  }
  function cylinder(origin,radius,thickness,color,name,axis='x',n=16){
    const v=(a,k)=>{const th=2*Math.PI*k/n;
      return axis==='x'?[origin[0]+a,origin[1]+radius*Math.cos(th),origin[2]+radius*Math.sin(th)]:
      axis==='y'?[origin[0]+radius*Math.cos(th),origin[1]+a,origin[2]+radius*Math.sin(th)]:
        [origin[0]+radius*Math.cos(th),origin[1]+radius*Math.sin(th),origin[2]+a];};
    for(let i=0;i<n;i++){
      const a=v(-thickness/2,i),b=v(-thickness/2,i+1),c=v(thickness/2,i+1),d=v(thickness/2,i);
      quad(a,b,c,d,color,name);tri(origin,a,b,color,name);
    }
  }
  function wallPanel(x0,x1,y0,y1,z,color=C.wall2,name='skin'){
    if(x1<=x0||y1<=y0)return;
    cuboid([(x0+x1)/2,(y0+y1)/2,z],x1-x0,y1-y0,.06,color,name);
  }
  function wallEnd(z0,z1,y0,y1,x,color=C.wall2,name='skin'){
    if(z1<=z0||y1<=y0)return;
    cuboid([x,(y0+y1)/2,(z0+z1)/2],.06,y1-y0,z1-z0,color,name);
  }
  function windowFront(x,z,small=false){
    const half=small?.29:.39,cy=1.49,hh=small?.35:.46;
    wallPanel(x-half,x+half,cy-hh,cy+hh,z,C.glass,'windows');
    const wood=C.trim;
    [-1,1].forEach(s=>cuboid([x+s*(half+.035),cy,z+.033],.08,hh*2+.14,.10,wood,'windowTrim'));
    [-1,1].forEach(s=>cuboid([x,cy+s*(hh+.040),z+.033],half*2+.16,.085,.10,wood,'windowTrim'));
    cuboid([x,cy,z+.079],.034,hh*2,.016,'#d5d5c7','windowTrim');
  }
  function gableTriangle(x){
    // Opaque triangular end panel above the eaves, edged with exposed pale timber.
    tri([x,2.46,-1.30],[x,2.46,1.30],[x,3.74,0],C.wall2,'skin');
    beam([x,2.46,-1.32],[x,3.74,0],.075,.07,C.trim,'gableTrim');
    beam([x,3.74,0],[x,2.46,1.32],.075,.07,C.trim,'gableTrim');
  }
  function buildShelter(){
    gridGround();
    const W=5.18,D=2.62,X=W/2,Z=D/2,eave=2.47,ridge=3.73;
    // Mobile timber sub-frame: longitudinal outer beams and multiple cross joists.
    [-Z,Z].forEach(z=>beam([-X,.44,z],[X,.44,z],.125,.14,C.wood,'baseJoists'));
    [-X,X].forEach(x=>beam([x,.44,-Z],[x,.44,Z],.125,.14,C.wood,'baseJoists'));
    [-1.7,-.85,0,.85,1.7].forEach(x=>beam([x,.44,-Z],[x,.44,Z],.085,.10,C.trim,'baseJoists'));
    cuboid([0,.57,0],W,.067,D,'#d8ad76','floor');
    [-2.30,2.30].forEach(x=>[-1.12,1.12].forEach(z=>caster(x,z)));
    // Long wall framework: seven vertical bays along the overall length.
    const studs=[-X,-1.72,-.85,0,.85,1.72,X];
    [-Z,Z].forEach(z=>{
      studs.forEach(x=>beam([x,.62,z],[x,eave,z],.095,.094,C.wood,'frame'));
      for(const y of [.67,1.27,eave])beam([-X,y,z],[X,y,z],.088,.095,y===eave?C.trim:C.wood,'frame');
      [-1.78,1.78].forEach(x=>{
        beam([x-.42,1.04,z],[x+.42,1.04,z],.076,.075,C.wood,'frame');
        beam([x-.42,1.98,z],[x+.42,1.98,z],.076,.075,C.wood,'frame');
      });
    });
    [-X,X].forEach(x=>{
      [-Z,0,Z].forEach(z=>beam([x,.63,z],[x,eave,z],.10,.10,C.wood,'frame'));
      beam([x,eave,-Z],[x,eave,Z],.10,.10,C.trim,'frame');
      beam([x,eave,-Z],[x,ridge,0],.10,.10,C.wood,'frame');
      beam([x,ridge,0],[x,eave,Z],.10,.10,C.wood,'frame');
    });
    // Roof trusses / exposed rafters at six intermediate longitudinal positions.
    [-2.59,-1.57,-.54,.49,1.52,2.59].forEach(x=>{
      beam([x,eave,-1.34],[x,ridge,0],.085,.095,C.light,'rafters');
      beam([x,ridge,0],[x,eave,1.34],.085,.095,C.light,'rafters');
      beam([x,eave,-1.28],[x,eave,1.28],.080,.080,C.wood,'rafters');
    });
    beam([-X,ridge,0],[X,ridge,0],.082,.086,C.trim,'rafters');
    // Front wall (+z): a central real door opening between two rectangular window openings.
    const frontZ=1.357;
    const cuts=[-2.62,-2.20,-1.38,-.67,.67,1.38,2.20,2.62];
    const levels=[.63,1.05,1.96,2.39,2.49];
    for(let i=0;i<cuts.length-1;i++)for(let j=0;j<levels.length-1;j++){
      const m=(cuts[i]+cuts[i+1])/2, yy=(levels[j]+levels[j+1])/2;
      if(Math.abs(m)<.68 && yy<2.40)continue;
      if((Math.abs(m)>1.38&&Math.abs(m)<2.21) && yy>1.05&&yy<1.97)continue;
      wallPanel(cuts[i],cuts[i+1],levels[j],levels[j+1],frontZ,j===3?C.wall:C.wall2);
    }
    [-1.79,1.79].forEach(x=>windowFront(x,frontZ));
    // Hinged solid front door is separate so it can travel outwards in exploded mode.
    wallPanel(-.635,.635,.63,2.385,frontZ+.062,C.wall2,'door');
    [-.59].forEach(x=>[.87,2.13].forEach(y=>cuboid([x,y,frontZ+.128],.06,.105,.052,C.metal,'door')));
    cuboid([.48,1.46,frontZ+.13],.12,.235,.046,'#303938','door');
    cuboid([.48,1.52,frontZ+.158],.075,.05,.012,'#a1b2ac','door');
    for(let j=0;j<3;j++)for(let i=0;i<2;i++)cuboid([.45+i*.045,1.455-j*.043,frontZ+.159],.013,.011,.012,'#d2d5d1','door');
    // The opposite long wall includes two smaller openings and broad opaque wall areas.
    const backZ=-1.357;
    const backCuts=[-2.62,-2.12,-1.40,1.40,2.12,2.62];
    for(let i=0;i<backCuts.length-1;i++)for(let j=0;j<levels.length-1;j++){
      const m=(backCuts[i]+backCuts[i+1])/2,yy=(levels[j]+levels[j+1])/2;
      if(Math.abs(m)>1.4&&Math.abs(m)<2.12&&yy>1.05&&yy<1.97)continue;
      wallPanel(backCuts[i],backCuts[i+1],levels[j],levels[j+1],backZ,C.wall2);
    }
    [-1.76,1.76].forEach(x=>windowFront(x,backZ-.065,true));
    // Left gable: small square opening. Right gable: prominent circular aperture.
    const lx=-2.627, rx=2.627;
    for(const x of [lx,rx]){
      if(x<0){
        wallEnd(-1.31,-.37,.64,2.47,x);wallEnd(.37,1.31,.64,2.47,x);
        wallEnd(-.37,.37,.64,1.32,x);wallEnd(-.37,.37,1.91,2.47,x);
        wallEnd(-.34,.34,1.36,1.87,x,'#839a99','windows');
        [-.39,.39].forEach(z=>cuboid([x,1.62,z],.11,.64,.085,C.trim,'windowTrim'));
        [1.30,1.94].forEach(y=>cuboid([x,y,0],.11,.090,.84,C.trim,'windowTrim'));
      }else{
        const cy=1.57,r=.43;
        wallEnd(-1.31,-r,.64,2.47,x);wallEnd(r,1.31,.64,2.47,x);
        for(let i=0;i<16;i++){
          const z0=-r+2*r*i/16,z1=-r+2*r*(i+1)/16,mid=(z0+z1)/2;
          const dy=Math.sqrt(Math.max(0,r*r-mid*mid));
          wallEnd(z0,z1,.64,cy-dy,x);wallEnd(z0,z1,cy+dy,2.47,x);
        }
        // Ring trim around an actual opening rather than a dark decal.
        for(let i=0;i<30;i++){
          const a=i/30*2*Math.PI,b=(i+1)/30*2*Math.PI;
          const p=(rr,t)=>[x+.038,cy+rr*Math.cos(t),rr*Math.sin(t)];
          quad(p(.43,a),p(.43,b),p(.53,b),p(.53,a),C.trim,'windowTrim');
        }
      }
      gableTriangle(x);
    }
    // Continuous pitched covering: two planes, visible thickness and shingle courses.
    const xa=-2.77,xb=2.77, zEdge=1.54,ye=2.43,yr=3.77;
    quad([xa,ye,zEdge],[xb,ye,zEdge],[xb,yr,0],[xa,yr,0],C.roof,'roof');
    quad([xa,yr,0],[xb,yr,0],[xb,ye,-zEdge],[xa,ye,-zEdge],C.roof2,'roof');
    const roofAt=(side,t)=>[ye+(yr-ye)*t,side*zEdge*(1-t)];
    for(const side of [-1,1]){
      for(let k=1;k<=8;k++){
        const [y,z]=roofAt(side,k/9);
        beam([xa,y+.008,z],[xb,y+.008,z],.017,.016,k%2?'#8c6a59':'#725345','roofDetails');
      }
      const [y,z]=roofAt(side,.03);
      beam([xa,y,z],[xb,y,z],.042,.055,'#e3e0d3','roofDetails');
    }
    beam([xa,yr+.015,0],[xb,yr+.015,0],.044,.044,'#f1eee5','roofDetails');
    // Interior illumination from the user's exhibition footage; visually subdued.
    cuboid([0,2.14,0],3.9,.018,1.95,'#edbd71','glow');
  }
  // Based on the HSC Timber Folio pp.17-19, 26-29 and the built object.
  // The tabletop is a layered, 45-degree mitred rectangular surround,
  // NOT two live-edge slabs. Drawing dimensions ~1820 x 780 mm are design-stage.
  function rectRing(w,d,innerW,innerD,y,thick,color,name){
    const a=w/2,b=d/2,c=innerW/2,e=innerD/2;
    // Four mitred rails. Their diagonal ends meet without rectangular overlaps.
    function extrude(verts){
      for(let i=1;i<verts.length-1;i++){
        tri([verts[0][0],y+thick/2,verts[0][1]],[verts[i][0],y+thick/2,verts[i][1]],[verts[i+1][0],y+thick/2,verts[i+1][1]],color,name);
        tri([verts[i+1][0],y-thick/2,verts[i+1][1]],[verts[i][0],y-thick/2,verts[i][1]],[verts[0][0],y-thick/2,verts[0][1]],color,name);
      }
      for(let i=0;i<verts.length;i++){
        const p=verts[i],q=verts[(i+1)%verts.length];
        quad([p[0],y-thick/2,p[1]],[q[0],y-thick/2,q[1]],[q[0],y+thick/2,q[1]],[p[0],y+thick/2,p[1]],color,name);
      }
    }
    extrude([[-a,-b],[a,-b],[c,-e],[-c,-e]]);
    extrude([[a,-b],[a,b],[c,e],[c,-e]]);
    extrude([[a,b],[-a,b],[-c,e],[c,e]]);
    extrude([[-a,b],[-a,-b],[-c,-e],[-c,e]]);
  }
  function buildTable(){
    gridGround();
    // 1820 : 780 mm design ratio. Coordinate units are illustrative only.
    const L=4.80, W=2.058, topY=2.355;
    const xEnds=[-1.92,1.92];
    xEnds.forEach((x,i)=>{
      const leg=i===0?'legLeft':'legRight';
      const inlay=i===0?'inlayLeft':'inlayRight';
      const caps=i===0?'capLeft':'capRight';
      // Crossed laminated Tasmanian Oak around a deep Sydney Blue Gum core.
      // X is formed in Y-Z plane (end elevation), not along long tabletop axis.
      beam([x,.15,-.74],[x,2.16,.69],.265,.205,C.wood,leg);
      beam([x,.15,.74],[x,2.16,-.69],.265,.205,C.light,leg);
      beam([x+.115,.20,-.695],[x+.115,2.09,.652],.044,.042,C.dark,inlay);
      beam([x-.116,.20,.695],[x-.116,2.09,-.652],.044,.042,C.dark,inlay);
      // Recessed rail across the top of each X, as illustrated in p.19.
      beam([x,2.16,-.77],[x,2.16,.77],.175,.16,C.dark,caps);
      cuboid([x,2.20,0],.21,.052,1.40,'#754b36',caps);
    });
    // Long stretcher interlocks with the junction of both angled supports.
    beam([-1.92,1.075,0],[1.92,1.075,0],.21,.21,C.light,'stretcher');
    beam([-1.92,1.075,.112],[1.92,1.075,.112],.045,.032,C.dark,'stretcher');
    // Structural sub-base beneath layered top, separate assembly piece.
    cuboid([0,topY-.11,0],L-.12,.105,W-.11,'#967a5c','plyBase');
    // Outer Tasmanian Oak mitred picture frame, stained Blue Gum accent,
    // and inner Tasmanian Oak ring. Source folio p.17 gives these exact layers.
    rectRing(L,W,L-.66,W-.42,topY,.135,'#cba57a','outerOak');
    rectRing(L-.68,W-.44,L-1.00,W-.62,topY+.018,.096,'#95503c','blueGum');
    rectRing(L-1.04,W-.66,L-1.53,W-1.13,topY+.02,.106,'#e2c497','innerOak');
    rectRing(L-1.55,W-1.15,L-1.74,.46,topY+.02,.075,'#c79f73','innerOak');
    // Central flat red resin field, rectangular, not an organic wavy ribbon.
    cuboid([0,topY+.031,0],L-1.76,.089,.455,'#a7463d','resin');
    cuboid([0,topY+.078,0],L-1.82,.006,.406,'#c06459','resinHighlight');
    // Fine continuous thin red inset separating layered timber rails.
    [-.83,.83].forEach(z=>beam([-2.18,topY+.085,z],[2.18,topY+.085,z],.024,.022,'#9a5344','accent'));
    // Underside table supports align with both X end supports.
    [-.76,.76].forEach(z=>beam([-2.03,2.20,z],[2.03,2.20,z],.088,.12,C.dark,'supports'));
  }
  function compileShader(type, source){
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  function setup(){
    if(isShelter) buildShelter(); else buildTable();
    gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'low-power',preserveDrawingBuffer:false});
    if(!gl){ ctx2d=canvas.getContext('2d'); if(!ctx2d)throw Error('3D canvas unavailable');return; }
    const vs=`attribute vec3 a_pos;attribute vec3 a_normal;attribute vec3 a_color;
      uniform vec3 u_eye;uniform vec3 u_target;uniform vec3 u_offset;uniform float u_aspect;uniform float u_fov;
      varying vec3 v_color;varying float v_light;
      void main(){vec3 p=a_pos+u_offset;vec3 f=normalize(u_target-u_eye);
        vec3 r=normalize(cross(f,vec3(0.0,1.0,0.0)));vec3 u=cross(r,f);
        vec3 d=p-u_eye;float z=max(.05,dot(d,f));
        float A=(100.0+.1)/(100.0-.1); float B=(2.0*100.0*.1)/(100.0-.1);
        gl_Position=vec4(dot(d,r)*u_fov/u_aspect,dot(d,u)*u_fov,A*z-B,z);
        float diffuse=max(.05,dot(normalize(a_normal),normalize(vec3(-.42,.8,.6))));
        v_light=.52 + .48*diffuse;
        v_color=a_color;
      }`;
    const fs=`precision mediump float;varying vec3 v_color;varying float v_light;
      void main(){vec3 c=v_color*v_light;gl_FragColor=vec4(pow(c,vec3(.91)),1.0);}`;
    program=gl.createProgram();gl.attachShader(program,compileShader(gl.VERTEX_SHADER,vs));gl.attachShader(program,compileShader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    for(let [key,data] of Object.entries(dataStore)){
      const chunk={n:data.positions.length/3};
      for(const [field,attribute] of [['positions','a_pos'],['normals','a_normal'],['colors','a_color']]){
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data[field]),gl.STATIC_DRAW);
        chunk[field]=buffer;chunk[attribute]=gl.getAttribLocation(program,attribute);
      }
      groups[key]=chunk;
    }
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
    gl.clearColor(.95,.955,.94,1);
  }
  function offsets(name){
    if(assemblyMode && partOf[name]!==undefined)return partOffsets[partOf[name]];
    if(assemblyMode)return [0,0,0];
    const exp=state.explode;
    if(isShelter){
      if(name==='roof'||name==='roofDetails') return [0,exp*1.35,0];
      if(name==='rafters')return [0,exp*.25,0];
      if(name==='skin'||name==='windowTrim'||name==='windows'||name==='gableTrim')return [0,0,exp*.22];
      if(name==='floor')return [0,exp*.26,0];
      if(name==='door')return [0,0,exp*.85];
      if(name==='wheels')return [0,-exp*.30,0];
      
    }else{
      if(['outerOak','blueGum','innerOak','accent','plyBase'].includes(name))return [0,exp*.70,0];
      if(name==='capLeft'||name==='capRight')return [0,exp*.10,0];
      if(name==='resin'||name==='resinHighlight')return [0,exp*1.10,0];
      if(name==='stretcher')return [0,-exp*.16,0];
    }
    return [0,0,0];
  }
  function visible(name){
    if(assemblyMode)return true;
    if(state.mode==='structure'){
      if(isShelter && ['roof','roofDetails','skin','door','windows','windowTrim','gableTrim','glow','floor'].includes(name))return false;
      if(!isShelter && ['outerOak','blueGum','innerOak','accent','plyBase','resin','resinHighlight'].includes(name))return false;
    }
    if(isShelter && name==='glow' && !state.light)return false;
    return true;
  }
  function eye(){return add(cameraTarget,[state.radius*Math.sin(state.theta)*Math.cos(state.phi),state.radius*Math.sin(state.phi),state.radius*Math.cos(state.theta)*Math.cos(state.phi)]);}
  function project(p,offset=[0,0,0]){
    const e=eye(), f=norm(sub(cameraTarget,e)), r=norm(cross(f,[0,1,0])),u=cross(r,f);
    const d=sub(add(p,offset),e), z=dot(d,f);
    const w=canvas.clientWidth,h=canvas.clientHeight,mag=1/Math.tan(Math.PI/6);
    if(z<=.1||!w||!h)return [-200,-200];
    return [w*(.5 + .5*dot(d,r)*mag/(z*(w/h))),h*(.5-.5*dot(d,u)*mag/z)];
  }
  function render(){
    if(!state.started||(!gl&&!ctx2d))return;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    const dpr=Math.min(window.devicePixelRatio||1,gl?1.6:1),cw=Math.round(w*dpr),ch=Math.round(h*dpr);
    if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;if(gl)gl.viewport(0,0,cw,ch);}
    if(ctx2d){renderCanvas2d(w,h,dpr);updateHotspots(w,h);return;}
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
    const uniform=(n)=>gl.getUniformLocation(program,n);
    gl.uniform3fv(uniform('u_eye'),new Float32Array(eye()));
    gl.uniform3fv(uniform('u_target'),new Float32Array(cameraTarget));
    gl.uniform1f(uniform('u_aspect'),w/h);gl.uniform1f(uniform('u_fov'),1/Math.tan(Math.PI/6));
    for(const [name,mesh] of Object.entries(groups)){
      if(!visible(name))continue;
      gl.uniform3fv(uniform('u_offset'),new Float32Array(offsets(name)));
      for(const field of ['positions','normals','colors']){
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh[field]);const loc=mesh['a_'+(field==='positions'?'pos':field==='normals'?'normal':'color')];
        gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);
      }
      gl.drawArrays(gl.TRIANGLES,0,mesh.n);
    }
    updateHotspots(w,h);
  }
  function updateHotspots(w,h){
    if(assemblyPicked){
      assemblyPicked.hidden=!assemblyMode||selectedPart<0||isAssembled[selectedPart];
      if(!assemblyPicked.hidden){const p=assemblyParts[selectedPart],where=project(p.anchor,partOffsets[selectedPart]);
        assemblyPicked.style.left=where[0]+'px';assemblyPicked.style.top=where[1]+'px';
        assemblyPicked.textContent=p.label;}
    }
    if(assemblyTarget){
      assemblyTarget.hidden=!assemblyMode||selectedPart<0||isAssembled[selectedPart];
      if(!assemblyTarget.hidden){const [x,y]=project(assemblyParts[selectedPart].anchor);
        assemblyTarget.style.left=x+'px';assemblyTarget.style.top=y+'px';}
    }
    annotations.querySelectorAll('button').forEach((btn,i)=>{
      const item=infoData[i], delta=offsets(item[3]);
      const [x,y]=project(item[2],delta);
      btn.style.left=`${x}px`;btn.style.top=`${y}px`;
      btn.hidden=assemblyMode||(x<3||y<5||x>w-3||y>h-3||(state.mode==='structure' && isShelter && item[3]==='roof'));
    });
  }
  function renderCanvas2d(w,h,dpr){
    // Depth-buffered software rasterizer. Unlike painter sorting, per-pixel depth
    // keeps roof, open windows, framing and joinery properly occluded.
    // Used as an offline-capable backup if WebGL cannot be initialised.
    const pw=canvas.width, ph=canvas.height;
    if(!pw||!ph)return;
    const rgba=new Uint8ClampedArray(pw*ph*4);
    const zbuf=new Float32Array(pw*ph);
    zbuf.fill(Infinity);
    for(let y=0;y<ph;y++){
      const t=y/(ph||1),rr=Math.round(249-19*t),gg=Math.round(250-17*t),bb=Math.round(245-15*t);
      for(let x=0;x<pw;x++){
        const pos=(y*pw+x)*4;rgba[pos]=rr;rgba[pos+1]=gg;rgba[pos+2]=bb;rgba[pos+3]=255;
      }
    }
    const e=eye(),f=norm(sub(cameraTarget,e)),r=norm(cross(f,[0,1,0])),u=cross(r,f),mag=1/Math.tan(Math.PI/6);
    const projectPx=(x,y,z,off)=>{
      const vx=x+off[0]-e[0],vy=y+off[1]-e[1],vz=z+off[2]-e[2];
      const zz=vx*f[0]+vy*f[1]+vz*f[2];if(zz<=.12)return null;
      const horiz=(vx*r[0]+vy*r[1]+vz*r[2])*mag/zz;
      const vert=(vx*u[0]+vy*u[1]+vz*u[2])*mag/zz;
      return [pw*(.5+.5*horiz/(pw/ph)),ph*(.5-.5*vert),1/zz];
    };
    for(const [name,obj] of Object.entries(dataStore)){
      if(!visible(name))continue;
      const off=offsets(name),ps=obj.positions,ns=obj.normals,co=obj.colors;
      for(let i=0;i<ps.length;i+=9){
        const a=projectPx(ps[i],ps[i+1],ps[i+2],off);
        const b=projectPx(ps[i+3],ps[i+4],ps[i+5],off);
        const c=projectPx(ps[i+6],ps[i+7],ps[i+8],off);
        if(!a||!b||!c)continue;
        const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(pw-1,Math.ceil(Math.max(a[0],b[0],c[0])));
        const minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(ph-1,Math.ceil(Math.max(a[1],b[1],c[1])));
        if(maxX<minX||maxY<minY)continue;
        const denom=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
        if(Math.abs(denom)<1e-5)continue;
        const id=1/denom;
        const diffuse=Math.max(.06,ns[i]*(-.42)+ns[i+1]*.8+ns[i+2]*.6);
        const light=.56+.44*diffuse;
        const cr=Math.min(255,Math.floor(255*Math.pow(co[i]*light,.91)));
        const cg=Math.min(255,Math.floor(255*Math.pow(co[i+1]*light,.91)));
        const cb=Math.min(255,Math.floor(255*Math.pow(co[i+2]*light,.91)));
        for(let yy=minY;yy<=maxY;yy++)for(let xx=minX;xx<=maxX;xx++){
          const dx=xx+.5-c[0],dy=yy+.5-c[1];
          const aa=((b[1]-c[1])*dx+(c[0]-b[0])*dy)*id;
          if(aa<-.0005)continue;
          const bb=((c[1]-a[1])*dx+(a[0]-c[0])*dy)*id;
          if(bb<-.0005)continue;
          const cc=1-aa-bb;if(cc<-.0005)continue;
          const depth=aa*a[2]+bb*b[2]+cc*c[2];
          const ptr=yy*pw+xx;
          if(1/depth>=zbuf[ptr])continue;
          zbuf[ptr]=1/depth;
          const q=ptr*4;rgba[q]=cr;rgba[q+1]=cg;rgba[q+2]=cb;
        }
      }
    }
    ctx2d.putImageData(new ImageData(rgba,pw,ph),0,0);
  }
  function updateDisplay(){
    host.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
    const lightButton=host.querySelector('[data-action="light"]');if(lightButton){lightButton.setAttribute('aria-pressed',String(state.light));lightButton.innerHTML=state.light?'Lights on <span aria-hidden="true">◑</span>':'Lights off <span aria-hidden="true">◐</span>';}
    const colourButton=host.querySelector('[data-action="colour"]');if(colourButton){colourButton.setAttribute('aria-pressed',String(state.blue));colourButton.innerHTML=state.blue?'Blue concept active <span aria-hidden="true">↔</span>':'Blue concept <span aria-hidden="true">↔</span>';}
    host.querySelector('[data-action="auto"]').setAttribute('aria-pressed',String(state.auto));
  }
  function selectDetail(index){
    state.selected=index;const [heading,body]=infoData[index];
    infoTitle.textContent=`${String(index+1).padStart(2,'0')} / ${heading.toUpperCase()}`;
    info.replaceChildren();const strong=document.createElement('strong');strong.textContent=heading;
    const paragraph=document.createElement('p');paragraph.textContent=body;info.append(strong,paragraph);
    annotations.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('active',i===index));
  }
  function initHotspots(){
    infoData.forEach(([heading],i)=>{
      const btn=document.createElement('button');btn.type='button';btn.className='model-hotspot';
      btn.title=heading;btn.setAttribute('aria-label',`Inspect ${heading}`);
      btn.innerHTML=`<span>${i+1}</span>`;
      btn.addEventListener('click',()=>{selectDetail(i);render();});annotations.append(btn);
    });
  }
  let last=0;
  function tick(now){
    if(!state.running)return;
    const dt=clamp((now-last)/1000,0,.07);last=now;
    if(state.auto && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)state.theta+=dt*.25;
    state.explode+=(state.explodeTarget-state.explode)*Math.min(1,dt*6.5);
    render();requestAnimationFrame(tick);
  }
  const obs=typeof IntersectionObserver!=='undefined' ? new IntersectionObserver(entries=>{
    if(!state.started)return;
    const show=entries[0].isIntersecting;
    if(show&&!state.running){state.running=true;last=performance.now();requestAnimationFrame(tick);}
    else if(!show)state.running=false;
  },{threshold:0.01}):null;
  function start(){
    try{setup();initHotspots();state.started=true;cover.hidden=true;stage.classList.add('is-active');updateDisplay();assemblyUI();render();
      if(ctx2d)stage.dataset.renderer='canvas'; else stage.dataset.renderer='webgl';
      if(obs)obs.observe(stage);else{state.running=true;last=performance.now();requestAnimationFrame(tick);}
    }catch(err){console.warn('Model viewer unavailable',err);cover.hidden=true;fallback.hidden=false;host.querySelectorAll('.model-controls button,.model-stage-tools button').forEach(b=>b.disabled=true);}
  }
  launch.addEventListener('click',start,{once:true});
  host.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{
    if(!state.started){launch.click();if(!state.started)return;}
    state.mode=btn.dataset.mode;state.explodeTarget=state.mode==='explode'?1:0;updateDisplay();render();
  }));
  host.querySelector('[data-action="light"]')?.addEventListener('click',()=>{
    if(!state.started){launch.click();if(!state.started)return;}
    state.light=!state.light;
    // swap the glass colour in WebGL for visible illumination: update only window color buffer
    const chunk=groups.windows;
    if(dataStore.windows){
      const arr=new Float32Array(dataStore.windows.colors.length);
      const col=hex(state.light?C.glassOn:C.glass);
      for(let i=0;i<arr.length;i+=3)arr.set(col,i);
      dataStore.windows.colors=Array.from(arr);
      if(gl&&chunk){gl.bindBuffer(gl.ARRAY_BUFFER,chunk.colors);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);}
    }
    updateDisplay();render();
  });
  host.querySelector('[data-action="colour"]')?.addEventListener('click',()=>{
    if(!state.started){launch.click();if(!state.started)return;}
    state.blue=!state.blue;
    for(const key of ['resin','resinHighlight']){
      const mesh=groups[key],obj=dataStore[key];
      if(!obj)continue;
      const col=hex(state.blue?(key==='resin'?'#6a9d9a':'#99c8c3'):(key==='resin'?C.red:'#c06459'));
      const arr=new Float32Array(obj.colors.length);
      for(let i=0;i<arr.length;i+=3)arr.set(col,i);
      obj.colors=Array.from(arr);
      if(gl&&mesh){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.colors);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);}
    }
    updateDisplay();render();
  });
  host.querySelector('[data-action="reset"]').addEventListener('click',()=>{
    if(!state.started)return;
    state.theta=isShelter?.62:.84;state.phi=isShelter?.30:.41;
    state.radius=isShelter?(window.innerWidth<700?9.0:7.7):(window.innerWidth<700?6.6:5.55);state.mode='exterior';state.explodeTarget=0;state.auto=false;
    updateDisplay();render();
  });
  host.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{
    if(!state.started){launch.click();if(!state.started)return;}
    if(btn.dataset.view==='top'){state.theta=.35;state.phi=1.18;state.radius=isShelter?9.6:6.7;}
    else{state.theta=isShelter?.04:1.48;state.phi=isShelter?.19:.17;state.radius=isShelter?8.4:5.7;}
    state.auto=false;updateDisplay();render();
  }));
  host.querySelector('[data-action="auto"]').addEventListener('click',()=>{if(!state.started)return;state.auto=!state.auto;updateDisplay();});
  host.querySelector('[data-action="fullscreen"]').addEventListener('click',()=>{
    if(!state.started)return;
    if(document.fullscreenElement)document.exitFullscreen?.();else stage.requestFullscreen?.();
  });
  dock?.querySelector('[data-assembly-dock="close"]')?.addEventListener('click',()=>{assemblyMode=false;assemblyUI();render();});
  dock?.querySelector('[data-assembly-dock="snap"]')?.addEventListener('click',()=>{if(assemblyMode)snapPiece(selectedPart,true);});
  dock?.querySelector('[data-assembly-dock="detach"]')?.addEventListener('click',()=>{
    if(!assemblyMode||selectedPart<0)return;
    recordAssembly();partOffsets[selectedPart]=assemblyParts[selectedPart].home.slice();isAssembled[selectedPart]=false;assemblyStatus(`${assemblyParts[selectedPart].label} removed. Undo will restore it.`);assemblyUI();render();
  });
  dock?.querySelector('[data-assembly-dock="orbit"]')?.addEventListener('click',()=>{if(assemblyMode){assemblyOrbit=!assemblyOrbit;assemblyUI();}});
  assemblyHost?.querySelector('[data-assembly="toggle"]')?.addEventListener('click',()=>{
    if(!state.started){launch.click();if(!state.started)return;}
    assemblyMode=!assemblyMode;state.auto=false;state.mode='exterior';state.explode=0;state.explodeTarget=0;
    if(assemblyMode){
      state.radius=isShelter?(window.innerWidth<700?11.2:9.9):(window.innerWidth<700?9.1:7.7);
      state.phi=.43;state.theta=.68;
      resetAssembly();
      stage.scrollIntoView({block:'center',behavior:'smooth'});
    }else{state.radius=isShelter?(window.innerWidth<700?9:7.7):(window.innerWidth<700?6.6:5.55);assemblyStatus('Explore the complete model, or rebuild it yourself.');assemblyUI();render();}
  });
  assemblyHost?.querySelector('[data-assembly="reset"]')?.addEventListener('click',()=>{if(assemblyMode)resetAssembly(true);});
  assemblyHost?.querySelector('[data-assembly="snap"]')?.addEventListener('click',()=>{if(assemblyMode&&selectedPart>=0)snapPiece(selectedPart,true);});
  assemblyHost?.querySelector('[data-assembly="back"]')?.addEventListener('click',()=>{
    if(!assemblyMode)return;
    const i=selectedPart>=0?selectedPart:assemblyParts.length-1;
    recordAssembly();partOffsets[i]=assemblyParts[i].home.slice();isAssembled[i]=false;
    assemblyStatus(`${assemblyParts[i].label} detached. Drag it back into place.`);assemblyUI();render();
  });
  host.querySelectorAll('[data-assembly="undo"], [data-assembly-dock="undo"]').forEach(b=>b.addEventListener('click',undoAssembly));
  assemblyHost?.querySelector('[data-assembly="orbit"]')?.addEventListener('click',()=>{
    if(!assemblyMode)return;assemblyOrbit=!assemblyOrbit;
    assemblyStatus(assemblyOrbit?'Orbit mode: drag to rotate the whole model.':'Move mode: drag the selected part into position.');assemblyUI();
  });
  let dragging=false,lastX=0,lastY=0,pinchDistance=0,wasMovingPart=false;
  const pointers=new Map();
  stage.addEventListener('pointerdown',e=>{
    if(!state.started||e.target.closest('button'))return;
    pointers.set(e.pointerId,[e.clientX,e.clientY]);
    stage.setPointerCapture(e.pointerId);
    if(pointers.size===1){dragging=true;lastX=e.clientX;lastY=e.clientY;wasMovingPart=assemblyMode&&!assemblyOrbit&&selectedPart>=0;if(wasMovingPart)recordAssembly();}
    if(pointers.size===2){dragging=false;const pts=[...pointers.values()];pinchDistance=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);}
  });
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(pointers.size>=2){
      const pts=[...pointers.values()];
      const distance=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);
      if(pinchDistance>0)state.radius=clamp(state.radius*pinchDistance/Math.max(1,distance),4,16);
      pinchDistance=distance;render();return;
    }
    if(!dragging){lastX=e.clientX;lastY=e.clientY;dragging=true;return;}
    if(assemblyMode&&!assemblyOrbit&&selectedPart>=0){
      const part=assemblyParts[selectedPart],e0=eye(),f=norm(sub(cameraTarget,e0));
      const right=norm(cross(f,[0,1,0])),up=cross(right,f);
      const distance=Math.hypot(...sub(add(part.anchor,partOffsets[selectedPart]),e0));
      const k=2*Math.tan(Math.PI/6)*distance/Math.max(1,stage.clientHeight);
      partOffsets[selectedPart]=add(partOffsets[selectedPart],add(scale(right,(e.clientX-lastX)*k),scale(up,-(e.clientY-lastY)*k)));
      isAssembled[selectedPart]=false;
    }else{
      state.theta+=(e.clientX-lastX)*.008;
      state.phi=clamp(state.phi+(e.clientY-lastY)*.006,-.13,1.28);
    }
    lastX=e.clientX;lastY=e.clientY;render();
  });
  function releasePointer(e){
    if(assemblyMode&&!assemblyOrbit&&selectedPart>=0&&wasMovingPart){
      if(snapPiece(selectedPart,false)){}else{assemblyStatus(`Move ${partText(selectedPart)} nearer the outlined destination. Use Snap selected for keyboard or precise placement.`);assemblyUI();render();}
    }
    pointers.delete(e.pointerId);dragging=false;wasMovingPart=false;pinchDistance=0;
  }
  stage.addEventListener('pointerup',releasePointer);
  stage.addEventListener('pointercancel',releasePointer);
  stage.addEventListener('wheel',e=>{if(!state.started)return;e.preventDefault();state.radius=clamp(state.radius*Math.exp(e.deltaY*.001),4,16);render();},{passive:false});
  stage.addEventListener('keydown',e=>{
    if(!state.started||e.target.closest('button'))return;
    const map={ArrowLeft:()=>state.theta-=.12,ArrowRight:()=>state.theta+=.12,ArrowUp:()=>state.phi=clamp(state.phi+.10,-.13,1.28),ArrowDown:()=>state.phi=clamp(state.phi-.10,-.13,1.28),'+':()=>state.radius=clamp(state.radius-.5,4,16),'-':()=>state.radius=clamp(state.radius+.5,4,16)};
    if(map[e.key]){e.preventDefault();map[e.key]();render();}
  });
  // Prevent scroll hijack by keeping the canvas dormant until launched.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
  window.addEventListener('resize',render,{passive:true});
})();
