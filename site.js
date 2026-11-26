// Mobile menu toggle
const nav = document.querySelector('.nav');
const burger = nav && nav.querySelector('.burger');
if (burger) {
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) burger.click(); });
}
