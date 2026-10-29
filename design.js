/* Progressive enhancement: content and navigation never depend on motion. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const drawings = [
    '<rect x="6" y="5" width="28" height="30" rx="4"/><path d="M12 5v30M28 5v30M7 13h5m-5 14h5m16-14h5m-5 14h5M17 15l8 5-8 5Z"/>',
    '<rect x="4" y="9" width="32" height="23" rx="5"/><path d="m14 4 6 5 6-5M16 16l9 5-9 5Z"/>',
    '<path d="M9 12a19 19 0 0 1 19 19M9 20a11 11 0 0 1 11 11"/><circle cx="10" cy="30" r="2"/><path d="M9 4a27 27 0 0 1 27 27"/>',
    '<path d="m9 30 17-21 6 6-21 17Z"/><path d="m23 13 6 6M11 6v6M8 9h6M30 27v7M27 30h6"/>',
    '<path d="m13 11-9 9 9 9m14-18 9 9-9 9M23 6l-6 28"/>',
    '<circle cx="8" cy="10" r="4"/><circle cx="32" cy="10" r="4"/><circle cx="20" cy="31" r="4"/><path d="M12 10h16M10 14l8 13m12-13-8 13"/>'
  ];
  const icon = i => `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[i]}</svg>`;

  // The three on-site channel preview WebPs contain a baked-in top-left Douyin badge.
  // Paint a small locally calculated replacement in the browser. No third-party API,
  // external image request, or mutation of the original thumbnail files is required.
  function prepareChannelPortrait(img) {
    if (img.dataset.channelPrepared) return;
    img.dataset.channelPrepared = 'true';
    const clean = () => {
      if (!img.naturalWidth || !img.naturalHeight || img.classList.contains('is-fallback')) return;
      try {
        const naturalW = img.naturalWidth, naturalH = img.naturalHeight;
        if (naturalW < 100 || naturalH < 100) return;
        // Work on a bounded canvas: avoids repeated multi-megapixel image-data
        // passes on iPhones and slower mainland mobile connections.
        const scale = Math.min(1, 320 / Math.max(naturalW, naturalH));
        const w = Math.max(1, Math.round(naturalW * scale));
        const h = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const bitmap = ctx.getImageData(0, 0, w, h);
        const out = bitmap.data;
        const work = new Float32Array(out.length);
        work.set(out);
        // An expanded patch includes the whole black logo box, not just the glyph.
        const x1 = Math.max(2, Math.floor(w * .017));
        const x2 = Math.min(w - 3, Math.ceil(w * .386));
        const y1 = Math.max(2, Math.floor(h * .018));
        const y2 = Math.min(h - 3, Math.ceil(h * .225));
        const stride = w * 4;
        // Interpolate the surrounding original photo across the masked rectangle.
        for (let y = y1; y <= y2; y++) {
          for (let x = x1; x <= x2; x++) {
            const n = (y * w + x) * 4;
            const left = (y * w + x1 - 1) * 4;
            const right = (y * w + x2 + 1) * 4;
            const above = ((y1 - 1) * w + x) * 4;
            const below = ((y2 + 1) * w + x) * 4;
            const tx = (x - x1 + 1) / (x2 - x1 + 2);
            const ty = (y - y1 + 1) / (y2 - y1 + 2);
            for (let c = 0; c < 3; c++) {
              const horizontal = work[left + c] * (1 - tx) + work[right + c] * tx;
              const vertical = work[above + c] * (1 - ty) + work[below + c] * ty;
              work[n + c] = (horizontal + vertical) / 2;
            }
          }
        }
        // Low-cost harmonic fill smooths the patch without altering the rest.
        for (let pass = 0; pass < 8; pass++) {
          for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
              const n = (y * w + x) * 4;
              for (let c = 0; c < 3; c++) {
                work[n + c] = (work[n - 4 + c] + work[n + 4 + c] +
                  work[n - stride + c] + work[n + stride + c]) * .25;
              }
            }
          }
        }
        for (let y = y1; y <= y2; y++) {
          for (let x = x1; x <= x2; x++) {
            const n = (y * w + x) * 4;
            for (let c = 0; c < 3; c++) out[n + c] = work[n + c];
          }
        }
        ctx.putImageData(bitmap, 0, 0);
        img.dataset.channelCleaned = 'true';
        img.src = canvas.toDataURL('image/webp', .86);
      } catch {
        // Graceful fallback: preserve the source picture if canvas is unavailable.
        img.dataset.channelCleaned = 'unsupported';
      }
    };
    const schedule = () => {
      // Keep image decode and the visible thumbnail ahead of CPU retouching.
      if ('requestIdleCallback' in window) requestIdleCallback(clean, {timeout:1100});
      else setTimeout(clean, 160);
    };
    if (img.complete) schedule();
    else img.addEventListener('load', schedule, { once:true });
  }

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      entry.target.classList.toggle('in-view', entry.isIntersecting);
      if (entry.isIntersecting && !entry.target.classList.contains('has-entered')) {
        entry.target.classList.add('has-entered');
        if (!reduced.matches) entry.target.classList.add('reveal-enter');
        if (!entry.target.classList.contains('section-orbit')) observer.unobserve(entry.target);
      }
    }
  }, {threshold: .08}) : null;
  function enhance() {
    document.querySelectorAll('.art-channels img[data-clean-channel-badge]').forEach(prepareChannelPortrait);
    document.querySelectorAll('.lab-card').forEach((card, i) => {
      if (card.querySelector('.lab-symbol')) return;
      const emblem = document.createElement('span');
      emblem.className = 'lab-symbol';
      emblem.innerHTML = icon(i % drawings.length);
      card.querySelector('h3').before(emblem);
    });
    document.querySelectorAll('.section-heading, .project-card, .offer-card, .collab-card, .tf-store-card, .update-item, .guide-steps li, .lab-card, .community-panel, .partner-card, .section-orbit').forEach(el => {
      if (el.dataset.observed) return;
      el.dataset.observed = 'true';
      observer?.observe(el);
    });
    document.querySelectorAll('img').forEach(img => { if (img.complete && !img.naturalWidth) recoverImage(img); });
  }
  // A failed request retries once, then uses an on-site placeholder with the original alt label.
  function recoverImage(img) {
    if (img.dataset.imageState === 'fallback') return;
    if (!img.dataset.imageState) {
      img.dataset.imageState = 'retry';
      const url = new URL(img.currentSrc || img.src, document.baseURI);
      if (url.origin === location.origin) { url.searchParams.set('retry', '1'); img.src = url.href; return; }
    }
    img.dataset.imageState = 'fallback';
    img.src = new URL('./assets/image-fallback.svg', document.baseURI).href;
    img.classList.add('is-fallback');
  }
  document.addEventListener('error', e => { if (e.target instanceof HTMLImageElement) recoverImage(e.target); }, true);
  for (const [id, drawing] of [['library',0], ['collabs',3], ['lab',4], ['community',5]]) {
    const section = document.getElementById(id);
    const decoration = document.createElement('div');
    decoration.className = 'section-orbit';
    decoration.setAttribute('aria-hidden','true');
    decoration.innerHTML = `<span class="orbit-ring"></span><span class="orbit-object">${icon(drawing)}</span><span class="orbit-dot"></span>`;
    section?.prepend(decoration);
  }
  const progress = document.createElement('div');
  progress.className = 'reading-progress';
  progress.setAttribute('aria-hidden','true');
  document.querySelector('.site-header').append(progress);
  let pending = false;
  function updateProgress() {
    const range = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${range > 0 ? Math.min(1, Math.max(0, scrollY / range)) : 0})`;
    pending = false;
  }
  addEventListener('scroll', () => { if (!pending) { pending=true; requestAnimationFrame(updateProgress); } }, {passive:true});
  addEventListener('resize', updateProgress);
  document.addEventListener('hub:render', () => { enhance(); updateProgress(); });
  document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('page-hidden', document.hidden));
  enhance(); updateProgress();
})();
