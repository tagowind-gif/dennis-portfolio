/* V8 — reader-controlled text sizing and interactive project studio.
   User testing: Saleh requested an adjustable global text-size slider.
   The two project selector buttons are an additional developer-initiated usability improvement. */
(()=>{
'use strict';
const root=document.documentElement;
const toggle=document.getElementById('reading-toggle');
const panel=document.getElementById('reading-panel');
const slider=document.getElementById('reading-slider');
const output=document.getElementById('reading-value');
const reset=document.getElementById('reading-reset');
if(toggle&&panel&&slider){
 let stored='100';
 try{stored=localStorage.getItem('dennis-reading-size')||'100'}catch(e){}
 if(!/^(100|105|110|115|120|125|130)$/.test(stored))stored='100';
 const change=value=>{
  const n=Math.max(100,Math.min(130,Math.round(Number(value)/5)*5));
  const s=String(n);
  root.dataset.readingSize=s;
  slider.value=s;
  if(output)output.textContent=s+'%';
  try{localStorage.setItem('dennis-reading-size',s)}catch(e){}
 };
 change(stored);
 toggle.addEventListener('click',()=>{
  const open=panel.hidden;
  panel.hidden=!open;
  toggle.setAttribute('aria-expanded',String(open));
  if(open)slider.focus();
 });
 slider.addEventListener('input',()=>change(slider.value));
 reset?.addEventListener('click',()=>{change(100);slider.focus()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus()}});
 document.addEventListener('click',event=>{if(!panel.hidden&&!event.target.closest('.reading-widget')){panel.hidden=true;toggle.setAttribute('aria-expanded','false')}});
}
const buttons=[...document.querySelectorAll('[data-studio-project]')];
if(buttons.length){
 const img=document.querySelector('[data-studio-image]');
 const title=document.querySelector('[data-studio-title]');
 const body=document.querySelector('[data-studio-description]');
 const note=document.querySelector('[data-studio-evidence]');
 const link=document.querySelector('[data-studio-link]');
 const palettes=document.querySelector('[data-studio-palette]');
 const designs={
  shelter:{title:'Tiny Homeless Shelter',image:'assets/images/shelter-cad-frame.webp',alt:'CAD study of the timber frame for the mobile shelter',description:'From a wheeled timber base through wall frames and gable rafters to an enclosed, lockable prototype. Inspect the modular construction and rotate the interpreted 3D model.',evidence:'Reference: original HSC Design & Technology folio, pp. 33–36.',link:'shelter.html#interactive-3d',colors:['#f7c65e','#188994','#f7f6ec','#2f5a55']},
  table:{title:'Epoxy Resin River Table',image:'assets/images/table-engineering.jpg',alt:'Original HSC table technical drawing',description:'Follow the layered Tasmanian Oak and Blue Gum tabletop, red resin centre, laminated X-leg assemblies and cross-beam. Try its five-part assembly workshop.',evidence:'Reference: original Timber Major Work folio, pp. 17–19 and 29.',link:'river-table.html#interactive-3d',colors:['#b94e40','#d5ae6d','#6d342a','#2d4f5b']}
 };
 function show(which){
  const data=designs[which];if(!data)return;
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studioProject===which)));
  if(img){img.src=data.image;img.alt=data.alt}
  if(title)title.textContent=data.title;
  if(body)body.textContent=data.description;
  if(note)note.textContent=data.evidence;
  if(link)link.href=data.link;
  if(palettes)palettes.innerHTML=data.colors.map(c=>'<span style="background:'+c+'" aria-hidden="true"></span>').join('');
 }
 buttons.forEach(b=>b.addEventListener('click',()=>show(b.dataset.studioProject)));
 show('shelter');
}
})();
