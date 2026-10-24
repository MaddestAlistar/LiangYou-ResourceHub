"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const grid = $("projectGrid"), search = $("projectSearch"), filters = $("filters");
  const dialog = $("projectDialog"), body = $("dialogBody");
  let projects = [], filter = "all", toastTimer, opener, activeProject, copyBusy = false;
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeURL = (value, local = false) => { try { const u = new URL(value, local ? document.baseURI : undefined); return u.protocol === "https:" || (local && u.origin === location.origin && u.protocol === "http:") ? u.href : "#"; } catch { return "#"; } };
  const number = value => Number(value).toLocaleString("en-US");
  const circled = value => String.fromCodePoint(0x2460 + value - 1);
  const link = (url, label, className = "text-link") => `<a class="${className}" href="${escapeHTML(safeURL(url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)} <span aria-hidden="true">↗</span></a>`;

  function notify(message) {
    if (dialog.open) $("dialogStatus").textContent = message;
    else {
      $("toast").textContent = message;
      $("toast").classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3200);
    }
  }

  async function copyText(value, button) {
    if (copyBusy) return;
    copyBusy = true;
    const previousFocus = document.activeElement;
    button.disabled = true;
    const label = button.textContent;
    let copied = false;
    $("manualCopy").hidden = true;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(value); copied = true; } catch { /* Try selection-based copy below. */ }
      }
      if (!copied) {
        const field = document.createElement("textarea");
        field.value = value;
        field.setAttribute("readonly", "");
        // Keep the fallback inside the modal: the rest of the page is inert.
        field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px";
        dialog.append(field);
        try { field.focus({ preventScroll: true }); field.select(); field.setSelectionRange(0, value.length); copied = document.execCommand("copy"); }
        finally { field.remove(); }
      }
      if (!copied) throw new Error("Clipboard unavailable");
      button.textContent = "已复制 ✓";
      notify("已复制完整订阅链接，回到 App 粘贴即可。");
      setTimeout(() => { if (button.isConnected) button.textContent = label; }, 2200);
    } catch {
      $("manualCopy").hidden = false;
      $("manualCopyValue").value = value;
      $("manualCopyValue").focus();
      $("manualCopyValue").select();
      $("manualCopyStatus").textContent = "链接已全选，请使用系统的复制操作。";
      notify("浏览器未允许自动复制，请手动复制下方完整链接。");
    } finally { button.disabled = false; copyBusy = false; if (copied) previousFocus?.focus({ preventScroll: true }); }
  }

  // Only the three locally hosted channel portraits receive a live-style frame.
  function previewThumb(p, url, index) {
    const channels = p.previewType === "channels";
    const img = `<img class="preview-image" src="${escapeHTML(safeURL(url, true))}" alt="${escapeHTML(p.imageLabels?.[index] || `${p.title}预览 ${index + 1}`)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${channels ? ' data-clean-channel-badge="true"' : ""}>`;
    return channels ? `<span class="channel-avatar-shell">${img}</span>` : img;
  }

  function renderCards() {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const visible = projects.filter(p => {
      const text = [p.title, p.en, p.description, p.categoryLabel, ...p.apps, ...(p.keywords || []), ...p.imports.flatMap(i => [i.name, i.detail])].join(" ").toLocaleLowerCase();
      return (filter === "all" || p.category === filter) && terms.every(t => text.includes(t));
    });
    grid.innerHTML = visible.map(p => {
      const i = projects.indexOf(p) + 1;
      return `<article class="project-card" id="resource-${escapeHTML(p.id)}">
        <div class="card-art art-${escapeHTML(p.previewType)}"><div class="art-caption"><span>${escapeHTML(p.en)}</span><span class="art-index">${circled(i)}</span></div><div class="art-images"><div class="preview-gallery">${p.images.map((url,index) => previewThumb(p,url,index)).join("")}</div>${p.previewCaption ? `<p class="preview-caption">${escapeHTML(p.previewCaption)}</p>` : ""}</div></div>
        <div class="card-content"><div class="card-meta"><span class="card-type">${escapeHTML(p.categoryLabel)}</span><span class="live-status"><span class="status-dot"></span>已上线</span></div>
        <div><h3>${escapeHTML(p.title)}</h3><p class="card-stat">${escapeHTML(p.stats)}</p></div>
        <p class="card-desc">${escapeHTML(p.description)}</p><div class="app-chips">${p.apps.map(a => `<span>${escapeHTML(a)}</span>`).join("")}</div>
        <div class="highlights">${(p.highlights || []).map(t => `<span>${escapeHTML(t)}</span>`).join("")}</div>
        <div class="card-actions">${p.id === "sports" ? `<a class="button button-primary" href="#sports">查看赛事数据 <span aria-hidden="true">↗</span></a><a class="button button-secondary" href="https://conflux.kami.asia/i/VM3ZA" target="_blank" rel="noopener noreferrer">获取汇流直播 ↗</a>` : `<button class="button button-primary" type="button" data-open="${escapeHTML(p.id)}" aria-label="选择${escapeHTML(p.title)}的版本与导入">选择版本与导入 <span aria-hidden="true">↗</span></button>`}<div class="card-repo">${link(p.repo, "原仓库", "")}<time datetime="${escapeHTML(p.updated)}">资源更新 ${escapeHTML(p.updated)}</time></div></div></div>
      </article>`;
    }).join("");
    $("emptyState").hidden = visible.length > 0;
    $("libraryCount").textContent = visible.length === projects.length ? `${projects.length} 个已上线项目` : `找到 ${visible.length} / ${projects.length} 个项目`;
    grid.setAttribute("aria-busy", "false");
    document.dispatchEvent(new Event("hub:render"));
  }

  function renderFilters() {
    const names = { player: "媒体徽章", icon: "媒体图标", live: "频道主播", sports: "赛事数据" };
    const categories = [...new Map(projects.map(p => [p.category, p.categoryLabel])).entries()];
    filters.innerHTML = `<button class="filter is-active" type="button" data-filter="all" aria-pressed="true">全部资源</button>` + categories.map(([id, label]) => `<button class="filter" type="button" data-filter="${escapeHTML(id)}" aria-pressed="false">${escapeHTML(names[id] || label)}</button>`).join("");
  }


  // Six distinct inline SVG identities. Self-hosted in the page, no icon font or external CDN.
  const labIdentity = {
    poster: { a:"#ffdc9b", b:"#f39370", art:'<g stroke="#fff0d3" stroke-width="2.7" stroke-linejoin="round"><rect x="19" y="32" width="58" height="43" rx="9" fill="url(#GRAD)" fill-opacity=".3"/><path d="M20 32 17 24c-1-3 1-6 4-7l44-10c3-1 6 1 7 4l2 9Z" fill="url(#GRAD)" fill-opacity=".8"/><path d="m30 15 10 13M49 11l10 13M22 45h52" fill="none"/><path d="m43 49 14 8-14 8Z" stroke="none" fill="#fff2d8"/></g><rect x="53" y="63" width="29" height="17" rx="7" fill="#281d28" stroke="#ffdfaa" stroke-width="1.5"/><text x="67.5" y="75" text-anchor="middle" fill="#ffe6b8" font-size="11" font-weight="800">4K</text>'},
    iptv: { a:"#9ee9ff", b:"#528fff", art:'<g stroke="#dff8ff" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"><rect x="13" y="24" width="70" height="48" rx="12" fill="url(#GRAD)" fill-opacity=".3"/><path d="m31 17 17 8 17-8M48 72v9m-17 0h34" fill="none"/><path d="m41 37 19 12-19 12Z" stroke="none" fill="#dcf7ff"/><path d="M21 35v25" stroke="#9beaff" stroke-opacity=".7"/></g><circle cx="74" cy="31" r="3.5" fill="#a0f4ff"/>'},
    rss: { a:"#b4a3ff", b:"#77ccf6", art:'<g stroke="#f0e9ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="23" y="11" width="51" height="72" rx="12" fill="url(#GRAD)" fill-opacity=".25"/><path d="M34 63c8 0 15 7 15 15M34 48c16 0 29 13 29 30" fill="none" stroke-width="4"/><circle cx="35" cy="77" r="4" fill="#f4e8ff" stroke="none"/><path d="M35 24h27m-27 9h18" opacity=".75"/></g>'},
    jellyfin: { a:"#dc9eff", b:"#719dff", art:'<path d="M48 10c3 0 5 2 7 6l28 49c3 6 0 12-7 12H20c-7 0-10-6-7-12l28-49c2-4 4-6 7-6Z" fill="url(#GRAD)" fill-opacity=".16" stroke="#d4c4ff" stroke-width="2.6"/><path d="M48 27 70 66H26Z" fill="url(#GRAD)" fill-opacity=".7" stroke="#f1e2ff" stroke-width="2.3" stroke-linejoin="round"/><path d="M48 42 58 60H38Z" fill="#eef1ff"/><circle cx="48" cy="21" r="2.7" fill="#e6bdff"/>'},
    profiles: { a:"#9df9cd", b:"#63adff", art:'<circle cx="48" cy="48" r="32" fill="url(#GRAD)" fill-opacity=".17" stroke="#c2ffdf" stroke-opacity=".7" stroke-width="2"/><path d="M23 57a26 26 0 0 1 50-16" fill="none" stroke="#b8ffe1" stroke-width="5" stroke-linecap="round"/><path d="m40 57 8 8 17-23" stroke="#e9fff1" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M48 14v6M75 48h6M16 48h5" stroke="#b9fbdc" stroke-width="3" stroke-linecap="round"/>'},
    network: { a:"#9de7ff", b:"#9d99ff", art:'<g fill="none" stroke="#bfeaff" stroke-width="3.2" stroke-linecap="round"><path d="m27 27 22 19m0 0 24-20M49 46l-3 27M27 27l-4 36m50-37 3 38M23 63l23 10 30-9" opacity=".8"/></g><g fill="url(#GRAD)" stroke="#ecf4ff" stroke-width="2.7"><circle cx="27" cy="27" r="10"/><circle cx="73" cy="26" r="10"/><circle cx="49" cy="46" r="13"/><circle cx="23" cy="63" r="8"/><circle cx="46" cy="73" r="9"/><circle cx="76" cy="64" r="8"/></g><circle cx="49" cy="46" r="4" fill="#f2f8ff"/>'}
  };
  function labSymbol(id) {
    const entry = labIdentity[id];
    if (!entry) return '';
    const gradient = 'lab-gradient-' + id;
    const image = entry.art.replaceAll('#GRAD', '#' + gradient);
    return '<span class="lab-symbol lab-symbol-' + id + '" aria-hidden="true"><svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><defs><linearGradient id="' + gradient + '" x1="10" y1="8" x2="83" y2="90" gradientUnits="userSpaceOnUse"><stop stop-color="' + entry.a + '"/><stop offset="1" stop-color="' + entry.b + '"/></linearGradient></defs>' + image + '</svg></span>';
  }

  function renderCatalog(data) {
    projects = data.projects.filter(p => p.stage === "live");
    renderFilters(); renderCards();
    $("quickLinks").innerHTML = projects.map((p, i) => `<button class="quick-item" type="button" data-open="${escapeHTML(p.id)}" aria-label="打开${escapeHTML(p.title)}"><span class="quick-number">${circled(i + 1)}</span><span class="quick-symbol" aria-hidden="true">${({badges:"badges",icons:"icons",channels:"channels",sports:"sports"})[p.id] ? `<img src="./assets/shortcut-icons/${({badges:"badges",icons:"icons",channels:"channels"})[p.id]}.svg" width="256" height="256" alt="" loading="eager" decoding="async">` : "◇"}</span><span class="quick-copy"><strong>${escapeHTML(p.title)}</strong><small>${escapeHTML(p.short)}</small></span><span class="quick-arrow" aria-hidden="true">↗</span></button>`).join("");
    const metrics = [["已上线项目", projects.length], ["媒体图标", data.metrics.icons], ["精选与专属", data.metrics.originalIcons], ["主播单直播间", data.metrics.channels]];
    $("metrics").innerHTML = metrics.map(([label, value]) => `<div><dt>${label}</dt><dd>${number(value)}</dd></div>`).join("");
    $("dataNote").textContent = `目录核对 ${data.checkedAt} · 数量以原仓库后续更新为准`;
    $("roadmapGrid").innerHTML = data.future.map((p, i) => `<article class="roadmap-card lab-card">
      <div class="roadmap-meta"><span class="roadmap-number">${circled(i + 1)} · ${escapeHTML(p.en)}</span><span class="lab-type">JSON 资源索引</span></div>
      ${labSymbol(p.id)}
       <h3>${escapeHTML(p.title)}</h3><p>${escapeHTML(p.description)}</p>
      <div class="lab-info"><span>${escapeHTML(p.contents)}</span><span>${escapeHTML(p.format)}</span></div>
      <p class="lab-caveat">${escapeHTML(p.caveat)}</p>
      <div class="lab-actions"><button type="button" class="button button-primary lab-copy-btn" data-lab-json="${escapeHTML(safeURL(p.jsonUrl))}" aria-label="复制${escapeHTML(p.title)}的 JSON 地址">一键复制 JSON 地址 <span aria-hidden="true">⧉</span></button>
        <a class="lab-repo-link" href="${escapeHTML(safeURL(p.repo))}" target="_blank" rel="noopener noreferrer">查看 GitHub ↗</a></div>
      <div class="lab-copy-fallback" hidden><label>请长按或全选 JSON 地址</label><input type="text" readonly value="${escapeHTML(safeURL(p.jsonUrl))}" aria-label="${escapeHTML(p.title)} JSON 资源地址"></div>
    </article>`).join("");
    if (location.hash.startsWith("#resource-")) openProject(location.hash.slice(10));
    document.dispatchEvent(new Event("hub:render"));
  }

  function openProject(id) {
    if (id === "sports") { location.hash = "#sports"; document.getElementById("sports")?.scrollIntoView({ behavior: "smooth" }); return; }
    const p = projects.find(p => p.id === id);
    if (!p) return;
    opener = document.activeElement;
    activeProject = p;
    $("manualCopy").hidden = true;
    $("dialogStatus").textContent = "";
    body.innerHTML = `<div class="dialog-content"><div class="dialog-overline"><span>● 已上线 · ${escapeHTML(p.categoryLabel)}</span><span>资源更新 ${escapeHTML(p.updated)}</span></div><h2 id="dialogTitle">${escapeHTML(p.title)}</h2><p class="dialog-description">${escapeHTML(p.description)}</p><div class="app-chips dialog-chips">${p.apps.map(a => `<span>${escapeHTML(a)}</span>`).join("")}</div>
      <div class="dialog-section-head"><h3>选择适合的版本</h3><span>${p.imports.length} 个导入入口</span></div>
      <div class="import-list">${p.imports.map((item, i) => `<div class="import-item"><div class="import-main"><div class="import-text"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.detail)}</small></div><button type="button" class="button button-primary copy-btn" data-copy="${i}" aria-label="复制${escapeHTML(item.name)}链接">复制链接</button></div><details class="url-disclosure"><summary>查看完整链接 / 手动复制</summary><a class="import-url" href="${escapeHTML(safeURL(item.url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.url)}</a></details></div>`).join("")}</div>
      <div class="dialog-section-head"><h3>如何导入</h3></div><ol class="howto-list">${p.steps.map(s => `<li>${escapeHTML(s)}</li>`).join("")}</ol>
      ${p.sections ? `<div class="dialog-section-head"><h3>内容分区</h3></div><div class="app-chips">${p.sections.map(s => `<span>${escapeHTML(s)}</span>`).join("")}</div>` : ""}
      <p class="dialog-notice">${escapeHTML(p.note || "具体适配与使用方法，以原项目说明为准。")}</p><div class="dialog-links">${link(p.repo, "查看原仓库与说明")}${link("https://t.me/liangyouuniversity", "前往 TG 交流")}</div></div>`;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute("open", "");
    dialog.scrollTop = 0;
    document.body.classList.add("modal-open");
    $("closeDialog").focus({ preventScroll: true });
  }

  function cleanupDialog() {
    document.body.classList.remove("modal-open");
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
  function closeDialog() {
    if (typeof dialog.close === "function") dialog.close();
    else { dialog.removeAttribute("open"); cleanupDialog(); }
  }

  filters.addEventListener("click", event => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    filter = button.dataset.filter;
    filters.querySelectorAll("[data-filter]").forEach(b => { const selected = b === button; b.classList.toggle("is-active", selected); b.setAttribute("aria-pressed", String(selected)); });
    renderCards();
  });
  search.addEventListener("input", renderCards);
  $("resetSearch").addEventListener("click", () => { search.value = ""; filter = "all"; renderFilters(); renderCards(); search.focus(); });
  document.addEventListener("click", event => { const button = event.target.closest("[data-open]"); if (button) openProject(button.dataset.open); });

  // Resource Lab buttons copy the raw GitHub JSON URL, not the entire JSON payload.
  async function copyLabJSON(button) {
    const url = safeURL(button.dataset.labJson);
    if (url === "#" || !url.endsWith("/index.json")) return;
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* fallback */ }
    }
    if (!copied) {
      const field = document.createElement("textarea");
      field.value = url;
      field.readOnly = true;
      field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;";
      document.body.append(field);
      try {
        field.focus({ preventScroll: true });
        field.select();
        field.setSelectionRange(0, url.length);
        copied = document.execCommand("copy");
      } catch { /* manual copy below */ }
      finally { field.remove(); }
    }
    if (copied) {
      const previous = button.innerHTML;
      button.innerHTML = "已复制 JSON 地址 ✓";
      const card = button.closest('.lab-card');
      card?.classList.add('copy-feedback');
      setTimeout(() => card?.classList.remove('copy-feedback'), 800);
      notify("JSON 地址已复制，可粘贴到支持该资源目录的工具中。");
      setTimeout(() => { if (button.isConnected) button.innerHTML = previous; }, 2200);
    } else {
      const fallback = button.closest(".lab-card")?.querySelector(".lab-copy-fallback");
      if (fallback) {
        fallback.hidden = false;
        const field = fallback.querySelector("input");
        field?.focus({ preventScroll: true });
        field?.select();
      }
      notify("浏览器未允许自动复制，已显示完整 JSON 地址供手动复制。");
    }
  }
  $("roadmapGrid").addEventListener("click", event => {
    const button = event.target.closest("[data-lab-json]");
    if (button) copyLabJSON(button);
  });

  body.addEventListener("click", event => { const button = event.target.closest("[data-copy]"); if (button && activeProject) copyText(activeProject.imports[Number(button.dataset.copy)].url, button); });
  $("closeDialog").addEventListener("click", closeDialog);
  dialog.addEventListener("close", cleanupDialog);
  let backdropDown = false;
  const outside = event => { const rect = dialog.getBoundingClientRect(); return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom; };
  dialog.addEventListener("pointerdown", event => { backdropDown = event.target === dialog && outside(event); });
  dialog.addEventListener("click", event => { if (event.target === dialog && backdropDown && outside(event)) closeDialog(); backdropDown = false; });
  $("selectCopyValue").addEventListener("click", () => { const field = $("manualCopyValue"); field.focus(); field.select(); field.setSelectionRange(0, field.value.length); $("manualCopyStatus").textContent = "已全选，请使用系统的复制操作。"; });

  fetch("./data/projects.json", { cache: "no-cache" })
    .then(response => { if (!response.ok) throw new Error("catalog unavailable"); return response.json(); })
    .then(data => { if (!Array.isArray(data.projects) || !Array.isArray(data.future) || !data.metrics) throw new Error("invalid catalog"); renderCatalog(data); })
    .catch(error => {
      console.warn("Resource catalog could not be loaded", error);
      grid.setAttribute("aria-busy", "false");
      grid.innerHTML = `<div class="notice"><p>资源目录暂时无法加载。刷新页面，或直接打开原仓库：</p><ul><li>${link("https://github.com/MaddestAlistar/liangyou-appletv-badges", "媒体徽章库")}</li><li>${link("https://github.com/MaddestAlistar/LiangYou-IconLibrary", "媒体图标库")}</li><li>${link("https://github.com/MaddestAlistar/LiangyouChannels", "频道库")}</li></ul></div>`;
      $("libraryCount").textContent = "目录加载失败";
      search.disabled = true;
      filters.querySelectorAll("button").forEach(button => { button.disabled = true; });
      $("roadmapGrid").innerHTML = `<p class="subtle">计划目录暂时无法加载，可前往 GitHub 查看。</p>`;
    });
})();

// Only animate decorative cinema objects while the hero is visible.
(() => {
  const field = document.querySelector('.cinema-field');
  if (!field) return;
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      field.classList.toggle('is-paused', !entries[0].isIntersecting);
    });
    observer.observe(field);
  }
  const syncVisibility = () => document.documentElement.classList.toggle('page-hidden', document.hidden);
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();
})();
