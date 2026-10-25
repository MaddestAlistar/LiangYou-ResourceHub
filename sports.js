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
      !section || !languageGroup || !translation || !search || !sortControl) return;

  const storageKey = 'liangyou-sports-lang-v1';
  const tabs = [...section.querySelectorAll('[data-sport-filter]')];
  const langButtons = [...languageGroup.querySelectorAll('[data-sports-lang]')];
  const sourceButtons = [...section.querySelectorAll('[data-source-filter]')];
  const sourceHint = document.getElementById('sportsSourceHint');
  const search = document.getElementById('sportsSearch');
  const sortControl = document.getElementById('sportsSort');
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
  let searchTerms = '';
  let sortMode = 'time';
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
    search.placeholder = labels.searchPlaceholder;
    search.setAttribute('aria-label', labels.searchLabel);
    sortControl.setAttribute('aria-label', labels.sortTime);
    [...sortControl.options].forEach(option => {
      if (labels[option.dataset.sportsT]) option.textContent = labels[option.dataset.sportsT];
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

  // Source-specific detail view; "All" remains compact on small phones.
  const hasNumber = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  function moneyUSD(value) {
    if (!hasNumber(value)) return '';
    const locale = language === 'zh' ? 'zh-CN' : 'en-US';
    return '$' + Intl.NumberFormat(locale, {
      notation: 'compact', maximumFractionDigits: value < 100 ? 2 : 1
    }).format(value);
  }
  function richMarketDetails(event, names) {
    const labels = copy();
    const tokens = [];
    if (Number.isInteger(event.best_of) && [1,3,5,7].includes(event.best_of))
      tokens.push('BO' + event.best_of);
    if (typeof event.competition === 'string' && event.competition.length <= 85) {
      const translated = language === 'zh' && translation.stage
        ? translation.stage(event.competition) : event.competition;
      if (translated) tokens.push(translated);
    }
    const chips = '<div class="sports-rich-tags">' +
      '<span class="sports-rich-tag sports-rich-tag-primary">' + esc(labels.preMatch) + '</span>' +
      tokens.map(v => '<span class="sports-rich-tag">' + esc(v) + '</span>').join('') + '</div>';
    const stats = event.stats && typeof event.stats === 'object' ? event.stats : {};
    const metrics = event.provider === 'kalshi'
      ? [['volume_24h_contracts',labels.volume24hContracts],
         ['volume_total_contracts',labels.volumeTotalContracts],
         ['open_interest_contracts',labels.openInterest]]
      : [['volume_24h_usd',labels.volume24h], ['volume_total_usd',labels.totalVolume],
         ['liquidity_usd',labels.liquidity]];
    const available = metrics.filter(([field]) => hasNumber(stats[field]) && stats[field] > 0);
    const number = value => Intl.NumberFormat(language === 'zh' ? 'zh-CN':'en-US',{
      notation:'compact', maximumFractionDigits:1
    }).format(value);
    const summary = available.length ? '<div class="sports-metrics">' +
      available.map(([field,label]) => '<div class="sports-metric"><span>' +
        esc(label) + '</span><strong>' + esc(event.provider === 'kalshi' ?
          number(stats[field]) + labels.contractSuffix : moneyUSD(stats[field])) +
        '</strong></div>').join('') + '</div>' : '';
    const rows = event.outcomes.map((outcome, index) => {
      const bid = outcome.best_bid, ask = outcome.best_ask;
      if (!hasNumber(bid) || !hasNumber(ask) || bid <= 0 || ask >= 1 || bid > ask)
        return '';
      const sizeText = (size) => hasNumber(size) && size > 0
        ? '<em>' + esc(labels.bookSize) + ' ' + esc(Intl.NumberFormat(
           language === 'zh' ? 'zh-CN' : 'en-US',{maximumFractionDigits:1}).format(size)) + '</em>' : '';
      return '<div class="sports-quote-row"><span class="sports-quote-team">' +
        esc(names[index]) + '</span><span class="sports-quote-number">' +
        '<small>' + esc(labels.bestBid) + '</small><b>' +
        (bid * 100).toFixed(1) + '%</b>' + sizeText(outcome.best_bid_size) +
        '</span><span class="sports-quote-number">' +
        '<small>' + esc(labels.bestAsk) + '</small><b>' +
        (ask * 100).toFixed(1) + '%</b>' + sizeText(outcome.best_ask_size) + '</span></div>';
    }).filter(Boolean);
    const quoteList = rows.length ? rows.join('') :
      '<p class="sports-quote-missing">' + esc(labels.quotesUnavailable) + '</p>';
    const lastPrices = event.provider === 'kalshi' ?
      event.outcomes.map((item,index) => {
        const previous = item.previous_price, last = item.last_price;
        if (!hasNumber(last) || last <= 0 || last >= 1) return '';
        return '<div class="sports-last-price">' + esc(names[index]) + ' · ' +
          esc(labels.lastTrade) + ' ' + (last * 100).toFixed(1) + '%' +
          (hasNumber(previous) && previous > 0 && previous < 1 ?
            ' · ' + esc(labels.vsPrevious) + ' ' +
            ((last-previous)*100 >= 0 ? '+' : '') + ((last-previous)*100).toFixed(1) + 'pp' : '') +
          '</div>';
      }).filter(Boolean).join('') : '';
    const captured = Number.isFinite(Date.parse(event.checked_at))
      ? '<p class="sports-quote-asof">' + esc(labels.asOf) + ' ' + esc(time(event.checked_at)) + '</p>' : '';
    // Even when CLOB is unavailable, the collected market statistics remain available.
    const detail = '<details class="sports-quote-details"><summary>' +
      esc(labels.details) + '<span class="sports-quote-chevron" aria-hidden="true">⌄</span></summary>' +
      '<div class="sports-quote-content">' + quoteList + lastPrices + captured +
      '<p class="sports-quote-note">' + esc(event.provider === 'kalshi' ? labels.kalshiQuoteNote : labels.quoteNote) + '</p></div></details>';
    return {chips, summary, detail};
  }

  function eventCard(event) {
    const labels = copy();
    const names = event.outcomes.map(o => translation.team(o.name, event.category, language));
    const percentages = event.outcomes.map(o => Math.max(0, Math.min(100, Number(o.probability) * 100)));
    const provider = ['predict','kalshi'].includes(event.provider) ? event.provider : 'polymarket';
    const sourcePattern = provider === 'predict'
      ? /^https:\/\/predict\.fun\/market\/[a-z0-9-]+$/i
      : provider === 'kalshi'
        ? /^https:\/\/kalshi\.com\/markets\/[a-z0-9-]+(?:\/[a-z0-9-]+\/[a-z0-9-]+)?$/i
        : /^https:\/\/polymarket\.com\/event\/[a-z0-9-]+$/i;
    const url = typeof event.source_url === 'string' && sourcePattern.test(event.source_url)
      ? event.source_url : '';
    const rich = activeSource !== 'all' && activeSource === provider;
    const title = rich ? names[0] + (language === 'zh' ? ' 对阵 ' : ' vs ') +
      names[names.length - 1] : translation.title(event, language);
    const league = translation.league(event.league, event.category, language);
    const extra = rich ? richMarketDetails(event, names) : {chips:'',summary:'',detail:''};
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
      esc(league || labels.match) + '</span><span>' +
      (event.time_kind === 'market_close' ? esc(labels.marketDeadline) + ' ' : '') + esc(time(event.start_time)) +
      '</span></div><h3 title="' + esc(title) + '">' + esc(title) + '</h3>' +
      extra.chips + prob + track + extra.summary + extra.detail + '<div class="sports-match-bottom"><span>' +
      esc(labels.prediction) + '</span><span class="sports-provider sports-provider-' + provider + '">' +
      (provider === 'predict' ? 'Predict.fun' : provider === 'kalshi' ? 'Kalshi' : 'Polymarket') + '</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="' +
        esc(labels.sourceAria + title) + '">' + esc(labels.source) + '</a>' : '') +
      '</div></article>';
  }

  function searchableText(event) {
    const translate = name => translation.team(name, event.category, language);
    return [event.title,event.league,event.category,event.provider || 'polymarket',
      translation.title(event,language),
      translation.league(event.league,event.category,language),
      translation.ui[language][event.category],
      ...event.outcomes.map(o => o.name),
      ...event.outcomes.map(o => translate(o.name))
    ].join(' ').normalize('NFKC').toLocaleLowerCase();
  }
  function activityRank(events) {
    // Compare normalized ranks WITHIN each venue, not USD volume vs Kalshi contracts.
    const groups = new Map();
    for(const event of events){
      const venue=event.provider || 'polymarket';
      if(!groups.has(venue))groups.set(venue,[]);
      groups.get(venue).push(event);
    }
    const ranks=new Map();
    for(const group of groups.values()){
      const value = event => {
        const stats=event.stats || {};
        return event.provider === 'kalshi'
          ? (stats.volume_24h_contracts || 0)
          : (stats.volume_24h_usd || 0);
      };
      group.sort((a,b) => value(b)-value(a));
      group.forEach((event,index)=>ranks.set(event.id+'|'+(event.provider||'polymarket'),
        group.length>1 ? 1-index/(group.length-1) : 1));
    }
    return ranks;
  }
  function render() {
    const labels = copy();
    if (sourceHint) sourceHint.hidden = activeSource === 'all';
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
      (active === 'all' || (active === 'other' ? ['other','esports'].includes(m.category) : m.category === active)) &&
      (activeSource === 'all' || (m.provider || 'polymarket') === activeSource) &&
      (Number.isFinite(Date.parse(m.start_time)) && Date.parse(m.start_time) > Date.now()) &&
      (!searchTerms || searchTerms.split(/\s+/).every(word => searchableText(m).includes(word)))
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
    let ordered;
    if (sortMode === 'activity') {
      const ranks=activityRank(visible);
      ordered=[...visible].sort((a,b)=>
        (ranks.get(b.id+'|'+(b.provider||'polymarket'))||0)-
        (ranks.get(a.id+'|'+(a.provider||'polymarket'))||0) ||
        Date.parse(a.start_time)-Date.parse(b.start_time));
    } else {
      ordered = active === 'all' ? arrange(visible) : [...visible].sort((a,b)=>
        Date.parse(a.start_time)-Date.parse(b.start_time));
    }
    const display = ordered.slice(0, visibleLimit);
    count.textContent = labels.total(visible.length) +
      (visible.length ? ' · ' + labels.current(display.length) : '');
    if (!visible.length) {
      grid.innerHTML = '<div class="sports-empty"><strong>' + esc(labels.emptyTitle) +
        '</strong>' + esc(searchTerms ? labels.noSearchResults : labels.emptyMessage) + '</div>';
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

  search.addEventListener('input', () => {
    searchTerms=search.value.trim().normalize('NFKC').toLocaleLowerCase().slice(0,90);
    visibleLimit=initialLimit();
    render(); // purely local; never calls a market API
  });
  sortControl.addEventListener('change', () => {
    sortMode=sortControl.value === 'activity' ? 'activity' : 'time';
    visibleLimit=initialLimit();
    render();
  });
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
    {url:'./data/predict-sports.json', provider:'predict'},
    {url:'./data/kalshi-sports.json', provider:'kalshi'}
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
      // Keep all providers, retaining independent prices for source-specific views.
      matches = good.flatMap(x => x.events).sort((a,b) =>
        Number(b.provider === 'predict') - Number(a.provider === 'predict'));
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
