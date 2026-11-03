/* INFO1005 final usability refinement.
 * Reading progress; mobile-navigation escape behaviour; honest comparison accessible values.
 * All content remains accessible with scripts disabled. */
(() => {
  'use strict';
  const progress = document.querySelector('.reading-progress-fill');
  let ticking = false;
  function updateProgress() {
    ticking = false;
    if (!progress) return;
    const span = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.max(0, Math.min(1, window.scrollY / span));
    progress.style.transform = `scaleX(${ratio})`;
  }
  function requestUpdate() {
    if (!ticking) { ticking = true; requestAnimationFrame(updateProgress); }
  }
  window.addEventListener('scroll', requestUpdate, {passive:true});
  window.addEventListener('resize', requestUpdate);
  window.addEventListener('load', requestUpdate);
  updateProgress();

  const menuButton = document.querySelector('.nav-trigger');
  const menu = document.querySelector('#primary-navigation');
  if (menuButton && menu) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        menu.classList.remove('open');
        menuButton.setAttribute('aria-expanded','false');
        menuButton.focus();
      }
    }, true); // capture before the shared menu listener so Escape restores keyboard focus
    window.addEventListener('resize', () => {
      if (window.matchMedia('(min-width:981px)').matches && menuButton.getAttribute('aria-expanded') === 'true') {
        menu.classList.remove('open');menuButton.setAttribute('aria-expanded','false');
      }
    });
  }
  for (const slider of document.querySelectorAll('.compare-range')) {
    const update = () => slider.setAttribute('aria-valuetext', `${slider.value}% design image visible`);
    slider.addEventListener('input', update);
    update();
  }
})();
