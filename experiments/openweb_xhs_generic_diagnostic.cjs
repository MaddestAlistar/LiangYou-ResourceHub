/* Independent anonymous browser check for OpenWeb/XHS generic keyword.
   Uses existing fresh Chrome CDP, never imports any user profile. */
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve('openweb/package.json'));
const { chromium } = req('patchright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 15000 });
  const context = browser.contexts()[0];
  if (!context) throw new Error('no_context');
  const page = await context.newPage();
  try {
    const url = 'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent('咖啡') + '&source=web_search_result_notes';
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 32000 });
    await page.waitForTimeout(6000);
    const info = await page.evaluate(() => {
      const st = window.__INITIAL_STATE__ || {};
      const f = st.search && st.search.feeds;
      const feeds = (f && (f._rawValue || f.value || f)) || [];
      const visible = (document.body?.innerText || '').slice(0, 20000);
      return {
        final_url: location.origin + location.pathname,
        document_title: document.title.slice(0, 120),
        page_text_length: visible.length,
        says_login_to_view: /登录后查看搜索结果|登录后查看|请先登录/.test(visible),
        has_security_or_captcha: /安全验证|账号异常|验证码|请使用已登录该账号的.*扫码/.test(visible) || /captcha|website-login/.test(location.pathname),
        has_login_dialog: /登录小红书|扫码登录/.test(visible),
        initial_state_exists: !!window.__INITIAL_STATE__,
        search_state_exists: !!st.search,
        raw_feeds_count: Array.isArray(feeds) ? feeds.length : null,
        note_models: Array.isArray(feeds) ? feeds.filter(x => x && x.modelType === 'note').length : null,
        note_cards_in_dom: document.querySelectorAll('.note-item, section.note-item').length
      };
    });
    console.log(JSON.stringify({ method: 'anonymous_direct_browser', query: '咖啡', http_status: response?.status() ?? null, ...info }));
  } finally {
    await page.close();
    await browser.close();
  }
}
main().catch(err => {
  console.log(JSON.stringify({ method: 'anonymous_direct_browser', query: '咖啡', error: String(err).slice(0, 550) }));
  process.exitCode = 1;
});
