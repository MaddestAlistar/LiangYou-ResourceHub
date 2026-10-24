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
  let visibleLimit = initialLimit();
  let lastUpdated = null;
  let failed = false;
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
      (age > 12 * 3600000 ? ' · ' + copy().expired
        : age > 6 * 3600000 ? ' · ' + copy().delayed : '');
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

  function eventCard(event) {
    const labels = copy();
    const names = event.outcomes.map(o => translation.team(o.name, event.category, language));
    const percentages = event.outcomes.map(o => Math.max(0, Math.min(100, Number(o.probability) * 100)));
    const url = typeof event.source_url === 'string' &&
      /^https:\/\/polymarket\.com\/event\/[a-z0-9-]+$/i.test(event.source_url) ? event.source_url : '';
    const title = translation.title(event, language);
    const league = translation.league(event.league, event.category, language);
    const prob = event.outcomes.length === 3
      ? '<div class="sports-three">' + names.map((name, i) =>
          '<div class="sports-side"><span>' + esc(name) + '</span><b>' +
          percentages[i].toFixed(0) + '%</b></div>').join('') + '</div>'
      : '<div class="sports-prob"><div class="sports-side"><span>' + esc(names[0]) +
          '</span><b>' + percentages[0].toFixed(0) +
          '%</b></div><span class="sports-versus">VS</span><div class="sports-side right"><span>' +
          esc(names[1]) + '</span><b>' + percentages[1].toFixed(0) + '%</b></div></div>';

    const total = event.outcomes.reduce((sum, o) => sum + Number(o.probability), 0) || 1;
    const track = event.outcomes.length === 3
      ? '<div class="sports-track sports-track-three" aria-label="' +
          esc(language === 'zh' ? '主胜、平局、客胜的市场概率' : 'Home win, draw and away win market probabilities') +
          '">' + event.outcomes.map(o => '<i style="width:' +
          (Math.max(0, Number(o.probability)) / total * 100).toFixed(2) + '%"></i>').join('') + '</div>'
      : '<div class="sports-track" aria-label="' +
          esc(language === 'zh' ? '双方市场概率' : 'Two-outcome market probabilities') +
          '"><i style="width:' + percentages[0].toFixed(1) + '%"></i></div>';

    return '<article class="sports-match"><div class="sports-match-top"><span>' +
      esc(league || labels.match) + '</span><span>' + esc(time(event.start_time)) +
      '</span></div><h3 title="' + esc(title) + '">' + esc(title) + '</h3>' +
      prob + track + '<div class="sports-match-bottom"><span>' +
      esc(labels.prediction) + '</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="' +
        esc(labels.sourceAria + title) + '">' + esc(labels.source) + '</a>' : '') +
      '</div></article>';
  }

  function render() {
    const labels = copy();
    if (failed) {
      count.textContent = labels.failed;
      grid.innerHTML = '<div class="sports-empty"><strong>' + esc(labels.unavailableTitle) +
        '</strong>' + esc(labels.unavailableMessage) + '</div>';
      actions.hidden = true;
      updateStatus();
      return;
    }
    const filtered = matches.filter(m =>
      (active === 'all' || m.category === active) &&
      (!m.start_time || Date.parse(m.start_time) > Date.now())
    );
    const ordered = arrange(filtered);
    const display = ordered.slice(0, visibleLimit);
    count.textContent = labels.total(filtered.length) +
      (filtered.length ? ' · ' + labels.current(display.length) : '');
    if (!filtered.length) {
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

  renderStatic();
  fetch('./data/sports.json?d=' + Math.floor(Date.now() / 120000), { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('sports data unavailable');
      return response.json();
    })
    .then(data => {
      if (data.schema !== 1 || !Array.isArray(data.events)) throw new Error('invalid sports data');
      matches = data.events.filter(event =>
        event && Array.isArray(event.outcomes) &&
        [2, 3].includes(event.outcomes.length) &&
        event.outcomes.every(o => o.name && Number.isFinite(Number(o.probability)))
      );
      lastUpdated = data.generated_at ? new Date(data.generated_at) : null;
      const age = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
      if (!lastUpdated || !Number.isFinite(age) || age > 12 * 3600000) matches = [];
      updateStatus();
      render();
    })
    .catch(() => {
      failed = true;
      render();
    });
})();