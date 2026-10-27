/* Native bookmark assistance: browsers prohibit silent insertion into bookmarks. */
(() => {
  'use strict';
  const trigger = document.getElementById('bookmarkSite');
  const dialog = document.getElementById('bookmarkDialog');
  if (!trigger || !dialog) return;

  const title = document.getElementById('bookmarkTitle');
  const help = document.getElementById('bookmarkHelp');
  const steps = document.getElementById('bookmarkSteps');
  const share = document.getElementById('bookmarkShare');
  const copy = document.getElementById('bookmarkCopy');
  const status = document.getElementById('bookmarkStatus');
  const close = document.getElementById('bookmarkClose');
  const url = new URL('./', document.baseURI).href;
  const agent = navigator.userAgent || '';
  const isiOS = /iPhone|iPad|iPod/i.test(agent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(agent);
  const isMac = /Macintosh|Mac OS X/i.test(agent) && !isiOS;
  const isEn = () => document.documentElement.lang.toLowerCase().startsWith('en');

  function updateCopy() {
    const en = isEn();
    title.textContent = en ? 'Save LiangYou Resource Hub' : '收藏良友资源中心';
    help.textContent = en
      ? 'For your privacy, websites cannot silently add themselves to browser bookmarks. Use your browser’s own save command.'
      : '浏览器不允许网页未经确认直接写入书签。请使用浏览器自带的收藏功能，才能真正保存到浏览器。';

    if (isiOS) {
      steps.textContent = en
        ? 'On iPhone / iPad: open this site in Safari, tap Share in the Safari toolbar, then choose Add Bookmark or Add to Home Screen. In an in-app browser, open in Safari first.'
        : 'iPhone / iPad：请先用 Safari 打开本站，点击 Safari 工具栏的「分享」图标，再选择「添加书签」或「添加到主屏幕」。若在微信等内置浏览器中，请先选择用 Safari 打开。';
    } else if (isAndroid) {
      steps.textContent = en
        ? 'On Android Chrome: tap ⋮ in the browser toolbar, then tap the star (Bookmark) or choose Add to Home screen.'
        : '安卓 Chrome：点击浏览器右上角「⋮」菜单，选择「添加书签」（星标），也可以选择「添加到主屏幕」。';
    } else {
      steps.textContent = en
        ? (isMac ? 'On Mac: press Command (⌘) + D to save this page as a bookmark.' : 'On Windows / Linux: press Ctrl + D to bookmark this page.')
        : (isMac ? 'Mac 电脑：按 Command（⌘）+ D，即可在浏览器中添加书签。' : 'Windows / Linux 电脑：按 Ctrl + D，即可在浏览器中添加书签。');
    }
    share.textContent = en ? 'Open system share' : '打开系统分享';
    copy.textContent = en ? 'Copy site address' : '复制网站地址';
    close.setAttribute('aria-label', en ? 'Close bookmark guide' : '关闭收藏说明');
    share.hidden = typeof navigator.share !== 'function';
    status.textContent = '';
  }

  function openDialog() {
    updateCopy();
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    close.focus();
  }

  function closeDialog() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', openDialog);
  close.addEventListener('click', closeDialog);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', () => trigger.focus({ preventScroll: true }));

  share.addEventListener('click', async () => {
    if (typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: isEn() ? 'LiangYou Resource Hub' : '良友资源中心',
        url
      });
      // The share sheet never confirms that a bookmark has been created.
      status.textContent = isEn()
        ? 'Select a browser bookmark or home-screen action if available. Sharing alone does not save a bookmark.'
        : '请在系统菜单中选择添加书签或添加到主屏幕（若支持）；仅分享并不代表已经收藏。';
    } catch (error) {
      if (error?.name !== 'AbortError') status.textContent =
        isEn() ? 'System sharing is unavailable. Use your browser bookmark option above.'
          : '系统分享暂不可用，请按上面的浏览器收藏步骤操作。';
    }
  });

  copy.addEventListener('click', async () => {
    let done = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        done = true;
      }
    } catch {}
    if (!done) {
      const field = document.createElement('textarea');
      field.value = url;
      field.readOnly = true;
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;width:1px;height:1px;';
      dialog.append(field);
      try {
        field.focus();
        field.select();
        done = Boolean(document.execCommand?.('copy'));
      } catch {}
      field.remove();
    }
    status.textContent = done
      ? (isEn() ? 'Site address copied. Paste it into your browser bookmark manager to save it.'
        : '已复制网站地址。可将地址粘贴到浏览器书签管理器中保存。')
      : (isEn() ? 'Copy failed. Use your browser bookmark menu directly.'
        : '自动复制不可用，请直接使用浏览器的书签菜单收藏。');
  });
})();
