// One main-branch commit publishes image, both catalogs and an idempotency receipt.
export const OFFICIAL = 'MaddestAlistar/LiangYou-IconLibrary';
export const CATALOGS = ['LiangYou-Original-Icons.json', 'LiangYou-Emby-Icons.json'];
export const VERSION = '2026-10-26.rename-v5';
export class PublishError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
export const encode = text => utf8Base64(text);
function utf8Base64(text) {
  const bytes = new TextEncoder().encode(text); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function decode(content) {
  return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0)));
}
export function serialize(data) {
  const text = JSON.stringify(data, null, 2) + '\n';
  JSON.parse(text); // Validate exactly the bytes we will write, including terminator.
  return text;
}
export function validateCatalog(data) {
  if (!Array.isArray(data?.icons) || data.icons.length < 5 || data.icons.some(x =>
    !x || typeof x.name !== 'string' || !x.name.trim() || typeof x.url !== 'string' || !x.url.startsWith('https://'))) {
    throw new PublishError('正式订阅结构异常，已停止发布，原文件不会被覆盖');
  }
  return data;
}
export function validatePair(catalogs) {
  catalogs.forEach(validateCatalog);
  if (JSON.stringify(catalogs[0].icons.slice(0, 5)) !== JSON.stringify(catalogs[1].icons.slice(0, 5))) throw new PublishError('两份订阅的置顶图标不一致，已停止发布');
  const full = new Set(catalogs[1].icons.map(x => JSON.stringify([x.name, x.url])));
  if (catalogs[0].icons.some(x => !full.has(JSON.stringify([x.name, x.url])))) throw new PublishError('精选库与完整库不一致，已停止发布');
}
export function chooseName(meta, catalogs) {
  const raw = String(meta.name || '').trim().replace(/\s*(?:动态|dynamic)\s*(?:0*[0-9]+)?$/i, '').trim();
  if (!raw || raw.length > 100) throw new PublishError('图标名称无效', 400);
  const dynamic = meta.kind === '动态' || /\.gif$/i.test(meta.filename);
  const chinese = /\p{Script=Han}/u.test(raw);
  const all = catalogs.flatMap(c => c.icons);
  const related = all.find(x => x.name.split('｜').pop().replace(/\s+0*[0-9]+$/, '').replace(/\s*动态$/, '').trim().toLowerCase() === raw.toLowerCase() && /^[a-z0-9-]+｜/i.test(x.name));
  const base = (chinese && related ? related.name.split('｜')[0] + '｜' : '') + raw + (dynamic ? (chinese ? '动态' : ' 动态') : '');
  const names = new Set(all.map(x => x.name.toLowerCase()));
  for (let n = 1; n < 1000; n++) {
    const name = base + (dynamic || n > 1 ? ' ' + String(n).padStart(2, '0') : '');
    if (!names.has(name.toLowerCase())) return name;
  }
  throw new PublishError('同名图标数量过多', 409);
}
const nameCollator = new Intl.Collator('zh-CN', {numeric: true, sensitivity: 'base'});
export function appendIcon(catalog, entry) {
  const copy = structuredClone(catalog);
  const pinned = copy.icons.slice(0, 5);
  copy.icons = [...pinned, ...[...copy.icons.slice(5), entry].sort((a, b) => {
    const aNumber = /^[0-9]/.test(a.name), bNumber = /^[0-9]/.test(b.name);
    return aNumber !== bNumber ? (aNumber ? 1 : -1) : nameCollator.compare(a.name, b.name);
  })];
  const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  copy.description = String(copy.description || '').replace(/更新时间：[^｜]+/, '更新时间：' + date);
  validateCatalog(copy); serialize(copy); return copy;
}
export function githubClient(repo, token, fetcher = fetch) {
  return async (path, {method = 'GET', body, missing = false} = {}) => {
    let response;
    try {
      response = await fetcher('https://api.github.com/repos/' + repo + '/' + path, {
        method, headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json', 'User-Agent': 'LiangYou-Icon-Review', 'X-GitHub-Api-Version': '2022-11-28'},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(20000)
      });
    } catch { throw new PublishError('GitHub 请求超时或网络异常。请刷新后重试，同一投稿不会重复入库', 503); }
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new PublishError('GitHub 操作失败（HTTP ' + response.status + '），请刷新后重试', response.status);
    return response.json();
  };
}
const pathURL = path => path.split('/').map(encodeURIComponent).join('/');
async function readJSON(gh, path, ref, missing = false) {
  const file = await gh('contents/' + pathURL(path) + '?ref=' + ref, {missing});
  if (!file) return null;
  const blob = file.encoding === 'base64' ? file : await gh('git/blobs/' + file.sha);
  try { return JSON.parse(decode(blob.content)); }
  catch { throw new PublishError(path + ' 不是有效 JSON；已停止发布，请先修复订阅文件'); }
}
export async function publishIcon(meta, gh, readImage) {
  if (meta.status === 'withdrawn') throw new PublishError('该图标已下架，不能通过旧审核操作重新发布', 409);
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(meta.id || '') || !/^pending\/[^/]+\.(png|webp|jpe?g|gif)$/i.test(meta.filename || '')) throw new PublishError('投稿编号或图片路径无效', 400);
  const receiptPath = 'maintenance/published-submissions/' + meta.id + '.json';
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = (await gh('git/ref/heads/main')).object.sha;
    const commit = await gh('git/commits/' + head);
    const catalogs = await Promise.all(CATALOGS.map(path => readJSON(gh, path, head)));
    validatePair(catalogs);
    const receipt = await readJSON(gh, receiptPath, head, true);
    if (receipt?.status === 'withdrawn') throw new PublishError('该图标已下架，请刷新审核记录；不会自动重新发布', 409);
    // Recover a successful official commit even when queue metadata write failed.
    const published = receipt || (meta.publishedUrl ? meta : null);
    if (published) {
      const prefix = 'https://raw.githubusercontent.com/' + OFFICIAL + '/main/';
      if (!published.publishedUrl?.startsWith(prefix)) throw new PublishError('发布记录的地址无效');
      const imagePath = decodeURIComponent(published.publishedUrl.slice(prefix.length));
      if (!imagePath.startsWith('icons/liangyou/') || imagePath.includes('..')) throw new PublishError('发布图片路径无效');
      const image = await gh('contents/' + pathURL(imagePath) + '?ref=' + head, {missing: true});
      const entries = catalogs.map(c => c.icons.find(x => x.url === published.publishedUrl));
      if (!image || entries.some(x => !x) || entries[0].name !== entries[1].name || (receipt?.imageSha && receipt.imageSha !== image.sha)) throw new PublishError('检测到既有发布记录不完整，请修复正式库后重试；不会重复上传');
      return {...published, publishedName: entries[0].name, publishedFilename: imagePath, recovered: true};
    }
    if (meta.status === 'approved') throw new PublishError('旧审核记录缺少发布地址，需要先核对正式库，避免重复入库', 409);
    const label = chooseName(meta, catalogs);
    const ext = meta.filename.split('.').pop().toLowerCase();
    const imagePath = 'icons/liangyou/submission-' + meta.id + (ext === 'gif' ? '-animated' : '') + '.' + ext;
    const publishedUrl = 'https://raw.githubusercontent.com/' + OFFICIAL + '/main/' + imagePath;
    const imageData = await readImage();
    if (imageData.encoding !== 'base64' || !imageData.content) throw new PublishError('审核图片无法读取，已停止发布');
    const image = await gh('git/blobs', {method: 'POST', body: {content: imageData.content.replace(/\s/g, ''), encoding: 'base64'}});
    const record = {id: meta.id, publishedName: label, publishedFilename: imagePath, publishedUrl,
      publishedAt: new Date().toISOString(), imageSha: image.sha, publisherVersion: VERSION};
    const next = catalogs.map(c => appendIcon(c, {name: label, url: publishedUrl})); validatePair(next);
    const tree = await gh('git/trees', {method: 'POST', body: {base_tree: commit.tree.sha, tree: [
      {path: imagePath, mode: '100644', type: 'blob', sha: image.sha},
      ...CATALOGS.map((path, i) => ({path, mode: '100644', type: 'blob', content: serialize(next[i])})),
      {path: receiptPath, mode: '100644', type: 'blob', content: serialize(record)}
    ]}});
    const nextCommit = await gh('git/commits', {method: 'POST', body: {message: 'Publish reviewed icon: ' + label + ' [' + meta.id + ']', tree: tree.sha, parents: [head]}});
    try {
      await gh('git/refs/heads/main', {method: 'PATCH', body: {sha: nextCommit.sha, force: false}});
    } catch (error) {
      if ([409, 422].includes(error.status) && attempt < 2) continue;
      throw error;
    }
    const actual = await Promise.all(CATALOGS.map(path => readJSON(gh, path, nextCommit.sha)));
    validatePair(actual);
    if (actual.some(c => !c.icons.some(x => x.url === publishedUrl && x.name === label))) throw new PublishError('发布后的订阅核对失败，请刷新后重试');
    return {...record, publishedCommit: nextCommit.sha, recovered: false};
  }
  throw new PublishError('同时有其他更新，未覆盖已有内容，请稍后重试', 409);
}

// Delist the exact published URL. Keep image bytes and receipt for audit/recovery.
export async function withdrawIcon(meta, gh) {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(meta.id || '')) throw new PublishError('投稿编号无效', 400);
  const receiptPath = 'maintenance/published-submissions/' + meta.id + '.json';
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = (await gh('git/ref/heads/main')).object.sha;
    const commit = await gh('git/commits/' + head);
    const catalogs = await Promise.all(CATALOGS.map(path => readJSON(gh, path, head)));
    catalogs.forEach(validateCatalog);
    const receipt = await readJSON(gh, receiptPath, head, true);
    const published = receipt || (meta.publishedUrl ? meta : null);
    if (!published || (receipt && receipt.id !== meta.id)) throw new PublishError('没有可核对的正式发布记录，不能下架', 409);
    const prefix = 'https://raw.githubusercontent.com/' + OFFICIAL + '/main/icons/liangyou/';
    const target = published.publishedUrl;
    if (typeof target !== 'string' || !target.startsWith(prefix) || /[?#]/.test(target)) throw new PublishError('正式图标地址无效，已停止下架', 400);
    const file = decodeURIComponent(target.slice(prefix.length));
    if (!file || file.includes('/') || file.includes('..')) throw new PublishError('正式图标路径无效', 400);
    if (catalogs.some(c => c.icons.slice(0, 5).some(x => x.url === target))) throw new PublishError('前五个置顶专属图标受保护，不能通过投稿后台下架', 409);
    const count = catalogs.map(c => c.icons.filter(x => x.url === target).length);
    if (receipt?.status === 'withdrawn' && count.every(n => n === 0)) {
      validatePair(catalogs);
      return {...receipt, recovered: true};
    }
    const next = catalogs.map(c => {
      const copy = structuredClone(c);
      copy.icons = copy.icons.filter(x => x.url !== target);
      const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      copy.description = String(copy.description || '').replace(/更新时间：[^｜]+/, '更新时间：' + date);
      return copy;
    });
    validatePair(next);
    const entry = catalogs.flatMap(c => c.icons).find(x => x.url === target);
    const record = {id: meta.id, status: 'withdrawn', publishedUrl: target,
      publishedFilename: 'icons/liangyou/' + file,
      publishedName: published.publishedName || entry?.name || meta.name,
      ...(published.publishedAt ? {publishedAt: published.publishedAt} : {}),
      ...(published.imageSha ? {imageSha: published.imageSha} : {}),
      withdrawnAt: published.withdrawnAt || new Date().toISOString(),
      publisherVersion: VERSION, removedCounts: Object.fromEntries(CATALOGS.map((p, i) => [p, count[i]]))};
    const tree = await gh('git/trees', {method: 'POST', body: {base_tree: commit.tree.sha, tree: [
      ...CATALOGS.map((path, i) => ({path, mode: '100644', type: 'blob', content: serialize(next[i])})),
      {path: receiptPath, mode: '100644', type: 'blob', content: serialize(record)}
    ]}});
    const nextCommit = await gh('git/commits', {method: 'POST', body: {
      message: 'Withdraw reviewed icon: ' + record.publishedName + ' [' + meta.id + ']', tree: tree.sha, parents: [head]
    }});
    try {
      await gh('git/refs/heads/main', {method: 'PATCH', body: {sha: nextCommit.sha, force: false}});
    } catch (error) {
      if ([409, 422].includes(error.status) && attempt < 2) continue;
      throw error;
    }
    const actual = await Promise.all(CATALOGS.map(path => readJSON(gh, path, nextCommit.sha)));
    validatePair(actual);
    if (actual.some(c => c.icons.some(x => x.url === target))) throw new PublishError('下架后的索引核对失败，请刷新后重试');
    return {...record, withdrawnCommit: nextCommit.sha, recovered: false};
  }
  throw new PublishError('同时有其他更新，未覆盖已有内容，请稍后重试', 409);
}

// Rename catalog labels while preserving stable image URLs and publication receipts.
export async function renameIcon(meta, name, gh) {
 if(!/^[a-zA-Z0-9-]{8,100}$/.test(meta.id||''))throw new PublishError('投稿编号无效',400);
 const receiptPath='maintenance/published-submissions/'+meta.id+'.json';
 for(let attempt=0;attempt<3;attempt++){
  const head=(await gh('git/ref/heads/main')).object.sha;
  const receipt=await readJSON(gh,receiptPath,head,true);
  if(receipt?.id&&receipt.id!==meta.id)throw new PublishError('发布记录不匹配');
  if(receipt?.status==='withdrawn'||meta.status==='withdrawn')return null;
  const target=receipt?.publishedUrl||meta.publishedUrl;
  if(!target){if(meta.status==='approved')throw new PublishError('已通过记录缺少发布地址，请先核对发布');return null}
  const catalogs=await Promise.all(CATALOGS.map(p=>readJSON(gh,p,head)));validatePair(catalogs);
  if(catalogs.some(c=>c.icons.slice(0,5).some(x=>x.url===target)))throw new PublishError('前五个置顶图标受保护');
  if(catalogs.some(c=>!c.icons.some(x=>x.url===target)))throw new PublishError('正式库记录不完整，请先核对发布');
  if(catalogs.some(c=>c.icons.some(x=>x.url!==target&&x.name.toLowerCase()===name.toLowerCase())))throw new PublishError('正式库已有同名图标，请换一个名称');
  if(receipt?.publishedName===name&&catalogs.every(c=>c.icons.filter(x=>x.url===target).every(x=>x.name===name)))return receipt;
  const next=catalogs.map(c=>{const copy=structuredClone(c);copy.icons=copy.icons.map(x=>x.url===target?{...x,name}:x);copy.icons=[...copy.icons.slice(0,5),...copy.icons.slice(5).sort((a,b)=>{const an=/^[0-9]/.test(a.name),bn=/^[0-9]/.test(b.name);return an!==bn?(an?1:-1):nameCollator.compare(a.name,b.name)})];return copy});validatePair(next);
  const record={...(receipt||{id:meta.id,publishedUrl:target,publishedFilename:meta.publishedFilename,publishedAt:meta.publishedAt}),publishedName:name,renamedAt:new Date().toISOString(),publisherVersion:VERSION};
  const commit=await gh('git/commits/'+head);
  const tree=await gh('git/trees',{method:'POST',body:{base_tree:commit.tree.sha,tree:[...CATALOGS.map((path,i)=>({path,mode:'100644',type:'blob',content:serialize(next[i])})),{path:receiptPath,mode:'100644',type:'blob',content:serialize(record)}]}});
  const created=await gh('git/commits',{method:'POST',body:{message:'Rename reviewed icon ['+meta.id+']',tree:tree.sha,parents:[head]}});
  try{await gh('git/refs/heads/main',{method:'PATCH',body:{sha:created.sha,force:false}})}catch(e){if([409,422].includes(e.status)&&attempt<2)continue;throw e}
  return record;
 }
}
