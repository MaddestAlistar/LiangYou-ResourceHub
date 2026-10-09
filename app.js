"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const grid = $("projectGrid"), search = $("projectSearch"), filters = $("filters");
  const dialog = $("projectDialog"), body = $("dialogBody");
  let projects = [], filter = "all", toastTimer, opener, activeProject, copyBusy = false;
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeURL = value => { try { const u = new URL(value); return u.protocol === "https:" ? u.href : "#"; } catch { return "#"; } };
  const number = value => Number(value).toLocaleString("en-US");
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

  function renderCards() {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const visible = projects.filter(p => {
      const text = [p.title, p.en, p.description, p.categoryLabel, ...p.apps, ...(p.keywords || []), ...p.imports.flatMap(i => [i.name, i.detail])].join(" ").toLocaleLowerCase();
      return (filter === "all" || p.category === filter) && terms.every(t => text.includes(t));
    });
    grid.innerHTML = visible.map(p => {
      const i = projects.indexOf(p) + 1;
      return `<article class="project-card" id="resource-${escapeHTML(p.id)}">
        <div class="card-art art-${escapeHTML(p.previewType)}"><div class="art-caption"><span>${escapeHTML(p.en)}</span><span class="art-index">0${i}</span></div><div class="art-images">${p.images.map((url, index) => `<img class="preview-image" src="${escapeHTML(safeURL(url))}" alt="${escapeHTML(p.title)}预览 ${index + 1}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`).join("")}</div></div>
        <div class="card-content"><div class="card-meta"><span class="card-type">${escapeHTML(p.categoryLabel)}</span><span class="live-status"><span class="status-dot"></span>已上线</span></div>
        <div><h3>${escapeHTML(p.title)}</h3><p class="card-stat">${escapeHTML(p.stats)}</p></div>
        <p class="card-desc">${escapeHTML(p.description)}</p><div class="app-chips">${p.apps.slice(0, 2).map(a => `<span>${escapeHTML(a)}</span>`).join("")}</div>
        <div class="highlights">${(p.highlights || []).map(t => `<span>${escapeHTML(t)}</span>`).join("")}</div>
        <div class="card-actions"><button class="button button-primary" type="button" data-open="${escapeHTML(p.id)}" aria-label="选择${escapeHTML(p.title)}的版本与导入">选择版本与导入 <span aria-hidden="true">↗</span></button><div class="card-repo">${link(p.repo, "原仓库", "")}<time datetime="${escapeHTML(p.updated)}">资源更新 ${escapeHTML(p.updated)}</time></div></div></div>
      </article>`;
    }).join("");
    $("emptyState").hidden = visible.length > 0;
    $("libraryCount").textContent = visible.length === projects.length ? `${projects.length} 个已上线项目` : `找到 ${visible.length} / ${projects.length} 个项目`;
    grid.setAttribute("aria-busy", "false");
  }

  function renderFilters() {
    const names = { player: "媒体徽章", icon: "媒体图标", live: "频道主播" };
    const categories = [...new Map(projects.map(p => [p.category, p.categoryLabel])).entries()];
    filters.innerHTML = `<button class="filter is-active" type="button" data-filter="all" aria-pressed="true">全部资源</button>` + categories.map(([id, label]) => `<button class="filter" type="button" data-filter="${escapeHTML(id)}" aria-pressed="false">${escapeHTML(names[id] || label)}</button>`).join("");
  }

  function renderCatalog(data) {
    projects = data.projects.filter(p => p.stage === "live");
    renderFilters(); renderCards();
    $("quickLinks").innerHTML = projects.map((p, i) => `<button class="quick-item" type="button" data-open="${escapeHTML(p.id)}" aria-label="打开${escapeHTML(p.title)}"><span class="quick-number">0${i + 1}</span><span class="quick-copy"><strong>${escapeHTML(p.title)}</strong><small>${escapeHTML(p.short)}</small></span><span aria-hidden="true">↗</span></button>`).join("");
    const metrics = [["已上线资源库", projects.length], ["媒体图标", data.metrics.icons], ["原创与专属", data.metrics.originalIcons], ["频道与作者", data.metrics.channels]];
    $("metrics").innerHTML = metrics.map(([label, value]) => `<div><dt>${label}</dt><dd>${number(value)}</dd></div>`).join("");
    $("dataNote").textContent = `目录核对 ${data.checkedAt} · 数量以原仓库后续更新为准`;
    $("roadmapGrid").innerHTML = data.future.map((p, i) => `<article class="roadmap-card" data-phase="${escapeHTML(p.phase)}"><div class="roadmap-meta"><span class="roadmap-number">0${i + 1}</span><span class="roadmap-phase">${escapeHTML(p.phaseLabel)}</span></div><h3>${escapeHTML(p.title)}</h3><p>${escapeHTML(p.description)}</p><div><div class="roadmap-format">${escapeHTML(p.format)}</div><div class="roadmap-audience">面向 ${escapeHTML(p.audience)}</div></div><div class="roadmap-next">下一步：${escapeHTML(p.next)}</div></article>`).join("");
    $("updateList").innerHTML = (data.updates || []).map(item => `<button class="update-item" type="button" data-open="${escapeHTML(item.project)}"><time datetime="${escapeHTML(item.date)}">${escapeHTML(item.date)}</time><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.detail)}</small></span><span aria-hidden="true">↗</span></button>`).join("");
    if (location.hash.startsWith("#resource-")) openProject(location.hash.slice(10));
  }

  function openProject(id) {
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
  body.addEventListener("click", event => { const button = event.target.closest("[data-copy]"); if (button && activeProject) copyText(activeProject.imports[Number(button.dataset.copy)].url, button); });
  // A failed remote image keeps the surrounding layout and gives a useful label.
  grid.addEventListener("error", event => { if (event.target.tagName === "IMG") { const label = document.createElement("span"); label.className = "image-fallback"; label.textContent = "预览图片暂不可用"; event.target.replaceWith(label); } }, true);
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
      $("updateList").innerHTML = `<p class="subtle">更新记录暂不可用，请查看原仓库。</p>`;
    });
})();
