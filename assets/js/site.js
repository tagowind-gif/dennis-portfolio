/* Site functionality: accessible menu, keyboard-friendly image viewer.
   Interaction is progressive enhancement; pages and media work without JS. */
(() => {
  'use strict';
  const trigger = document.querySelector('.nav-trigger');
  const nav = document.querySelector('#primary-navigation');
  if (trigger && nav) {
    const closeMenu = () => {
      nav.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    };
    trigger.addEventListener('click', () => {
      const open = !nav.classList.contains('open');
      nav.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    document.addEventListener('click', e => { if (!e.target.closest('.header')) closeMenu(); });
  }

  const dialog = document.querySelector('.gallery-dialog');
  const gallery = [...document.querySelectorAll('[data-gallery-src]')];
  if (dialog && gallery.length && typeof dialog.showModal === 'function') {
    const photo = dialog.querySelector('.dialog-photo');
    const caption = dialog.querySelector('.dialog-caption');
    const counter = dialog.querySelector('.dialog-count');
    let active = 0;
    let lastTrigger;
    function present(index) {
      active = (index + gallery.length) % gallery.length;
      const item = gallery[active];
      photo.src = item.dataset.gallerySrc;
      photo.alt = item.querySelector('img')?.alt || 'Project photograph';
      caption.textContent = item.dataset.galleryCaption || photo.alt;
      counter.textContent = `IMAGE ${String(active+1).padStart(2, '0')} / ${String(gallery.length).padStart(2, '0')}`;
    }
    gallery.forEach((item, index) => item.addEventListener('click', () => {
      lastTrigger = item;
      present(index);
      dialog.showModal();
    }));
    dialog.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
    dialog.querySelector('.dialog-prev')?.addEventListener('click', () => present(active-1));
    dialog.querySelector('.dialog-next')?.addEventListener('click', () => present(active+1));
    dialog.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); present(active-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); present(active+1); }
    });
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { photo.removeAttribute('src'); lastTrigger?.focus(); });
  }
})();


/* V3 original-design comparisons. Keyboard and screen-reader operable via native range. */
document.querySelectorAll('[data-compare]').forEach(module => {
  const range = module.querySelector('.compare-range');
  const concept = module.querySelector('.compare-concept');
  const divider = module.querySelector('.compare-divider');
  const value = module.querySelector('.compare-value');
  if (!range || !concept || !divider) return;
  function render(){
    const percent = Number(range.value);
    concept.style.clipPath = `inset(0 ${100-percent}% 0 0)`;
    divider.style.left = `${percent}%`;
    if(value) value.textContent = `${percent}% ${module.dataset.compareTerm || 'CAD'}`;
    module.querySelectorAll('[data-compare-set]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.compareSet) === percent)));
  }
  range.addEventListener('input',render);
  module.querySelectorAll('[data-compare-set]').forEach(button => button.addEventListener('click',()=>{
    range.value=button.dataset.compareSet;
    range.dispatchEvent(new Event('input',{bubbles:true}));
    range.focus({preventScroll:true});
  }));
  render();
});
