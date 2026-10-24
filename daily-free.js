/* The daily-free section reads a local JSON snapshot. No visitor-side APIs. */
(() => {
  const grid = document.getElementById("dailyFreeGrid");
  const updated = document.getElementById("dailyFreeUpdated");
  const count = document.getElementById("dailyFreeCount");
  const toggles = [...document.querySelectorAll("[data-daily-region]")];
  if (!grid || !updated || !count || !toggles.length) return;
  let region = "cn";
  let payload = null;

  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const formatDate = iso => {
    if (!iso || Number.isNaN(Date.parse(iso))) return "尚未同步";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(iso)) + "（北京时间）";
  };
  const isFresh = iso => {
    const ts = Date.parse(iso || "");
    return Number.isFinite(ts) && ts <= Date.now() + 3600000 && Date.now() - ts <= 15 * 3600000;
  };
  const isValid = app => app && Number.isInteger(app.id) && app.id > 0 && app.price === 0 &&
    app.country === region && typeof app.name === "string" && app.name.length > 0;
  const fallback = '<span class="dailyfree-icon-fallback" aria-hidden="true">✦</span>';

  function render() {
    toggles.forEach(button => {
      const active = button.dataset.dailyRegion === region;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const current = payload?.regions?.[region];
    const time = current?.verified_at;
    updated.textContent = time ? "价格核验 · " + formatDate(time) : "等待首次自动同步";
    const items = Array.isArray(current?.items) ? current.items.filter(isValid).slice(0, 10) : [];
    if (!isFresh(time)) {
      count.textContent = "暂不展示未核实价格";
      grid.innerHTML = '<div class="dailyfree-empty"><span aria-hidden="true">⌁</span><strong>正在等待有效的限免数据</strong><p>首次同步可能需要一点时间。若上游数据暂时不可用，将自动隐藏未验证或已过期的信息。</p></div>';
      return;
    }
    count.textContent = "已核验 " + items.length + " / 10 款限免";
    if (!items.length) {
      grid.innerHTML = '<div class="dailyfree-empty"><span aria-hidden="true">✧</span><strong>本区暂无限免上榜</strong><p>目前没有通过商店价格校验的本体限免，系统会在下一次同步时继续查询。</p></div>';
      return;
    }
    grid.innerHTML = items.map(app => {
      const icon = typeof app.icon === "string" && /^\.\/assets\/daily-free\/[a-z0-9-]+\.(jpg|png|webp)$/.test(app.icon)
        ? '<img src="' + escapeHTML(app.icon) + '" alt="" width="72" height="72" loading="lazy" decoding="async" onerror="this.hidden=true">' : fallback;
      const original = typeof app.original_price === "string" ? app.original_price : "";
      const platform = app.platform === "macOS" ? "Mac" : "iPhone / iPad";
      return '<a class="dailyfree-card" href="https://apps.apple.com/' + region + '/app/id' + app.id +
        '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHTML(app.name) + ' App Store 领取">' +
        '<span class="dailyfree-card-sheen" aria-hidden="true"></span>' +
        '<span class="dailyfree-card-top"><span class="dailyfree-icon">' + icon + '</span><span class="dailyfree-free-tag">限时 0 元</span></span>' +
        '<span class="dailyfree-card-name">' + escapeHTML(app.name) + '</span>' +
        '<span class="dailyfree-card-sub">' + escapeHTML(app.genre || "App Store 软件") + ' <span aria-hidden="true">·</span> ' + platform + '</span>' +
        '<span class="dailyfree-card-bottom"><span class="dailyfree-price"><del>' + escapeHTML(original) + '</del><strong>' + (region === "cn" ? "¥0" : "$0") +
        '</strong></span><span class="dailyfree-go">去领取 <span aria-hidden="true">↗</span></span></span></a>';
    }).join("");
  }

  toggles.forEach(button => button.addEventListener("click", () => {
    region = button.dataset.dailyRegion === "us" ? "us" : "cn";
    render();
  }));

  fetch("./data/daily-free.json", { cache: "no-cache" })
    .then(response => { if (!response.ok) throw new Error("Snapshot unavailable"); return response.json(); })
    .then(data => { if (!data || data.schema !== 1 || !data.regions) throw new Error("Invalid snapshot"); payload = data; render(); })
    .catch(() => {
      updated.textContent = "同步状态不可用";
      count.textContent = "未能加载";
      grid.innerHTML = '<div class="dailyfree-empty"><strong>限免列表暂时不可用</strong><p>数据同步遇到问题，请稍后刷新页面。本站不会展示未经核验的旧优惠。</p></div>';
    });
})();
