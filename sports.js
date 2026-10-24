(() => {
  'use strict';
  const grid = document.getElementById('sportsGrid');
  const status = document.getElementById('sportsStatus');
  const count = document.getElementById('sportsCount');
  const actions = document.getElementById('sportsListActions');
  const more = document.getElementById('sportsMore');
  const collapse = document.getElementById('sportsCollapse');
  const showing = document.getElementById('sportsShowing');
  if (!grid || !status || !count || !actions || !more || !collapse || !showing) return;

  const tabs = [...document.querySelectorAll('[data-sport-filter]')];
  const sections = ['lol', 'basketball', 'football', 'esports', 'other'];
  const initialLimit = () => window.matchMedia('(max-width: 760px)').matches ? 4 : 6;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const time = value => {
    if (!value) return '时间待确认';
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) + ' 北京时间'
      : '时间待确认';
  };

  let matches = [];
  let active = 'all';
  let visibleLimit = initialLimit();

  // Round-robin means the first four mobile cards show different popular
  // categories rather than four LoL cards and no football/NBA.
  function arrange(events) {
    if (active !== 'all') return events;
    const grouped = sections.map(category => events.filter(e => e.category === category));
    const result = [];
    const longest = Math.max(0, ...grouped.map(group => group.length));
    for (let i = 0; i < longest; i++) {
      for (const group of grouped) if (group[i]) result.push(group[i]);
    }
    return result;
  }

  function eventCard(event) {
    const [left, right] = event.outcomes;
    const p = Math.max(0, Math.min(100, Number(left.probability) * 100));
    const q = Math.max(0, Math.min(100, Number(right.probability) * 100));
    const url = typeof event.source_url === 'string' && /^https:\/\/polymarket\.com\/event\/[a-z0-9-]+$/i.test(event.source_url)
      ? event.source_url : '';
    const prob = event.outcomes.length === 3
      ? '<div class="sports-three">' + event.outcomes.map(o => '<div class="sports-side"><span>' + esc(o.name) + '</span><b>' + Math.max(0, Math.min(100, Number(o.probability) * 100)).toFixed(0) + '%</b></div>').join('') + '</div>'
      : '<div class="sports-prob"><div class="sports-side"><span>' + esc(left.name) + '</span><b>' + p.toFixed(0) + '%</b></div><span class="sports-versus">VS</span><div class="sports-side right"><span>' + esc(right.name) + '</span><b>' + q.toFixed(0) + '%</b></div></div>';

    const total = event.outcomes.reduce((sum, o) => sum + Number(o.probability), 0) || 1;
    const bar = event.outcomes.length === 3
      ? '<div class="sports-track sports-track-three" aria-label="主胜、平局、客胜预测概率">' + event.outcomes.map(o => '<i style="width:' + (Math.max(0, Number(o.probability)) / total * 100).toFixed(2) + '%"></i>').join('') + '</div>'
      : '<div class="sports-track" aria-label="双方预测概率"><i style="width:' + p.toFixed(1) + '%"></i></div>';

    return '<article class="sports-match">' +
      '<div class="sports-match-top"><span>' + esc(event.league || '赛事') + '</span><span>' + esc(time(event.start_time)) + '</span></div>' +
      '<h3 title="' + esc(event.title) + '">' + esc(event.title) + '</h3>' + prob + bar +
      '<div class="sports-match-bottom"><span>市场隐含概率 · Polymarket</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="打开' + esc(event.title) + '数据来源">数据来源 ↗</a>' : '') +
      '</div></article>';
  }

  function render() {
    const filtered = matches.filter(m =>
      (active === 'all' || m.category === active) &&
      (!m.start_time || Date.parse(m.start_time) > Date.now())
    );
    const ordered = arrange(filtered);
    const display = ordered.slice(0, visibleLimit);
    count.textContent = '收录 ' + filtered.length + ' 场' + (filtered.length ? ' · 当前显示 ' + display.length + ' 场' : '');
    if (!filtered.length) {
      grid.innerHTML = '<div class="sports-empty"><strong>当前暂无可展示的赛事</strong>赛事尚未开始或公开市场暂无有效数据。新数据会定时同步。</div>';
      actions.hidden = true;
      return;
    }

    grid.innerHTML = display.map(eventCard).join('');
    const hasMore = ordered.length > display.length;
    const expanded = visibleLimit > initialLimit();
    actions.hidden = !hasMore && !expanded;
    showing.textContent = '已显示 ' + display.length + ' / ' + ordered.length + ' 场';
    more.hidden = !hasMore;
    more.textContent = '再看 ' + Math.min(ordered.length - display.length, initialLimit()) + ' 场 ↓';
    collapse.hidden = !expanded;
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

  more.addEventListener('click', () => {
    visibleLimit += initialLimit();
    render();
  });
  collapse.addEventListener('click', () => {
    visibleLimit = initialLimit();
    render();
    document.getElementById('sports-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

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
      const updated = data.generated_at ? new Date(data.generated_at) : null;
      const age = updated ? Date.now() - updated.getTime() : Infinity;
      status.textContent = updated && Number.isFinite(age)
        ? '上次同步：' + time(data.generated_at) + (age > 6 * 3600000 ? ' · 同步可能延迟' : '')
        : '等待首次同步';
      if (updated && age > 12 * 3600000) {
        matches = [];
        status.textContent = '上次同步：' + time(data.generated_at) + ' · 数据已过期';
      }
      render();
    })
    .catch(() => {
      actions.hidden = true;
      count.textContent = '同步失败';
      status.textContent = '同步数据暂不可用';
      grid.innerHTML = '<div class="sports-empty"><strong>赛事数据暂不可用</strong>请稍后刷新。本栏目不会展示未经验证的赔率。</div>';
    });
})();