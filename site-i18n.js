/* Local, dependency-free site translation; original Chinese stays the source of truth. */
(() => {
  'use strict';
  const translations = {"良友资源中心":"LiangYou Resource Hub","图标投稿":"Submit Icons","赛事数据":"Match Data","每日限免":"Daily Freebies","良友福利":"App Deals","实验室":"Resource Lab","交流社区":"Community","良哥看未来的 App 资源集合":"Curated app resources by LiangYou","好资源，":"Great resources,","一处找到。":"all in one place.","从媒体徽章、精选图标，到国内外良友主播单。":"From media badges and curated icons to live channel lists.","把日常用得上的好资源，整理成一个入口。":"Useful everyday resources, organized in one place.","拖动旋转 · 点击发光":"Drag to rotate · Tap to glow","① 资源库":"① Resource Library","选一个，现在就用。":"Pick a resource and get started.","查看预览，按 App 选择合适的版本。":"Preview resources and choose a version for your app.","全部资源":"All resources","没有找到匹配的资源":"No matching resources","清除筛选":"Clear filters","正在加载资源目录…":"Loading resource catalog…","你的图标，也能加入良友图标库。":"Your icon can join the LiangYou library.","分享原创静态图标或动态 GIF，上传后即可预览并提交审核。通过审核后收录至正式图标库，让更多人发现你的作品。":"Share original static icons or animated GIFs. Preview and submit for review; approved icons join the public library.","赛事数据中心":"Match Intelligence","每日限免 ":"Daily Freebies ","苹果国区、美区、安卓与 PC 游戏限免。多来源收集，商店现价核验，持续自动更新。":"Limited-time free apps in China and US App Stores, Android and PC games. Prices are checked against official stores.","🇨🇳 苹果国区":"🇨🇳 China App Store","🇺🇸 苹果美区":"🇺🇸 US App Store","🤖 安卓限免":"🤖 Android","每 3 小时计划检查":"Scheduled checks every 3 hours","读取最新数据 ↻":"Refresh data ↻","收起 ↑":"Show less ↑","查看更多 ↓":"Show more ↓","多来源收集 · 商店核验":"Multiple sources · Store verified","App 限时优惠":"Limited-time App Deals","良友联名软件":"LiangYou Collaborations","熟悉的应用，换一种专属形象。收录良哥看未来的联名图标作品。":"A new look for familiar apps. Explore LiangYou's co-branded icons.","播放器 · 联名图标":"Player · Collaboration","影音播放器 · 联名图标":"Media player · Collaboration","直播聚合 · 联名图标":"Live streaming · Collaboration","音乐播放 · 联名图标":"Music player · Collaboration","多端影音 · 联名图标":"Cross-platform media · Collaboration","漫画阅读 · 联名图标":"Comics · Collaboration","车机投屏 · 联名图标":"Car casting · Collaboration","灵动岛悬浮助手 · 联名图标":"Dynamic Island utility · Collaboration","应用集合 · 联名图标":"App collection · Collaboration","让测试版应用连接更多体验用户":"Connecting beta apps with more testers","开发者":"Developers","体验用户":"Beta testers","资源实验室":"Resource Lab","良友科技学院":"LiangYou Community","友情合作单位":"Partners","资源详情 · 选择版本":"Resource Details · Choose Version","选择版本与导入":"Choose Version & Import","查看赛事数据":"View Match Data","获取汇流直播":"Get Conflux","数据核对":"Data verified","原仓库":"Source repository","已上线":"Available","媒体图标":"Media Icons","频道主播":"Live Channels","查看详情":"View details","复制链接":"Copy link","复制":"Copy","打开链接":"Open link","查看预览":"Preview","资源更新":"Data verified","查看更多赛事 ↓":"More matches ↓","收起赛事 ↑":"Fewer matches ↑","全部赛事":"All matches","🎮 英雄联盟":"🎮 League of Legends","⚽ 足球":"⚽ Football","🕹️ 其他电竞":"🕹️ Other Esports","🏈 其他体育":"🏈 Other Sports","中文":"中文","English":"English","同步时间以赛事看板为准":"See match dashboard for sync time","（北京时间）":"(Beijing time)","数量与更新说明来自各资源原仓库。":"Counts and verification dates are sourced from original repositories.","良友主播单":"LiangYou Channel List","媒体徽章":"Media Badges","精选与专属":"Curated & Exclusive","已上线项目":"Live Projects","主播单直播间":"Live Channels"};
  const original = new WeakMap();
  const controls = [...document.querySelectorAll('[data-site-lang]')];
  if (!controls.length) return;
  let language = localStorage.getItem('liangyou-site-language') === 'en' ? 'en' : 'zh';
  let busy = false;
  function translateText(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    let result = translations[trimmed];
    if (!result) {
      result = trimmed;
      for (const [cn,en] of Object.entries(translations).sort((a,b) => b[0].length-a[0].length)) {
        if (cn.length >= 4 && result.includes(cn)) result = result.split(cn).join(en);
      }
    }
    return raw.replace(trimmed,result);
  }
  function apply() {
    if (busy) return;
    busy = true;
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    controls.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.siteLang === language)));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,textarea,code,pre,[data-site-lang],.sports-match,.sports-prob,.sports-track')) continue;
      if (!original.has(node)) original.set(node,node.nodeValue);
      const source = original.get(node);
      const desired = language === 'en' ? translateText(source) : source;
      if (node.nodeValue !== desired) node.nodeValue = desired;
    }
    // Keep the match dashboard's existing bilingual translations in sync.
    const sportsButton = document.querySelector('[data-sports-lang="' + language + '"]');
    if (sportsButton && sportsButton.getAttribute('aria-pressed') !== 'true') sportsButton.click();
    busy = false;
  }
  controls.forEach(btn => btn.addEventListener('click', () => {
    language = btn.dataset.siteLang;
    localStorage.setItem('liangyou-site-language', language);
    apply();
  }));
  const observer = new MutationObserver(mutations => {
    if (busy || language !== 'en') return;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        requestAnimationFrame(apply);
        return;
      }
    }
  });
  observer.observe(document.body, {childList:true,characterData:true,subtree:true});
  apply();
  window.addEventListener('load', apply);
})();
