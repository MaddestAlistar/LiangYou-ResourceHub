"use strict";
(() => {
  const grid = document.getElementById("projectGrid");
  const roadmap = document.getElementById("roadmapGrid");
  const search = document.getElementById("projectSearch");
  const count = document.getElementById("libraryCount");
  const empty = document.getElementById("emptyState");
  const dialog = document.getElementById("projectDialog");
  const dialogBody = document.getElementById("dialogBody");
  const toast = document.getElementById("toast");
  let projects = [];
  let filter = "all";
  let timer;

  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
  const safeURL = (value) => { try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "#";
  } catch { return "#"; } };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  async function copyText(value) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement("textarea");
        field.value = value;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.focus(); field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("copy unsupported");
      }
      showToast("订阅链接已复制，可以粘贴到 App 中");
    } catch {
      window.prompt("复制以下订阅链接：", value);
      showToast("请手动复制上方链接");
    }
  }

  function projectArt(project, idx) {
    const images = project.images.map((url, i) => `<img src="${escapeHTML(safeURL(url))}" alt="${escapeHTML(project.title)}预览 ${i + 1}" loading="lazy" referrerpolicy="no-referrer">`).join("");
    return `<div class="card-art art-${escapeHTML(project.previewType)}"><span class="art-label">LIANGYOU / ${escapeHTML(project.en)}</span><span class="art-index">0${idx + 1}</span><div class="art-images">${images}</div></div>`;
  }

  function projectCard(project, idx) {
    return `<article class="project-card">
      ${projectArt(project, idx)}
      <div class="card-content">
        <div class="card-meta"><span class="card-type">${escapeHTML(project.categoryLabel)}</span><span class="live-status">已上线</span></div>
        <h3>${escapeHTML(project.title)}</h3><div class="card-en">${escapeHTML(project.en)}</div>
        <p class="card-desc">${escapeHTML(project.description)}</p>
        <div class="app-chips">${project.apps.slice(0, 2).map(a => `<span title="${escapeHTML(a)}">${escapeHTML(a)}</span>`).join("")}</div>
        <div class="card-bottom"><span class="card-stat">${escapeHTML(project.stats)}</span><button class="detail-button" type="button" data-open="${escapeHTML(project.id)}" aria-label="查看${escapeHTML(project.title)}的订阅和使用指南">查看详情 <span aria-hidden="true">↗</span></button></div>
      </div>
    </article>`;
  }

  function render() {
    const term = search.value.trim().toLocaleLowerCase();
    const visible = projects.filter(project => {
      const categoryMatch = filter === "all" || project.category === filter;
      const haystack = [project.title, project.en, project.categoryLabel, project.description, ...project.apps].join(" ").toLocaleLowerCase();
      return categoryMatch && (!term || haystack.includes(term));
    });
    grid.innerHTML = visible.map(project => projectCard(project, projects.indexOf(project))).join("");
    empty.hidden = visible.length !== 0;
    count.textContent = String(visible.length).padStart(2, "0") + " PROJECTS";
  }

  const paths = {
    tv: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 22h8m-4-4v4"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.7-3c-.7-1.3.1-2 1.3-2h2a4 4 0 0 0 4-4c0-5-4.5-9-10-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8" r="1"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',
    sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="#191b1f"/><circle cx="16" cy="12" r="2" fill="#191b1f"/><circle cx="8" cy="18" r="2" fill="#191b1f"/>',
    network: '<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4m0 0H5v4m7-4h7v4"/>',
    rss: '<circle cx="5" cy="19" r="2"/><path d="M3 10a11 11 0 0 1 11 11M3 3a18 18 0 0 1 18 18"/>'
  };
  function renderRoadmap(items) {
    roadmap.innerHTML = items.map(item => `<article class="roadmap-card">
      <div class="roadmap-card-top"><span class="roadmap-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[item.icon] || paths.layers}</svg></span><span class="roadmap-status">筹备方向</span></div>
      <h3>${escapeHTML(item.title)}</h3><div class="roadmap-en">${escapeHTML(item.en)}</div>
      <p>${escapeHTML(item.description)}</p>
    </article>`).join("");
  }

  function openProject(id) {
    const p = projects.find(project => project.id === id);
    if (!p) return;
    const imports = p.imports.map((item, index) => `<div class="import-item">
      <div class="import-text"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.detail)}</small><span class="import-url" title="${escapeHTML(item.url)}">${escapeHTML(item.url)}</span></div>
      <button class="copy-btn" type="button" data-copy="${index}" aria-label="复制${escapeHTML(item.name)}的订阅链接">复制链接</button>
    </div>`).join("");
    dialogBody.innerHTML = `<div class="dialog-content">
      <div class="dialog-overline">● 已上线 / ${escapeHTML(p.categoryLabel)} · 更新 ${escapeHTML(p.updated)}</div>
      <h2 id="dialogTitle">${escapeHTML(p.title)}</h2>
      <p class="dialog-description">${escapeHTML(p.description)}</p>
      <div class="dialog-chips">${p.apps.map(app => `<span>${escapeHTML(app)}</span>`).join("")}</div>
      <div class="dialog-section-head"><h3>订阅地址</h3><span>${p.imports.length} 个可选版本</span></div>
      <div class="import-list">${imports}</div>
      <div class="dialog-section-head"><h3>导入方法</h3><span>HOW TO USE</span></div>
      <ol class="howto-list">${p.steps.map(step => `<li>${escapeHTML(step)}</li>`).join("")}</ol>
      <div class="dialog-notice">提示：不同 App 的导入入口和支持格式可能不同，请优先使用对应版本。无法导入时，可前往原仓库查看最新说明。</div>
      <a class="dialog-link" href="${escapeHTML(safeURL(p.repo))}" target="_blank" rel="noopener noreferrer">查看 GitHub 原仓库及完整文档 <span aria-hidden="true">↗</span></a>
    </div>`;
    dialogBody.querySelectorAll("[data-copy]").forEach(button => {
      button.addEventListener("click", () => copyText(p.imports[Number(button.dataset.copy)].url));
    });
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    document.body.classList.add("modal-open");
  }

  function closeDialog() {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    document.body.classList.remove("modal-open");
  }

  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(b => {
      const selected = b === button;
      b.classList.toggle("is-active", selected);
      b.setAttribute("aria-pressed", String(selected));
    });
    render();
  }));
  search.addEventListener("input", render);
  grid.addEventListener("click", event => {
    const button = event.target.closest("[data-open]");
    if (button) openProject(button.dataset.open);
  });
  document.getElementById("resetSearch").addEventListener("click", () => {
    search.value = "";
    document.querySelector('[data-filter="all"]').click();
    search.focus();
  });
  document.getElementById("closeDialog").addEventListener("click", closeDialog);
  dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener("close", () => document.body.classList.remove("modal-open"));

  fetch("./data/projects.json", { cache: "no-cache" })
    .then(response => { if (!response.ok) throw new Error("catalog load failed"); return response.json(); })
    .then(data => {
      if (!Array.isArray(data.projects) || !Array.isArray(data.future)) throw new Error("invalid catalog");
      projects = data.projects.filter(p => p.stage === "live");
      render();
      renderRoadmap(data.future);
    })
    .catch(error => {
      console.warn("Resource catalog could not be loaded", error);
      grid.innerHTML = '<div class="empty-state" style="display:block;grid-column:1/-1">资源目录暂时无法加载，请打开 <a href="https://github.com/MaddestAlistar/LiangYou-ResourceHub" target="_blank" rel="noopener noreferrer" style="color:#e2bf86;text-decoration:underline">GitHub 仓库</a> 查看订阅地址。</div>';
      roadmap.innerHTML = '<p style="color:#999">计划目录暂时无法加载。</p>';
    });
})();