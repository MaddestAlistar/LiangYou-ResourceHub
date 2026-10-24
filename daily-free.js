/* Verified giveaways. Snapshots refresh unattended; open pages poll every 5 min. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const grid = $('dailyFreeGrid'), updated = $('dailyFreeUpdated'), count = $('dailyFreeCount');
  const disclaimer = $('dailyFreeDisclaimer'), sourceLink = $('dailyFreeSource');
  const more = $('dailyFreeMore'), collapse = $('dailyFreeCollapse'), actions = $('dailyFreeActions');
  const schedule = $('dailyFreeSchedule'), refreshButton = $('dailyFreeRefresh'), health = $('dailyFreeHealth');
  const tabs = [...document.querySelectorAll('[data-daily-region]')];
  if (!grid || !updated || !count || !disclaimer || !sourceLink || !more || !tabs.length) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const files = {apple: './data/daily-free.json', android: './data/android-free.json', games: './data/game-free.json', health: './data/update-status.json'};
  const data = {}, errors = {};
  let active = 'cn', limit = 12, pending = false;
  const info = {
    cn: {key:'apple', name:'苹果国区', source:'https://gofans.cn/', note:'国区独立核价 · 近期 30 天降价记录与 Apple 现价交叉核验。仅 App 本体限免，内购、订阅及完整功能是否免费请查看商店。'},
    us: {key:'apple', name:'苹果美区', source:'https://appstore-discounts.com/en/free', note:'美区独立核价 · 近期 30 天降价记录与 Apple 现价交叉核验。包含仍在持续的限免，需使用相应地区 Apple ID；不代表内购和订阅免费。'},
    android: {key:'android', name:'安卓限免', source:'https://www.app-sales.net/nowfree/', note:'AppSales 提供付费转免费线索，Google Play 美区公开商店页再次核价。账号地区、设备和资格可能影响实际售价；含广告或内购的应用会保留原有收费功能。'},
    steam: {key:'games', name:'Steam', source:'https://store.steampowered.com/search/?maxprice=free&specials=1', note:'仅收录 Steam 官方商店明确标注“免费保留”的限时活动，排除试玩、长期免费游戏和站外任务领码。按美区商店核验；DLC 需要拥有本体，领取资格以登录后的商店为准。'},
    epic: {key:'games', name:'Epic', source:'https://store.epicgames.com/zh-CN/free-games', note:'直接核对 Epic 官方活动接口：原价大于 0、现价为 0，且处于领取时间内。分别检查中国和美国地区；实际领取资格以你的 Epic 账号地区为准。'}
  };
  const format = value => {
    const ts = Date.parse(value || '');
    return Number.isFinite(ts) ? new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false}).format(ts) : '等待同步';
  };
  const fresh = value => {
    const age = Date.now() - Date.parse(value || '');
    return Number.isFinite(age) && age >= -3600000 && age <= 7 * 3600000;
  };
  const safeURL = (value, hosts) => {
    try { const u = new URL(value); return u.protocol === 'https:' && hosts.includes(u.hostname) ? u.href : ''; } catch { return ''; }
  };
  const sourceHosts = ['gofans.cn','www.guofenchaxun.com','mergeek.com','appstore-discounts.com','appstore-discounts.eyelly.me','raw.githubusercontent.com','www.app-sales.net','store.steampowered.com','store.epicgames.com','store-site-backend-static.ak.epicgames.com'];
  function valid(item) {
    if (!item || !item.name || item.price !== 0) return false;
    if (active === 'cn' || active === 'us') return Number.isInteger(item.id) && item.id > 0 && item.country === active && item.verification === 'current_apple_price_and_recent_dated_drop';
    if (active === 'android') return /^[a-zA-Z][\w]*(?:\.[\w]+)+$/.test(item.package || '') && item.verification === 'google_play_page_price_and_appsales_drop' && item.country === 'us';
    return item.verification === 'official_active_free_to_keep' && item.platform.toLowerCase() === active && Date.parse(item.ends_at) > Date.now();
  }
  function icon(item, game) {
    const path = typeof item.icon === 'string' && /^\.\/assets\/(daily-free|android-free|game-free)\/[\w.-]+\.(png|jpg|webp)$/.test(item.icon) && !item.icon.includes('..') ? item.icon : '';
    return path ? '<img src="' + esc(path) + '" alt="" loading="lazy" decoding="async" width="' + (game ? 640 : 72) + '" height="' + (game ? 360 : 72) + '" onerror="this.hidden=true">' : '<span class="dailyfree-icon-fallback" aria-hidden="true">' + (game ? '▸' : '✦') + '</span>';
  }
  function card(item) {
    const game = ['steam','epic'].includes(active);
    const url = active === 'android' ? 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(item.package) + '&hl=en_US&gl=US'
      : game ? safeURL(item.url, ['store.steampowered.com','store.epicgames.com']) : 'https://apps.apple.com/' + active + '/app/id' + item.id;
    const source = safeURL(item.source_url, sourceHosts);
    const tag = game ? item.kind === 'dlc' ? 'DLC · 免费保留' : '游戏本体 · 免费保留' : '现价已核验';
    const sub = game ? ((item.regions || []).includes('cn') ? '国区可领' : '美区参考') + ((item.regions || []).length > 1 ? ' · 美区可领' : '')
      : active === 'android' ? 'Google Play · 美区' : (item.platform === 'macOS' ? 'Mac' : 'iPhone / iPad') + ' · ' + (item.genre || 'App Store');
    const meta = game ? '截止 ' + format(item.ends_at) + ' 北京时间' : active === 'android' ? '商店核验 ' + format(item.verified_at) : '降价记录 ' + String(item.discovered_at || '').slice(0,10);
    return '<article class="dailyfree-card' + (game ? ' dailyfree-game-card' : active === 'android' ? ' dailyfree-android-card' : '') + '">' +
      '<a class="dailyfree-main-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="dailyfree-card-top"><span class="dailyfree-icon">' + icon(item, game) + '</span><span class="dailyfree-free-tag">' + esc(tag) + '</span></span>' +
      '<span class="dailyfree-card-name">' + esc(item.name) + '</span><span class="dailyfree-card-sub" title="' + esc(sub) + '">' + esc(sub) + '</span>' +
      (item.kind === 'dlc' ? '<span class="dailyfree-requirement">需本体' + (item.requires_base_game ? '：' + esc(item.requires_base_game) : '') + '</span>' : '') +
      '<span class="dailyfree-card-bottom"><span class="dailyfree-price"><del>' + esc(item.original_price || '') + '</del><strong>' + (item.currency === 'CNY' ? '¥0' : '$0') + '</strong></span><span class="dailyfree-go">去领取 ↗</span></span></a>' +
      '<div class="dailyfree-evidence"><span>' + esc(meta) + '</span>' + (source ? '<a href="' + esc(source) + '" target="_blank" rel="noopener noreferrer">' + esc(item.source || '查看来源') + ' ↗</a>' : '') + '</div></article>';
  }
  function render() {
    const config = info[active], game = ['steam','epic'].includes(active);
    const current = game ? data.games?.platforms?.[active] : active === 'android' ? data.android : data.apple?.regions?.[active];
    const latest = current?.verified_at || current?.checked_at;
    const job = data.health?.jobs?.[config.key === 'apple' ? 'apple' : config.key];
    tabs.forEach(button => { const selected = button.dataset.dailyRegion === active; button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected)); });
    grid.classList.toggle('is-games', game);
    disclaimer.textContent = config.note;
    sourceLink.textContent = '更多 ' + config.name + ' 来源 ↗'; sourceLink.href = config.source;
    updated.textContent = latest ? '商店核验 · ' + format(latest) + '（北京时间）' : '等待同步';
    const due = latest ? new Date(Date.parse(latest) + 3 * 3600000).toISOString() : null;
    schedule.textContent = due ? '下次计划检查 · ' + format(due) + ' 起（北京时间，可能延迟）' : '每 3 小时检查 · 调度可能延迟';
    health.textContent = errors[config.key] ? '读取更新失败，稍后自动重试' : job?.status === 'failed' || current?.status === 'unavailable' ? '上次采集异常，等待自动重试' : current?.status === 'partial' ? '部分来源暂不可用 · 仅展示核验成功的条目' : '付费转免记录 + 商店现价核验';
    actions.hidden = true;
    if (!current || !fresh(latest)) {
      count.textContent = current ? '等待新数据' : errors[config.key] ? '暂不可用' : '加载中';
      grid.innerHTML = '<div class="dailyfree-empty"><strong>' + (current ? '旧优惠已暂时隐藏' : errors[config.key] ? '暂时无法读取数据' : '正在加载限免目录') + '</strong><p>' + (current ? '超过 7 小时未完成核验，自动重试后恢复展示。可通过下方来源查看商店。' : '数据由后台定时检查，网页会自动读取更新。') + '</p></div>';
      return;
    }
    const apps = (Array.isArray(current.items) ? current.items : []).filter(valid);
    count.textContent = '已核验 ' + apps.length + ' 款 · 展示 ' + Math.min(limit, apps.length) + ' 款';
    if (!apps.length) {
      grid.innerHTML = '<div class="dailyfree-empty"><strong>本轮暂无符合条件的限免</strong><p>未找到可核验的活动不代表全商店没有限免；来源会继续扩展，下一轮自动检查。</p></div>';
      return;
    }
    grid.innerHTML = apps.slice(0, limit).map(card).join('');
    actions.hidden = apps.length <= 12;
    more.hidden = apps.length <= limit;
    more.textContent = '查看更多（剩余 ' + Math.max(0, apps.length - limit) + ' 款） ↓';
    collapse.hidden = limit <= 12;
  }
  tabs.forEach(button => button.addEventListener('click', () => { if (info[button.dataset.dailyRegion]) active = button.dataset.dailyRegion; limit = 12; render(); }));
  more.addEventListener('click', () => { limit += 12; render(); });
  collapse.addEventListener('click', () => { limit = 12; render(); $('daily-free-title')?.scrollIntoView({behavior:'smooth', block:'start'}); });
  async function refresh() {
    if (pending) return;
    pending = true; refreshButton.disabled = true; refreshButton.textContent = '读取中…';
    const results = await Promise.allSettled(Object.entries(files).map(async ([key, file]) => {
      const response = await fetch(file + '?v=' + Date.now(), {cache:'no-store', signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(key);
      const value = await response.json();
      if (value?.schema !== 1) throw new Error('Invalid snapshot');
      data[key] = value;
      return key;
    }));
    Object.keys(files).forEach((key, i) => { errors[key] = results[i].status !== 'fulfilled'; });
    pending = false; refreshButton.disabled = false; refreshButton.textContent = '读取最新数据 ↻';
    render();
  }
  refreshButton.addEventListener('click', refresh);
  refresh();
  window.setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
  window.setInterval(render, 60 * 1000); // Remove expired games even between fetches.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
