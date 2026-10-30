/* Mainland-friendly progressive loading: homepage stays interactive while heavier
   film and sports tools load only when their sections are near the viewport.
   Script dependencies retain exactly the original execution order. */
(() => {
  'use strict';
  const modules = [
    {
      id: 'media',
      // The essential catalogue is usable after these two scripts and one CSS.
      styles: ['./media-intel.css?v=20261031-douyin-iosportrait'],
      urls: [
        './media-core.js?v=20261030.anime-unify2',
        './media-intel.js?v=20261030.anime-unify2'
      ],
      // Optional film detail modules hydrate after the catalogue is responsive.
      extraStyles: [
        './media-toolkit.css?v=20261028.7',
        './media-cn-enhance.css?v=20261029.newsvideo6',
        './media-boxoffice-rankings.css?v=20261029.1'
      ],
      extraUrls: [
        './media-toolkit.js?v=20261029.newsroom1',
        './media-title-news.js?v=20261029-multiplatform9',
        './media-insights.js?v=20261031.auditfix1',
        './media-cn-enhance.js?v=20261030.anime-unify2',
        './media-exact-scores.js?v=20261029.newsroom1',
        './media-boxoffice-rankings.js?v=20261029.noarchive1'
      ]
    },
        {
      id: 'daily-free',
      styles: ['./daily-free.css?v=20261025.1'],
      urls: ['./daily-free.js?v=20261024.4']
    },
    {
      id: 'sports',
      styles: [
        './sports.css?v=20261027.4',
        './fixtures.css?v=20261028.1',
        './sports-personal.css?v=20261028.3',
        './sports-share.css?v=20261028.1',
        './sports-history.css?v=20261028.1'
      ],
      urls: [
        './sports-i18n.js?v=20261027.2',
        './sports-link.js?v=20261028.2',
        './sports-personal.js?v=20261028.5',
        './sports.js?v=20261027.4',
        './bracket-viz.js?v=20261027.13',
        './board-i18n.js?v=20261027.2',
        './sports-share.js?v=20261028.2',
        './sports-history.js?v=20261028.3',
        './fixtures.js?v=20261028.7'
      ]
    }
  ];
  const en = () => document.documentElement.lang.startsWith('en');
  const preload = url => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = url;
    document.head.appendChild(link);
  };
  const loadStyles = urls => Promise.all(urls.map(url => new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    // Scoped styles are added in their original order, preserving cascade precedence.
    const timer = setTimeout(() => {
      link.onload = link.onerror = null;
      reject(new Error('module_style_timeout'));
    }, 12000);
    link.onload = () => { clearTimeout(timer); resolve(); };
    link.onerror = () => { clearTimeout(timer); reject(new Error('module_style_unavailable')); };
    document.head.appendChild(link);
  })));
  const loadOne = url => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    const timer = setTimeout(() => {
      script.onload = script.onerror = null;
      script.remove();
      reject(new Error('module_script_timeout'));
    }, 20000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('module_script_unavailable')); };
    document.head.appendChild(script);
  });
  const fail = module => {
    const element = document.getElementById(module.id);
    if (!element || element.querySelector('.cn-module-retry')) return;
    const panel = document.createElement('p');
    panel.className = 'cn-module-retry';
    panel.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = en() ? 'This module could not load on the current connection. ' : '当前网络未能加载此模块。';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = en() ? 'Reload and retry' : '重新加载重试';
    retry.addEventListener('click', () => location.reload());
    panel.append(text, retry);
    element.prepend(panel);
  };
  // A movie can be opened while enrichment files are downloading.
  // Capture the latest detail before those listeners exist and replay it once
  // they are ready; the core catalogue never waits for slow third-party tools.
  const startMediaExtras = module => {
    if (module.enhancementStarted) return;
    module.enhancementStarted = true;
    const root = document.getElementById('media');
    module.extraUrls.forEach(preload);
    (async () => {
      await loadStyles(module.extraStyles);
      for (const url of module.extraUrls) await loadOne(url);
      module.enhanced = true;
      if (module.latestDetail && document.getElementById('media-dialog')?.open) {
        root.dispatchEvent(new CustomEvent('liangyou:media-detail', {detail:module.latestDetail}));
      }
    })().catch(() => {
      // Main film browsing stays available even if enrichment cannot load.
      module.enhanced = false;
    });
  };
  const prefetchMediaSnapshot = () => {
    // Start the 0.8 MB public film snapshot request in parallel with CSS/JS,
    // not after they finish. A single shared Promise avoids duplicate requests.
    if (window.LiangYouMediaSnapshotPrefetch) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    window.LiangYouMediaSnapshotPrefetch = fetch('./data/media-intel.json',
      {cache:'no-cache', signal:controller.signal})
      .then(response => {
        if (!response.ok) throw new Error('media_snapshot_unavailable');
        return response.json();
      })
      .catch(() => null)
      .finally(() => clearTimeout(timer));
  };
  const start = module => {
    if (module.started) return;
    module.started = true;
    if (module.id === 'media') {
      // Register capture before loading the catalogue, so a fast cached
      // response cannot dispatch detail events before extensions exist.
      document.getElementById('media')?.addEventListener('liangyou:media-detail', event => {
        if (!module.enhanced) module.latestDetail=event.detail;
      },true);
      prefetchMediaSnapshot();
    }
    // Preload all URLs in parallel to avoid a 9-request sequential network waterfall.
    module.urls.forEach(preload);
    (async () => {
      await loadStyles(module.styles);
      for (const url of module.urls) await loadOne(url);
      module.loaded = true;
      if (module.id === 'media') startMediaExtras(module);
      // Market snapshots can complete before fixtures.js registers listeners.
      // Replaying the completed state makes first-view odds deterministic.
      if (module.id === 'sports') {
        window.dispatchEvent(new CustomEvent('liangyou:markets-updated'));
      }
    })().catch(() => fail(module));
  };
  const checkDeepLink = () => {
    const hash = location.hash.toLowerCase();
    if (hash === '#media' || new URLSearchParams(location.search).has('film')) start(modules[0]);
    if (hash === '#daily-free') start(modules.find(x => x.id === 'daily-free'));
    if (hash === '#sports') start(modules.find(x => x.id === 'sports'));
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const item of entries) {
        if (!item.isIntersecting) continue;
        const module = modules.find(x => x.id === item.target.id);
        if (module) start(module);
        observer.unobserve(item.target);
      }
    }, { rootMargin: '1100px 0px' });
    modules.forEach(module => {
      const section = document.getElementById(module.id);
      if (section) observer.observe(section);
    });
  } else {
    modules.forEach(start);
  }
  checkDeepLink();
  addEventListener('hashchange', checkDeepLink);
  addEventListener('popstate', checkDeepLink);

  // Pause the 3D iframe's render loop when scrolled away, not just
  // when the browser tab is hidden. Scrolling back restores interaction.
  const logoFrame = document.getElementById('lianggeLogoFrame');
  if (logoFrame && 'IntersectionObserver' in window) {
    let visible = true;
    const sendVisibility = () => {
      try {
        logoFrame.contentWindow?.postMessage(
          {type:'liangyou:logo-visibility',visible},location.origin);
      } catch {}
    };
    logoFrame.addEventListener('load',sendVisibility);
    new IntersectionObserver(entries => {
      visible = entries.some(item => item.isIntersecting);
      sendVisibility();
    },{rootMargin:'120px 0px'}).observe(logoFrame);
  }

  // No third-party CDN, analytics, image host or proxy is required.
  // Cache only self-hosted artwork; current HTML, JS, CSS and live JSON stay network-managed.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    addEventListener('load', () => {
      navigator.serviceWorker.register('./china-cache-sw.js', {scope:'./'}).catch(() => {});
    }, {once:true});
  }

  // Prefer smooth reading to decorative animation when users enable Save-Data
  // or the operating system requests reduced motion.
  const lowData = navigator.connection?.saveData === true;
  if (lowData) document.documentElement.classList.add('cn-save-data');
})();
