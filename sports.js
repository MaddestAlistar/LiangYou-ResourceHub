(() => {
  'use strict';
  const grid = document.getElementById('sportsGrid');
  const status = document.getElementById('sportsStatus');
  const count = document.getElementById('sportsCount');
  const actions = document.getElementById('sportsListActions');
  const more = document.getElementById('sportsMore');
  const collapse = document.getElementById('sportsCollapse');
  const showing = document.getElementById('sportsShowing');
  const section = document.getElementById('sports');
  const languageGroup = document.getElementById('sportsLanguage');
  const translation = window.LiangYouSportsI18n;
  if (!grid || !status || !count || !actions || !more || !collapse || !showing ||
      !section || !languageGroup || !translation) return;

  const storageKey = 'liangyou-sports-lang-v1';
  const tabs = [...section.querySelectorAll('[data-sport-filter]')];
  const langButtons = [...languageGroup.querySelectorAll('[data-sports-lang]')];
  const sourceButtons = [...section.querySelectorAll('[data-source-filter]')];
  const sourceHint = document.getElementById('sportsSourceHint');
  const sections = ['lol', 'basketball', 'football', 'esports', 'other'];
  const initialLimit = () => window.matchMedia('(max-width: 760px)').matches ? 4 : 6;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  let language = 'zh';
  try {
    if (localStorage.getItem(storageKey) === 'en') language = 'en';
  } catch { /* Private browsing can prevent storage, but the toggle still works. */ }

  let matches = [];
  let active = 'all';
  let activeSource = 'all';
  let visibleLimit = initialLimit();
  let lastUpdated = null;
  let failed = false;
  let refreshPending = false;
  let sourcePartial = false;
  const copy = () => translation.ui[language];

  function time(value) {
    if (!value) return copy().timeUnknown;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return copy().timeUnknown;
    const locale = language === 'zh' ? 'zh-CN' : 'en-GB';
    const formatted = date.toLocaleString(locale, {
      timeZone: 'Asia/Shanghai',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    return formatted + ' ' + copy().timezone;
  }

  function updateStatus() {
    if (failed) {
      status.textContent = copy().unavailable;
      count.textContent = copy().failed;
      return;
    }
    if (!lastUpdated) {
      status.textContent = copy().pending;
      return;
    }
    const age = Date.now() - lastUpdated.getTime();
    status.textContent = copy().updated(time(lastUpdated.toISOString())) +
      (age > 6 * 3600000 ? ' · ' + copy().expired
        : age > 3 * 3600000 || sourcePartial ? ' · ' + copy().delayed : '');
  }

  function renderStatic() {
    const labels = copy();
    section.lang = language === 'zh' ? 'zh-CN' : 'en';
    section.querySelectorAll('[data-sports-t]').forEach(node => {
      const key = node.dataset.sportsT;
      if (typeof labels[key] === 'string') node.textContent = labels[key];
    });
    tabs.forEach(button => {
      const value = button.dataset.sportFilter;
      if (typeof labels[value] === 'string') button.textContent = labels[value];
    });
    sourceButtons.forEach(button => {
      const key = button.dataset.sportsT;
      if (key && typeof labels[key] === 'string') button.textContent = labels[key];
    });
    langButtons.forEach(button => {
      const selected = button.dataset.sportsLang === language;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });
    languageGroup.setAttribute('aria-label',
      language === 'zh' ? '切换赛事语言' : 'Select sports display language');
    updateStatus();
  }

  // Mix categories in the first few cards so one league never occupies the
  // whole first screen on phones. The filtered tabs keep original ordering.
  function arrange(events) {
    if (active !== 'all') return events;
    const groups = sections.map(category => events.filter(e => e.category === category));
    const result = [];
    const longest = Math.max(0, ...groups.map(group => group.length));
    for (let i = 0; i < longest; i++) for (const group of groups) {
      if (group[i]) result.push(group[i]);
    }
    return result;
  }

  // Predict.fun has event metadata and outcome-level bid/ask quotes.
  // Expand this only in the explicit Predict.fun tab to keep the main grid short.
  function richPredictDetails(event, names) {
    const labels = copy();
    const tokens = [];
    if (Number.isInteger(event.best_of) && [1, 3, 5, 7].includes(event.best_of))
      tokens.push('BO' + event.best_of);
    if (typeof event.competition === 'string' && event.competition.length <= 85) {
      const translated = language === 'zh' && translation.stage
        ? translation.stage(event.competition) : event.competition;
      tokens.push(translated);
    }
    const chips = '<div class="sports-rich-tags">' +
      '<span class="sports-rich-tag sports-rich-tag-primary">' + esc(labels.preMatch) + '</span>' +
      tokens.map(v => '<span class="sports-rich-tag">' + esc(v) + '</span>').join('') +
      '</div>';
    const quotes = event.outcomes.map((outcome, index) => {
      const bid = outcome.best_bid, ask = outcome.best_ask;
      if (typeof bid !== 'number' || typeof ask !== 'number' ||
          !Number.isFinite(bid) || !Number.isFinite(ask) ||
          bid < 0 || ask > 1 || bid > ask) return '';
      return '<div class="sports-quote-row"><span class="sports-quote-team">' +
        esc(names[index]) + '</span><span class="sports-quote-number">' +
        '<small>' + esc(labels.bestBid) + '</small><b>' + (bid * 100).toFixed(1) +
        '%</b></span><span class="sports-quote-number">' +
        '<small>' + esc(labels.bestAsk) + '</small><b>' + (ask * 100).toFixed(1) +
        '%</b></span></div>';
    }).filter(Boolean);
    const captured = Number.isFinite(Date.parse(event.checked_at))
      ? '<p class="sports-quote-asof">' + esc(labels.asOf) + ' ' + esc(time(event.checked_at)) + '</p>' : '';
    const detail = quotes.length === event.outcomes.length && quotes.length >= 2
      ? '<details class="sports-quote-details"><summary>' + esc(labels.details) +
        '<span class="sports-quote-chevron" aria-hidden="true">⌄</span></summary>' +
        '<div class="sports-quote-content">' + quotes.join('') + captured +
        '<p class="sports-quote-note">' + esc(labels.quoteNote) + '</p></div></details>'
      : captured;
    return chips + detail;
  }

  function eventCard(event) {
    const labels = copy();
    const names = event.outcomes.map(o => translation.team(o.name, event.category, language));
    const percentages = event.outcomes.map(o => Math.max(0, Math.min(100, Number(o.probability) * 100)));
    const provider = event.provider === 'predict' ? 'predict' : 'polymarket';
    const url = typeof event.source_url === 'string' &&
      (provider === 'predict' ? /^https:\/\/predict\.fun\/market\/[a-z0-9-]+$/i : /^https:\/\/polymarket\.com\/event\/[a-z0-9-]+$/i).test(event.source_url)
      ? event.source_url : '';
    const rich = provider === 'predict' && activeSource === 'predict';
    const title = rich ? names[0] + (language === 'zh' ? ' 对阵 ' : ' vs ') +
      names[names.length - 1] : translation.title(event, language);
    const league = translation.league(event.league, event.category, language);
    const prob = event.outcomes.length === 3
      ? '<div class="sports-three">' + names.map((name, i) =>
          '<div class="sports-side"><span>' + esc(name) + '</span><b>' +
          percentages[i].toFixed(1) + '%</b></div>').join('') + '</div>'
      : '<div class="sports-prob"><div class="sports-side"><span>' + esc(names[0]) +
          '</span><b>' + percentages[0].toFixed(1) +
          '%</b></div><span class="sports-versus">VS</span><div class="sports-side right"><span>' +
          esc(names[1]) + '</span><b>' + percentages[1].toFixed(1) + '%</b></div></div>';

    const total = event.outcomes.reduce((sum, o) => sum + Number(o.probability), 0) || 1;
    const track = event.outcomes.length === 3
      ? '<div class="sports-track sports-track-three" aria-label="' +
          esc(language === 'zh' ? '主胜、平局、客胜的市场概率' : 'Home win, draw and away win market probabilities') +
          '">' + event.outcomes.map(o => '<i style="width:' +
          (Math.max(0, Number(o.probability)) / total * 100).toFixed(2) + '%"></i>').join('') + '</div>'
      : '<div class="sports-track" aria-label="' +
          esc(language === 'zh' ? '双方市场概率' : 'Two-outcome market probabilities') +
          '"><i style="width:' + percentages[0].toFixed(1) + '%"></i></div>';

    return '<article class="sports-match' + (rich ? ' sports-match-rich' : '') + '"><div class="sports-match-top"><span>' +
      esc(league || labels.match) + '</span><span>' + esc(time(event.start_time)) +
      '</span></div><h3 title="' + esc(title) + '">' + esc(title) + '</h3>' +
      (rich ? richPredictDetails(event, names) : '') +
      prob + track + '<div class="sports-match-bottom"><span>' +
      esc(labels.prediction) + '</span><span class="sports-provider sports-provider-' + provider + '">' +
      (provider === 'predict' ? 'Predict.fun' : 'Polymarket') + '</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="' +
        esc(labels.sourceAria + title) + '">' + esc(labels.source) + '</a>' : '') +
      '</div></article>';
  }

  function render() {
    const labels = copy();
    if (sourceHint) sourceHint.hidden = activeSource !== 'predict';
    if (failed) {
      count.textContent = labels.failed;
      grid.innerHTML = '<div class="sports-empty"><strong>' + esc(labels.unavailableTitle) +
        '</strong>' + esc(labels.unavailableMessage) + '</div>';
      actions.hidden = true;
      updateStatus();
      return;
    }
    const age = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
    if (!Number.isFinite(age) || age > 6 * 3600000 || age < -3600000) {
      count.textContent = labels.expired;
      grid.innerHTML = '<div class="sports-empty"><strong>' + esc(labels.expired) + '</strong>' + esc(labels.staleMessage) + '</div>';
      actions.hidden = true;
      updateStatus();
      return;
    }
    const filtered = matches.filter(m =>
      (active === 'all' || m.category === active) &&
      (activeSource === 'all' || (m.provider || 'polymarket') === activeSource) &&
      (Number.isFinite(Date.parse(m.start_time)) && Date.parse(m.start_time) > Date.now())
    );
    let visible = filtered;
    if (activeSource === 'all') {
      const seen = new Set();
      const canonical = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
      visible = filtered.filter(event => {
        const key = [event.category, Math.round(Date.parse(event.start_time) / 3600000),
          ...event.outcomes.map(x => canonical(x.name)).sort()].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    const ordered = arrange(visible);
    const display = ordered.slice(0, visibleLimit);
    count.textContent = labels.total(visible.length) +
      (visible.length ? ' · ' + labels.current(display.length) : '');
    if (!visible.length) {
      grid.innerHTML = '<div class="sports-empty"><strong>' + esc(labels.emptyTitle) +
        '</strong>' + esc(labels.emptyMessage) + '</div>';
      actions.hidden = true;
      return;
    }
    grid.innerHTML = display.map(eventCard).join('');
    const hasMore = ordered.length > display.length;
    const expanded = visibleLimit > initialLimit();
    actions.hidden = !hasMore && !expanded;
    showing.textContent = labels.shown(display.length, ordered.length);
    more.hidden = !hasMore;
    more.textContent = labels.more(Math.min(ordered.length - display.length, initialLimit()));
    collapse.hidden = !expanded;
    collapse.textContent = labels.collapse;
  }

  tabs.forEach(button => button.addEventListener('click', () => {
    active = button.dataset.sportFilter;
    visibleLimit = initialLimit();
    tabs.forEach(tab => {
      const selected = tab === button;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
    render();
  }));
  sourceButtons.forEach(button => button.addEventListener('click', () => {
    activeSource = button.dataset.sourceFilter;
    visibleLimit = initialLimit();
    sourceButtons.forEach(tab => {
      const selected = tab === button;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
    renderStatic();
    render();
  }));
  langButtons.forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.sportsLang;
    if (next !== 'zh' && next !== 'en') return;
    language = next;
    try { localStorage.setItem(storageKey, next); } catch { /* Optional preference */ }
    renderStatic();
    render();
  }));

  more.addEventListener('click', () => { visibleLimit += initialLimit(); render(); });
  collapse.addEventListener('click', () => {
    visibleLimit = initialLimit();
    render();
    document.getElementById('sports-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const feeds = [
    {url:'./data/sports.json', provider:'polymarket'},
    {url:'./data/predict-sports.json', provider:'predict'}
  ];
  function verifiedFeed(data, provider) {
    if (data.schema !== 1 || data.source_type !== 'prediction_market' || !Array.isArray(data.events)) return null;
    const timestamp = Date.parse(data.generated_at);
    if (!Number.isFinite(timestamp) || timestamp > Date.now() + 3600000 ||
        Date.now() - timestamp > 6 * 3600000) return null;
    return {
      provider, timestamp, partial:data.status !== 'ok',
      events: data.events.filter(event =>
        event && event.verification === 'open_match_winner_market' &&
        Array.isArray(event.outcomes) && [2,3].includes(event.outcomes.length) &&
        Number.isFinite(Date.parse(event.start_time)) &&
        event.outcomes.every(o => o.name && o.market_id && typeof o.probability === 'number' &&
          Number.isFinite(o.probability) && o.probability >= 0 && o.probability <= 1)
      ).map(event => ({...event, provider}))
    };
  }
  async function refresh() {
    if (refreshPending) return;
    refreshPending = true;
    try {
      const requests = await Promise.allSettled(feeds.map(async feed => {
        const response = await fetch(feed.url + '?v=' + Date.now(), {
          cache:'no-store', signal:AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error('feed unavailable');
        return verifiedFeed(await response.json(), feed.provider);
      }));
      const good = requests.filter(x => x.status === 'fulfilled' && x.value).map(x => x.value);
      if (!good.length) throw new Error('no fresh sources');
      // Merge without hiding the other market: each filter reveals its own prices.
      // In "All", cross-venue duplicates are kept only when their normalized
      // opponent names and kick-off times are clearly identical.
      const all = good.flatMap(x => x.events).sort((a,b) =>
        Number(b.provider === 'predict') - Number(a.provider === 'predict'));
      const unique = new Map();
      const canonical = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
      for (const event of all) {
        const teams = event.outcomes.map(o => canonical(o.name)).sort();
        const key = [event.category, Math.round(Date.parse(event.start_time)/3600000), ...teams].join('|');
        const prior = unique.get(key);
        if (!prior) unique.set(key, event);
        // Keep a second source record for explicit source filtering.
      }
      // This single array is used for both "All" and per-source views; when
      // All is selected, render() de-duplicates while retaining source filters.
      matches = all;
      lastUpdated = new Date(Math.max(...good.map(x => x.timestamp)));
      sourcePartial = good.length !== feeds.length || good.some(x => x.partial);
      failed = false;
    } catch {
      failed = !lastUpdated;
      sourcePartial = true;
    } finally {
      refreshPending = false;
      updateStatus();
      render();
    }
  }
  renderStatic();
  refresh();
  window.setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
  window.setInterval(() => { updateStatus(); render(); }, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
