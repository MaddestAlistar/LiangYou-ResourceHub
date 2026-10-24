/* Three-platform daily-free showcase. All data is served as local, cached JSON. */
(() => {
  const grid = document.getElementById("dailyFreeGrid");
  const updated = document.getElementById("dailyFreeUpdated");
  const count = document.getElementById("dailyFreeCount");
  const disclaimer = document.getElementById("dailyFreeDisclaimer");
  const sourceLink = document.getElementById("dailyFreeSource");
  const tabs = [...document.querySelectorAll("[data-daily-region]")];
  if (!grid || !updated || !count || !disclaimer || !sourceLink || !tabs.length) return;

  let active = "cn";
  let apple = null;
  let android = null;
  let appleError = false;
  let androidError = false;

  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const formatDate = iso => {
    if (!iso || Number.isNaN(Date.parse(iso))) return "等待同步";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(iso)) + "（北京时间）";
  };
  const isFresh = iso => {
    const ts = Date.parse(iso || "");
    return Number.isFinite(ts) && ts <= Date.now() + 3600000 && Date.now() - ts <= 7 * 3600000;
  };
  const isApple = item => item && Number.isInteger(item.id) && item.id > 0
    && item.price === 0 && item.country === active && typeof item.name === "string"
    && item.verification === "current_apple_price_and_recent_dated_drop";
  const isAndroid = item => item && typeof item.package === "string"
    && /^[a-zA-Z][\w]*(?:\.[\w]+)+$/.test(item.package) && item.package.length <= 160
    && item.price === 0 && item.country === "us" && item.source === "AppSales"
    && typeof item.name === "string" && item.name.length > 0;

  const iconHTML = (item, androidMode) => {
    const prefix = androidMode ? "android-free" : "daily-free";
    const icon = item.icon;
    const safeIcon = typeof icon === "string" && (
      androidMode
        ? /^\.\/assets\/android-free\/[a-zA-Z][\w.-]*\.(jpg|png|webp)$/.test(icon) && !icon.includes("..")
        : /^\.\/assets\/daily-free\/[a-z0-9-]+\.(jpg|png|webp)$/.test(icon)
    );
    return safeIcon
      ? '<img src="' + escapeHTML(icon) + '" alt="" width="72" height="72" loading="lazy" decoding="async" onerror="this.hidden=true">'
      : '<span class="dailyfree-icon-fallback" aria-hidden="true">' + (androidMode ? "▶" : "✦") + "</span>";
  };

  function render() {
    const androidMode = active === "android";
    tabs.forEach(button => {
      const chosen = button.dataset.dailyRegion === active;
      button.classList.toggle("is-active", chosen);
      button.setAttribute("aria-pressed", String(chosen));
    });

    disclaimer.textContent = androidMode
      ? "安卓价格来自 AppSales 第三方限免追踪，尚未经过 Google Play 官方即时售价核验，可能出现已经恢复收费、仅特定账号免费或数据延迟；请在购买页面确认显示为免费后领取。不提供 APK 下载。"
      : "只展示有近期降价日期记录、且经 Apple 当前地区价格接口核对为 0 元的 App；不保证应用内全部功能免费。限免可能随时结束，实际以商店结算页为准。";
    sourceLink.textContent = androidMode
      ? "安卓：AppSales 追踪来源 ↗"
      : active === "cn" ? "国区：Mergeek 限免来源 ↗" : "美区：AppStore-Discounts 来源 ↗";
    sourceLink.href = androidMode
      ? "https://www.app-sales.net/nowfree/"
      : active === "cn" ? "https://mergeek.com/free/apps" : "https://appstore-discounts.com/en/free";

    const current = androidMode ? android : apple?.regions?.[active];
    const latest = androidMode ? current?.checked_at : current?.verified_at;
    const error = androidMode ? androidError : appleError;
    updated.textContent = latest
      ? (androidMode ? "追踪同步 · " : "价格核验 · ") + formatDate(latest)
      : error ? "数据暂不可用" : "等待首次同步";

    if (error && !current) {
      count.textContent = "暂不可用";
      grid.innerHTML = '<div class="dailyfree-empty"><strong>暂时无法加载限免数据</strong><p>上游网站或同步任务可能遇到问题，恢复后会自动显示最新列表。</p></div>';
      return;
    }
    if (!current) {
      count.textContent = "加载中";
      grid.innerHTML = '<div class="dailyfree-empty"><strong>正在读取限免目录…</strong><p>列表由 GitHub Actions 自动生成，不需要手动刷新数据。</p></div>';
      return;
    }
    if (!isFresh(latest)) {
      count.textContent = "数据等待更新";
      grid.innerHTML = '<div class="dailyfree-empty"><strong>正在等待最新的限免信息</strong><p>同步数据超过安全展示期限，旧优惠已隐藏，避免误导领取。</p></div>';
      return;
    }

    const raw = androidMode ? current.items : current.items;
    const apps = Array.isArray(raw) ? raw.filter(androidMode ? isAndroid : isApple).slice(0, 12) : [];
    count.textContent = (androidMode ? "追踪候选 " : "双重核验 ") + apps.length + " / 12 款";
    if (!apps.length) {
      grid.innerHTML = '<div class="dailyfree-empty"><span aria-hidden="true">✧</span><strong>目前没有符合条件的限免</strong><p>只有有真实付费转免费记录的软件才会上榜，下一轮会自动重新查询。</p></div>';
      return;
    }
    grid.innerHTML = apps.map(item => {
      const path = androidMode
        ? "https://play.google.com/store/apps/details?id=" + encodeURIComponent(item.package) + "&hl=en_US&gl=US"
        : "https://apps.apple.com/" + active + "/app/id" + item.id;
      const platform = androidMode ? "Android / Google Play" : item.platform === "macOS" ? "Mac" : "iPhone / iPad";
      const freeText = androidMode ? "$0" : active === "cn" ? "¥0" : "$0";
      const tag = androidMode ? "第三方追踪价" : "近期付费转免";
      const genre = androidMode ? "Google Play 美区" : String(item.genre || "App Store 软件");
      return '<a class="dailyfree-card' + (androidMode ? ' dailyfree-android-card' : '') +
        '" href="' + escapeHTML(path) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHTML(item.name) +
        (androidMode ? " 前往 Google Play 核对价格" : " App Store 领取") + '">' +
        '<span class="dailyfree-card-sheen" aria-hidden="true"></span>' +
        '<span class="dailyfree-card-top"><span class="dailyfree-icon">' + iconHTML(item, androidMode) +
        '</span><span class="dailyfree-free-tag">' + tag + '</span></span>' +
        '<span class="dailyfree-card-name">' + escapeHTML(item.name) + '</span>' +
        '<span class="dailyfree-card-sub">' + escapeHTML(genre) + ' <span aria-hidden="true">·</span> ' + platform +
        (androidMode ? ' · AppSales 追踪未核实' : ' · ' + escapeHTML(item.source || "限免记录") + ' / Apple 现价核验') + '</span>' +
        '<span class="dailyfree-card-bottom"><span class="dailyfree-price"><del>' +
        escapeHTML(typeof item.original_price === "string" ? item.original_price : "") +
        '</del><strong>' + freeText + '</strong></span><span class="dailyfree-go">' +
        (androidMode ? "查看商店" : "去领取") + ' <span aria-hidden="true">↗</span></span></span></a>';
    }).join("");
  }

  tabs.forEach(button => button.addEventListener("click", () => {
    const next = button.dataset.dailyRegion;
    active = next === "android" ? "android" : next === "us" ? "us" : "cn";
    render();
  }));

  // Re-check the locally published JSON while the page stays open.
  // Back-grounded mobile tabs may throttle timers; visibility resumes checks.
  let refreshPending = false;
  const load = (file) => fetch(file + "?v=" + Date.now(), {cache: "no-store"}).then(res => {
    if (!res.ok) throw Error("Missing snapshot");
    return res.json();
  });
  const refresh = async () => {
    if (refreshPending) return;
    refreshPending = true;
    try {
      const results = await Promise.allSettled([
        load("./data/daily-free.json"),
        load("./data/android-free.json")
      ]);
      if (results[0].status === "fulfilled" &&
          results[0].value?.schema === 1 && results[0].value?.regions) {
        apple = results[0].value;
        appleError = false;
      } else {
        appleError = true;
      }
      if (results[1].status === "fulfilled" &&
          results[1].value?.schema === 1 && Array.isArray(results[1].value?.items)) {
        android = results[1].value;
        androidError = false;
      } else {
        androidError = true;
      }
      render();
    } finally {
      refreshPending = false;
    }
  };
  refresh();
  window.setInterval(refresh, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
})();
