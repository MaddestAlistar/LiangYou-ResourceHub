/* Four-category header navigation: native details remain usable without JavaScript. */
(() => {
  'use strict';
  const nav = document.querySelector('.nav-categories');
  if (!nav) return;
  const groups = Array.from(nav.querySelectorAll('.nav-category'));
  const closeMenus = () => groups.forEach(group => { group.open = false; });
  groups.forEach(group => {
    group.addEventListener('toggle', () => {
      if (!group.open) return;
      groups.forEach(other => { if (other !== group) other.open = false; });
    });
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('.nav-panel a')) closeMenus();
  });
  document.addEventListener('pointerdown', event => {
    if (!nav.contains(event.target)) closeMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const openMenu = groups.find(group => group.open);
      if (openMenu) {
        closeMenus();
        openMenu.querySelector('summary')?.focus();
      }
    }
  });
})();
