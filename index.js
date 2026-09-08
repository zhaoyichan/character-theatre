// 小剧场 character-theatre 独立插件（酒馆第三方插件）
// 全 SVG 无 emoji，紧凑单列流。数据层 + UI + 行为分块。
(() => { 'use strict';

// ---- 键名 / 前缀 ----
const PREFIX = 'th-';
const KEY_DATA = 'th-theatre-data';
const KEY_MAP_GLOBAL = 'th-map-global';
const CHAT_MAP_FIELD = '__theatreChatMap';
const KEY_NOTIFY = 'th-notify-on';      // AI回复完提示音开关（1开/0关）
const NOTIFY_SOUND_PATH = 'notify.mp3'; // 默认提示音资源（相对插件目录）；null 时用内置 base64

// ---- 数据层：内存权威缓存 + 三通道可靠落盘（localStorage + 酒馆扩展设置） ----
const _cache = {};            // 模块内权威缓存：导航/渲染同会话内绝不丢失
// rawGet：localStorage 优先；localStorage 为空则回退读酒馆扩展设置（双通道互为备份）
function rawGet(k, f) {
  try { const r = localStorage.getItem(k); if (r != null && r !== undefined) return JSON.parse(r); } catch (e) {}
  try {
    const ctx = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null;
    const ext = (ctx && ctx.extensionSettings) || (typeof extension_settings !== 'undefined' ? extension_settings : null);
    if (ext && ext['character_theatre_' + k] !== undefined) return ext['character_theatre_' + k];
  } catch (e) {}
  return f;
}
// rawSet：写 localStorage，失败不再静默吞——返回是否落盘成功，并报知
function rawSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e) {
    try { console.error('[小剧场] localStorage 写入失败 key=' + k, e); } catch (e2) {}
    try { logEvent('写盘失败', String(k) + ' ' + (e && e.message)); } catch (e3) {}
    return false;
  }
}
// 统一可靠落盘：localStorage + 酒馆扩展设置(extension_settings) 双通道，失败可见、主动保存设置
function thReliableSet(k, v) {
  const lsOk = rawSet(k, v);
  let extOk = false;
  try {
    const ctx = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null;
    const s = (ctx && ctx.extensionSettings) || (typeof extension_settings !== 'undefined' ? extension_settings : null);
    if (s) {
      s['character_theatre_' + k] = v;
      extOk = true;
      const dsc = (typeof saveSettingsDebounced === 'function') ? saveSettingsDebounced
        : (ctx && typeof ctx.saveSettingsDebounced === 'function') ? ctx.saveSettingsDebounced : null;
      if (dsc) { try { dsc(); } catch (e) {} }
    }
  } catch (e) { extOk = false; }
  if (!lsOk && !extOk) {
    try { if (typeof toast === 'function') toast('保存可能丢失，请用「全量备份」'); } catch (e) {}
    try { logEvent('双通道落盘均失败', String(k)); } catch (e2) {}
  }
  return { lsOk: !!lsOk, extOk: !!extOk };
}
function safeGet(k, f) { if (k in _cache) return _cache[k]; const r = rawGet(k, f); _cache[k] = r; return r; }
// safeSet：先入内存权威，再双通道可靠落盘（localStorage + 扩展设置）
function safeSet(k, v) { _cache[k] = v; thReliableSet(k, v); }
function getGroups() { const g = safeGet(KEY_DATA, []); return Array.isArray(g) ? g : []; }
function saveGroups(g) { if (!Array.isArray(g)) { logEvent('saveGroups-被传非数组', (g && g.name) || typeof g); return; } safeSet(KEY_DATA, g); }

// ---- 底部诊断日志（扁扁一条，点开看所有问题） ----
const DEBUG_LOG = [];
let debugLogId = 1;
function logEvent(kind, detail) {
  try {
    const gs = getGroups();
    const line = '#' + (debugLogId++) + ' [' + new Date().toLocaleTimeString() + '] ' + kind
      + (detail ? ' :: ' + detail : '')
      + ' | groups=' + JSON.stringify(gs.map(x => x.name))
      + ' | isArray=' + Array.isArray(gs);
    DEBUG_LOG.unshift(line);
    if (DEBUG_LOG.length > 40) DEBUG_LOG.pop();
    console.log('[小剧场·日志]', line);
  } catch (e) {}
}
function renderDebugBar() {
  const gs = getGroups();
  const raw = (function () { try { return localStorage.getItem(KEY_DATA) == null ? '(null)' : localStorage.getItem(KEY_DATA).slice(0, 160); } catch (e) { return '(读失败)'; } })();
  // 扁扁的摘要条：模块内存 + localStorage 原始值 + 组数 + 最近动作数
  let head = '诊断 ▾ 内存groups=' + gs.length + '组 ' + JSON.stringify(gs.map(x => x.name))
    + ' | isArray=' + Array.isArray(gs)
    + ' | 本地原始=' + (raw || '∅') + ' | 日志' + DEBUG_LOG.length + '条';
  let bodyRows = DEBUG_LOG.join('\n');
  bodyRows += bodyRows ? '\n—\n' : '';
  bodyRows += '[当前视图] ' + curView + (curGroup != null ? ' / 组=' + curGroup : '');
  return '<div id="' + PREFIX + 'dbgwrap" style="border-top:1px solid #ecebe7;background:#f4f3ef;flex-shrink:0;">'
    + '<div id="' + PREFIX + 'dbghead" data-handle="' + reg(toggleDebugBar) + '" style="display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:11px;color:#667;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 3 6 21"/></svg>'
    + '<span class="' + PREFIX + 'dbgtxt" style="overflow:hidden;text-overflow:ellipsis;">' + esc(head) + '</span></div>'
    + '<div id="' + PREFIX + 'dbgbody" style="' + (debugOpen ? '' : 'display:none;') + 'padding:8px 12px 10px;font-size:11px;color:#445;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow:auto;">' + esc(bodyRows) + '</div></div>';
}
let debugOpen = false;
function toggleDebugBar() { debugOpen = !debugOpen; render(); }
function findGroup(gs, name, create) { let g = gs.find(x => x.name === name); if (!g && create) { g = { name: name, items: [] }; gs.push(g); } return g; }
function safeItems(g) { return (g && Array.isArray(g.items)) ? g.items : []; }
function getGlobalMap() { const m = safeGet(KEY_MAP_GLOBAL, null); const g = (m && typeof m === 'object') ? m : {}; return { groups: Array.isArray(g.groups) ? g.groups : [], current: g.current != null ? g.current : null }; }
function saveGlobalMap(m) { safeSet(KEY_MAP_GLOBAL, m); }
function getChatMap(ctx) { try { if (ctx && ctx.chat) { const v = ctx.chat[CHAT_MAP_FIELD]; return (v && typeof v === 'object') ? v : { groups: [], current: null }; } } catch (e) {} return { groups: [], current: null }; }
function saveChatMap(ctx, m) { try { if (ctx && ctx.chat) { ctx.chat[CHAT_MAP_FIELD] = m; if (typeof ctx.saveChat === 'function') ctx.saveChat(); } } catch (e) {} }
function getCtx() { try { if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) return SillyTavern.getContext(); } catch (e) {} return {}; }

// ---- AI 回复完提示音 ----
// 读取开关：localStorage（优先）→ 默认开
function notifyOn() { try { const v = localStorage.getItem(KEY_NOTIFY); return v == null ? true : v === '1'; } catch (e) { return true; } }
function notifySetOn(b) { try { localStorage.setItem(KEY_NOTIFY, b ? '1' : '0'); } catch (e) {} }
// 创建/复用单个 Audio，避免每次 new 造成 WebView 抖卡
let _notifyAudio = null;
function notifyAudio() {
  try {
    if (!_notifyAudio) { _notifyAudio = new Audio(); _notifyAudio.__srcSet = false; }
    // 只首次设一次相对路径源（避免反复重置 src 导致重载）
    if (!_notifyAudio.__srcSet) {
      try { _notifyAudio.src = NOTIFY_SOUND_PATH; _notifyAudio.__srcSet = true; } catch (e) {}
    }
    return _notifyAudio;
  } catch (e) { return null; }
}
// 试播（设置页预览）
function notifyPreview() {
  try {
    const a = notifyAudio(); if (!a) { toast('当前环境不支持播放音频'); return; }
    a.currentTime = 0; a.volume = 1; a.play().then(() => {}).catch(() => { toast('音频播放被拦截（需先与页面交互一次）'); });
  } catch (e) { console.warn('[小剧场] 预览失败:', e); }
}
// AI 回复结束时触发（内部用，避免重复触发保护）
let _notifyLastTs = 0;
function notifyTrigger() {
  try {
    const now = Date.now();
    if (now - _notifyLastTs < 1500) return;   // 防连炸：1.5s 内只响一次
    _notifyLastTs = now;
    const a = notifyAudio(); if (!a) return;
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});   // 自动播放策略拦截时静默，不弹错
    logEvent('提示音-触发', '提示音播放');
  } catch (e) { console.warn('[小剧场] 提示音触发失败:', e); }
}

function currentCharName(ctx) { try { if (ctx && ctx.name2) return ctx.name2; } catch (e) {} return 'char'; }
function currentNames(chat) { let u = 'user', c = 'char'; try { const ctx = getCtx(); if (ctx && ctx.name1) u = ctx.name1; if (chat && chat.name) c = chat.name; else if (ctx && ctx.name2) c = ctx.name2; } catch (e) {} return { user: u, char: c }; }
function applyReplace(t, names, extra) { if (typeof t !== 'string') return ''; const u = names.user || 'user', c = names.char || 'char';
  let s = t.replace(/\{\{char\}\}/gi, c).replace(/<char>/gi, c).replace(/\{\{chat\}\}/gi, c).replace(/<chat>/gi, c)
          .replace(/\bchar\b/gi, c).replace(/\bchat\b/gi, c).replace(/\{\{user\}\}/gi, u).replace(/<user>/gi, u)
          .replace(/\buser\b/gi, u);
  // 自定义替换行：组级 extra [{from,to}]，逐条全局替换
  if (extra && Array.isArray(extra)) {
    extra.forEach(k => {
      const f = k && typeof k.from === 'string' && k.from !== '' ? k.from : null;
      if (!f) return;
      const t2 = (typeof k.to === 'string' ? k.to : '');
      try { s = s.split(f).join(t2); } catch (e) {}
    });
  }
  return s; }
function resolveNames(chat, cm, gm) { const n = currentNames(chat); const uc = (cm && cm.current != null) ? cm.groups.find(g => g.name === cm.current) : null;
  const ug = (gm && gm.current != null) ? gm.groups.find(g => g.name === gm.current) : null; const p = uc || ug; if (p) { if (p.user) n.user = p.user; if (p.char) n.char = p.char; } return n; }
function pickPicked(cm, gm) { const uc = (cm && cm.current != null) ? cm.groups.find(g => g.name === cm.current) : null;
  const ug = (gm && gm.current != null) ? gm.groups.find(g => g.name === gm.current) : null; return uc || ug; }
function grabText(src, idx) { const g = findGroup(getGroups(), src, false); const it = g && g.items[idx]; if (!it) return '';
  const ctx = getCtx(); const cm = getChatMap(ctx), gm = getGlobalMap();
  const n = resolveNames({ name: currentCharName(ctx) }, cm, gm);
  const picked = pickPicked(cm, gm); const extra = picked && Array.isArray(picked.extra) ? picked.extra : null;
  return applyReplace(it.content, n, extra); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// ---- SVG 图标（全 SVG，禁 emoji） ----
const ICO = {
  gear: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Zm8.5-3.5-2-1.2.1-.9-1-4 1-1-2-2-1 1-4-1-.9.1-1.2-2h-2.8l-1.2 2-.9-.1-4 1-1-1-2 2 1 1-1 4 .1.9-2 1.2v2.8l2 1.2-.1.9 1 4-1 1 2 2 1-1 4 1 .9-.1 1.2 2h2.8l1.2-2 .9.1 4-1 1 1 2-2-1-1 1-4-.1-.9 2-1.2v-2.8Z"/>',
  star: '<path d="M12 3 14.5 8.5 20.5 9l-4.6 4 .1 5.5L12 16l-4 2.5L8 13l-4.5-4 6-.5L12 3Z"/>',
  send: '<path d="M3 4 21 12 3 20l3-8-3-8Zm0 8h8"/>',
  fill: '<path d="M6 4v7a1 1 0 0 0 1 1h11M11 7l5 5-5 5"/>',
  edit: '<path d="M16 3 21 8 8 21H3v-5L16 3Z"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  group: '<path d="M4 7h16M4 12h10M4 17h13"/>',
  arrow: '<path d="M9 6 15 12 9 18"/>',
  favOn: '<path d="M12 3 14.5 8.5 20.5 9l-4.6 4 .1 5.5L12 16l-4 2.5L8 13l-4.5-4 6-.5L12 3Z"/>',
  export: '<path d="M12 14V4M5 9l7-5 7 5M4 14v6h16v-6"/>',
  import: '<path d="M12 8v10M7 13l5 5 5-5M4 7V4h16v3"/>',
  reset: '<path d="M5 8a8 8 0 1 1-1 6"/>',
  download: '<path d="M12 4v10M7 9l5 5 5-5M5 19h14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14M10 11v6M14 11v6"/>',
  exportUp: '<path d="M12 3v12m-5-5 5 5 5-5M4 19h16"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  open: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 11h8M8 14h5"/>',
  starbox: '<path d="M12 3l2.7 5.5 6 .9-4.35 4.2 1 6-5.35-2.8L6.65 19.6l1-6L3.3 9.4l6-.9L12 3z"/>'
};
function ico(n, s) { const b = ICO[n] || ICO.star; s = s || 16; return '<svg class="' + PREFIX + 'ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + b + '</svg>'; }

// ---- 居中窗容器（主子钦点：点悬浮球出居中小窗） ----
let rootEl = null, curView = 'home', curGroup = null;
function ensureRoot() {
  if (rootEl && rootEl.parentNode) return rootEl;
  rootEl = document.createElement('div');
  rootEl.id = PREFIX + 'root';
  rootEl.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;display:none;'
    + 'align-items:center;justify-content:center;padding:14px;'
    + 'background:rgba(24,28,34,.5);';   // 半透明遮罩，居中
  // 居中小窗
  const panel = document.createElement('div');
  panel.id = PREFIX + 'panel';
  panel.style.cssText = 'width:480px;max-width:94%;height:min(500px,92%);'
    + 'background:#fbfaf7;color:#26292e;border-radius:20px;overflow:hidden;'
    + 'box-shadow:0 18px 50px rgba(20,24,30,.35);display:flex;flex-direction:column;'
    + 'border:1px solid #ecebe7;position:relative;';
  rootEl.appendChild(panel);
  document.body.appendChild(rootEl);
  // 点遮罩空白（非小窗）关闭
  rootEl.addEventListener('click', function (e) {
    if (e.target === rootEl) close();
  });
  return rootEl;
}
function getPanel() { return document.getElementById(PREFIX + 'panel'); }
function open() { ensureRoot(); rootEl.style.display = 'flex'; curView = 'home'; curGroup = null;
  document.querySelectorAll('#' + PREFIX + 'modal').forEach(n => n.remove()); logEvent('open-面板', '初始groups=' + getGroups().length); render(); }
function close() { if (rootEl) rootEl.style.display = 'none'; document.querySelectorAll('#' + PREFIX + 'modal').forEach(n => n.remove()); }

// ---- 自绘弹窗（坑①WebView 禁 prompt/confirm，必用） ----
function thModal(title, bodyHTML, buttons) {
  const wrap = document.createElement('div'); wrap.id = PREFIX + 'modal';
  wrap.style.cssText = 'position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(30,34,40,.4);';
  const box = document.createElement('div'); box.className = PREFIX + 'modal';
  box.style.cssText = 'background:#fff;border:1px solid #ecebe7;border-radius:14px;width:min(300px,86%);padding:14px;box-shadow:0 10px 30px rgba(20,24,30,.2);color:#26292e;';
  box.innerHTML = '<div style="font-weight:700;margin-bottom:10px;color:#16263b;">' + title + '</div>' + bodyHTML;
  const row = document.createElement('div'); row.style.cssText = 'margin-top:12px;display:flex;gap:8px;justify-content:flex-end;';
  (buttons || []).forEach(b => { const bt = document.createElement('button'); bt.textContent = b.text;
    bt.style.cssText = 'border:0;border-radius:9px;padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer;' + (b.primary ? 'background:#16263b;color:#f6f5f1;' : 'background:#eef0f3;color:#2b4460;');
    bt.onclick = () => { wrap.remove(); if (b.cb) b.cb(); }; row.appendChild(bt); });
  box.appendChild(row); wrap.appendChild(box); const _tgt = getPanel(); (_tgt || document.body).appendChild(wrap); return box; }
function thPrompt(o) { return new Promise(res => { const box = thModal(o.title || '输入',
  '<input id="' + PREFIX + 'inp" value="' + esc(o.value || '') + '" style="width:100%;box-sizing:border-box;background:#fff;color:#26292e;border:1px solid #e3e2dd;border-radius:10px;padding:8px;font-size:14px;" placeholder="' + esc(o.placeholder || '') + '">',
  [{ text: o.cancelText || '取消', cb: () => res(null) }, { text: o.yesText || '确定', primary: true, cb: () => { const v = box.querySelector('#' + PREFIX + 'inp'); res(v ? v.value : null); } }]);
  const inp = box.querySelector('#' + PREFIX + 'inp'); if (inp) { inp.focus(); inp.select(); } }); }
function thConfirm(o) { return new Promise(res => { thModal(o.title || '确认',
  '<div style="color:#5b5f66;font-size:14px;line-height:1.6;">' + (o.text || '') + '</div>',
  [{ text: o.cancelText || '取消', cb: () => res(false) }, { text: o.yesText || '确定', primary: true, cb: () => res(true) }]); }); }
// ---- 正方形条目窗：上标题 + 正方形内容块 ----
function thSquare(o) {
  return new Promise(res => {
    // 清掉可能残留的旧弹窗，避免叠层盖住顶栏
    document.querySelectorAll('#' + PREFIX + 'modal').forEach(n => n.remove());
    const wrap = document.createElement('div'); wrap.id = PREFIX + 'modal';
    wrap.style.cssText = 'position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(30,34,40,.4);';
    const box = document.createElement('div');
    box.style.cssText = 'width:min(300px,88%);aspect-ratio:1/1.05;background:#fff;border:1px solid #ecebe7;border-radius:16px;'
      + 'padding:14px;box-shadow:0 12px 34px rgba(20,24,30,.2);display:flex;flex-direction:column;';
    box.innerHTML =
      '<div style="font-weight:700;font-size:14px;color:#16263b;margin-bottom:10px;">' + (o.title || '标题') + '</div>'
      + '<input id="' + PREFIX + 'sq_title" value="' + esc(o.valueTitle || o.value || '') + '" placeholder="' + esc(o.placeholderTitle || '标题，可留空') + '"'
      + ' style="width:100%;box-sizing:border-box;background:#fbfaf7;color:#26292e;border:1px solid #e3e2dd;border-radius:10px;padding:8px 10px;font-size:13px;outline:none;margin-bottom:10px;">'
      + '<textarea id="' + PREFIX + 'sq_body" placeholder="' + esc(o.placeholder || '支持 {{user}} {{char}}') + '"'
      + ' style="flex:1;width:100%;min-height:0;box-sizing:border-box;background:#fbfaf7;color:#26292e;border:1px solid #e3e2dd;border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.6;resize:none;outline:none;font-family:inherit;">' + esc(o.valueBody || '') + '</textarea>';
    const row = document.createElement('div'); row.style.cssText = 'margin-top:12px;display:flex;gap:8px;justify-content:flex-end;';
    [ { text: o.cancelText || '取消', primary: 0, cb: () => res(null) },
      { text: o.yesText || '保存', primary: 1, cb: () => { const t = box.querySelector('#' + PREFIX + 'sq_title'); const b = box.querySelector('#' + PREFIX + 'sq_body'); res({ title: t ? t.value : '', content: b ? b.value : '' }); } }
    ].forEach(bb => { const bt = document.createElement('button'); bt.textContent = bb.text;
      bt.style.cssText = 'border:0;border-radius:9px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;' + (bb.primary ? 'background:#16263b;color:#f6f5f1;' : 'background:#eef0f3;color:#2b4460;');
      bt.onclick = () => { wrap.remove(); bb.cb(); }; row.appendChild(bt); });
    box.appendChild(row); wrap.appendChild(box);
    const tgt = getPanel(); (tgt || document.body).appendChild(wrap);
    const ti = box.querySelector('#' + PREFIX + 'sq_title'); if (ti) { ti.focus(); }
  });
}
let toastT = null;
function toast(m) { let t = document.getElementById(PREFIX + 'toast'); if (!t) { t = document.createElement('div'); t.id = PREFIX + 'toast';
  t.style.cssText = 'position:fixed;left:50%;bottom:30px;transform:translateX(-50%);background:#16263b;color:#f6f5f1;padding:7px 14px;border-radius:8px;font-size:13px;z-index:100000;box-shadow:0 4px 16px rgba(20,24,30,.35);opacity:0;transition:opacity .2s;'; document.body.appendChild(t); }
  t.textContent = m; t.style.opacity = '1'; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = '0'; }, 1500); }

// ---- 点击回调注册表 ----
const clickHandlers = {}; let hSeq = 1;
function reg(fn) { const h = 'h' + (hSeq++); clickHandlers[h] = fn; return h; }
function runH(h) { try { if (clickHandlers[h]) clickHandlers[h](); } catch (e) { console.warn('[小剧场] 回调失败:', e); } }

// ---- 渲染缓冲：外层容器每屏重建 ----
function goHome() { curView = 'home'; curGroup = null; _curItem = null; render(); }
function openSettings() { curView = 'settings'; render(); }
function openGroup(name) { curView = 'group'; curGroup = name; _curItem = null; render(); }
let _curItem = null;   // 当前查看/编辑的条目定位 {src, idx}
let _scrollMem = null;    // 组列表滚动位置记忆：编辑/查看条目返回后还原 scrollTop
function _saveScroll() {   // 进入详情前，记住当前组列表的滚动位置
  try { const p = getPanel(); if (!p) return; const sc = p.querySelector('.' + PREFIX + 'body'); if (sc) _scrollMem = sc.scrollTop; } catch (e) {}
}
function _restoreScroll() {  // 返回组列表后，还原滚动位置
  if (_scrollMem == null) return;
  try { const p = getPanel(); if (!p) return; const sc = p.querySelector('.' + PREFIX + 'body'); if (sc) sc.scrollTop = _scrollMem; } catch (e) {}
  _scrollMem = null;
}

function render() {
  try {
    ensureRoot();
    const panel = getPanel();
    if (!panel) { console.warn('[小剧场] 找不到 panel'); return; }
    const ctx = getCtx();
    let html = '';
    if (curView === 'home') html = renderHome();
    else if (curView === 'group') html = renderGroupView(ctx);
    else if (curView === 'item') html = renderItemDetail(ctx);
    else html = renderSettingsView(ctx);
    html += renderDebugBar();          // 底部扁扁一条完整诊断日志
    panel.innerHTML = html;
    bindUI(panel);
    if (curView === 'group') _restoreScroll();
    console.log('[小剧场·诊断] render', curView, curGroup);
  } catch (e) {
    console.error('[小剧场] render 异常:', e);
    try { const p = getPanel(); if (p) p.innerHTML = '<div class="' + PREFIX + 'empty" style="white-space:pre-wrap;word-break:break-word;">加载出错：' + esc((e && e.message) || String(e)) + '</div>'; } catch (e2) {}
  }
}

// 打开某条的详情/编辑视图（点标题栏进入）
function openItem(src, idx) { _saveScroll(); _curItem = { src: src, idx: idx }; curView = 'item'; render(); }
// 从详情返回组列表
function goGroupBack() { _curItem = null; curView = 'group'; render(); }

// 详情/编辑视图：右上角 ✕ 返回列表；标题+内容可编辑，底部 保存/删除
function renderItemDetail(ctx) {
  if (!_curItem) { goGroupBack(); return ''; }
  const gs = getGroups();
  const g = findGroup(gs, _curItem.src, false);
  const loc = (g && g.items[_curItem.idx]) ? { it: g.items[_curItem.idx], g: g } : null;
  if (!loc) { toast('这条不存在'); goGroupBack(); return ''; }
  const it = loc.it;
  let h = topBar('小剧场详情', '', () => goGroupBack());   // 左侧 ✕ = 返回组列表
  h += '<div class="' + PREFIX + 'body"><div class="' + PREFIX + 'list">';

  // 标题
  h += '<div class="' + PREFIX + 'mlabel">标题</div>'
    + '<input class="' + PREFIX + 'inp" id="' + PREFIX + 'det_title" value="' + esc(it.title || '') + '" placeholder="一句话标题" style="width:100%;margin-bottom:12px;">';
  // 内容（大文本域）
  h += '<div class="' + PREFIX + 'mlabel">内容（可用 {{user}} {{char}}）</div>'
    + '<textarea id="' + PREFIX + 'det_body" class="' + PREFIX + 'det-text" placeholder="输入小剧场正文…">' + esc(it.content || '') + '</textarea>';

  // 操作
  h += '<div class="' + PREFIX + 'btns" style="margin-top:12px;">'
    + '<button class="' + PREFIX + 'btn primary" data-handle="' + reg(() => saveItemDetail()) + '">保存</button>'
    + '<button class="' + PREFIX + 'btn ghost" data-handle="' + reg(() => sendFileDetail()) + '">发送</button>'
    + '</div>';

  h += '</div></div>';
  return h;
}

// 保存详情编辑
function saveItemDetail() {
  if (!_curItem) return;
  const gs = getGroups();
  const g = findGroup(gs, _curItem.src, false);
  if (!g || !g.items[_curItem.idx]) return;
  const t = document.getElementById(PREFIX + 'det_title');
  const b = document.getElementById(PREFIX + 'det_body');
  g.items[_curItem.idx].title = (t ? t.value : '').trim() || g.items[_curItem.idx].title || '未命名';
  g.items[_curItem.idx].content = b ? b.value : '';
  saveGroups(gs);
  toast('已保存');
  goGroupBack();
}
// 详情里直接发送这条（替换后）
function sendFileDetail() {
  if (!_curItem) return;
  const t = grabText(_curItem.src, _curItem.idx);
  if (t) sendText(t); else toast('内容为空');
}

function topBar(title, actions, back, titleExtra) {
  let h = '<div class="' + PREFIX + 'top">';
  let leftH = back ? goHome : close;
  let leftIco = back ? 'back' : 'close';
  if (typeof back === 'function') { leftH = back; leftIco = 'close'; }
  h += '<span class="' + PREFIX + 'topbtn" data-handle="' + reg(leftH) + '">' + ico(leftIco, 15) + '</span>';
  h += '<span class="' + PREFIX + 'toptitle">' + esc(title) + (titleExtra || '') + '</span>';
  h += '<span class="' + PREFIX + 'topacts">' + (actions || '') + '</span></div>';
  return h;
}
function topIcon(name, handler) { return '<span class="' + PREFIX + 'topbtn" data-handle="' + reg(handler) + '">' + ico(name, 15) + '</span>'; }

// ---- 首页：组单列流 ----
function renderHome() {
  const gs = getGroups();
  const favCount = gs.reduce((s, g) => s + safeItems(g).filter(i => i.fav).length, 0);
  const sel = (window.__thSel === true && window.__selType === 'group');
  // 主页：收藏 ▶ 图标紧贴「小剧场」标题旁（titleExtra），右侧=✓多选/新建/齿轮；左=✕回酒馆。
  const favIcon = '<span class="' + PREFIX + 'toptitlefav" data-handle="' + reg(() => { favOpenView(); }) + '">' + ico('folder', 15) + '</span>';
  let h = topBar('小剧场',
    topIcon('check', () => toggleSelect('group'))
    + topIcon('plus', () => newGroup())
    + topIcon('gear', () => openSettings()), false, favIcon);
  h += '<div class="' + PREFIX + 'body"><div class="' + PREFIX + 'list">';
  if (sel) {
    h += '<div class="' + PREFIX + 'carbar">'
      + '<button class="' + PREFIX + 'btn" data-handle="' + reg(() => selAll()) + '">全选</button>'
      + '<button class="' + PREFIX + 'btn ghost" data-handle="' + reg(() => selNone()) + '">取消</button>'
      + '<span class="' + PREFIX + 'carbar-sp"></span>'
      + '<button class="' + PREFIX + 'btn danger" data-handle="' + reg(() => delSelectedGroups()) + '">' + ico('trash', 13) + '删除' + '</button>'
      + '</div>';
  }
  h += groupCardSel('★收藏', favCount, 'star', () => openGroup('★收藏'), sel, '__fav', 0);
  if (!gs.length) h += empty('还没有小剧场，点右上角 + 新建分组');
  gs.forEach((g, i) => h += groupCardSel(g.name, safeItems(g).length, 'group', () => openGroup(g.name), sel, g.name, i));
  if (!sel) h += '<div style="height:8px"></div>';
  h += '</div></div>';
  return h;
}
function groupCard(name, count, icon, handler) {
  return '<div class="' + PREFIX + 'card" data-handle="' + reg(handler) + '">'
    + '<span class="' + PREFIX + 'cardico">' + ico(icon, 16) + '</span>'
    + '<span class="' + PREFIX + 'cardname">' + esc(name) + '</span>'
    + '<span class="' + PREFIX + 'cardcount">' + count + '</span>'
    + '<span class="' + PREFIX + 'cardarrow">' + ico('arrow', 13) + '</span></div>';
}
// 组卡（多选版）：多选模式显示勾选框
function groupCardSel(name, count, icon, handler, sel, selKey, idx) {
  let chk = '';
  if (sel) {
    const on = window.__selSet && window.__selSet.has(name);
    chk = '<span class="' + PREFIX + 'selbox' + (on ? ' on' : '') + '" data-sel="' + esc(name) + '" data-handle="' + reg(() => selToggleGroup(name)) + '">'
      + (on ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>' : '') + '</span>';
  }
  return '<div class="' + PREFIX + 'card' + (sel ? ' ' + PREFIX + 'selmode' : '') + '" data-handle="' + reg(sel ? (() => selToggleGroup(name)) : handler) + '">'
    + chk
    + '<span class="' + PREFIX + 'cardico">' + ico(icon, 16) + '</span>'
    + '<span class="' + PREFIX + 'cardname">' + esc(name) + '</span>'
    + '<span class="' + PREFIX + 'cardcount">' + count + '</span>'
    + '<span class="' + PREFIX + 'cardarrow">' + ico('arrow', 13) + '</span></div>';
}
// 切换多选模式
function toggleSelect(type) {
  if (window.__thSel && window.__selType === type) {
    window.__thSel = false; window.__selType = null; window.__selSet = new Set();
  } else {
    window.__thSel = true; window.__selType = type; window.__selSet = new Set();
  }
  render();
}
function selToggleGroup(name) { const s = window.__selSet; if (s.has(name)) s.delete(name); else s.add(name); render(); }
function selToggleItem(src, idx) {
  const s = window.__selSet; const k = src + '|' + idx;
  if (s.has(k)) s.delete(k); else s.add(k); render();
}
function selAll() {
  const s = window.__selSet; s.clear();
  if (window.__selType === 'group') getGroups().forEach(g => s.add(g.name));
  else {
    if (curGroup === '★收藏') getGroups().forEach(g => safeItems(g).forEach((it, idx) => { if (it.fav) s.add(g.name + '|' + idx); }));
    else { const g = findGroup(getGroups(), curGroup, false); safeItems(g).forEach((it, idx) => s.add(curGroup + '|' + idx)); }
  }
  render();
}
function selNone() { window.__selSet = new Set(); render(); }
function empty(t) { return '<div class="' + PREFIX + 'empty">' + esc(t) + '</div>'; }

// ---- 组内：条目单列流 ----
function renderGroupView(ctx) {
  const isFav = curGroup === '★收藏';
  let items;
  if (isFav) { items = []; getGroups().forEach(g => safeItems(g).forEach((it, idx) => { if (it.fav) items.push({ item: it, src: g.name, idx: idx }); })); }
  else { const g = findGroup(getGroups(), curGroup, false); items = safeItems(g).map((it, idx) => ({ item: it, src: curGroup, idx: idx })); }
  const dbgG = findGroup(getGroups(), curGroup, false);
  const dbgCnt = dbgG ? safeItems(dbgG).length : -1;
  logEvent('render组', '组=' + curGroup + ' read=' + dbgCnt + ' 组存在=' + !!dbgG);
  // 条目多选模式是否开启
  const selItem = (window.__thSel === true && window.__selType === 'item');
  // 头栏：左=返回back；右=✓多选 + (组内)新增 + (收藏)导出(正确图标) + ✕回酒馆
  const grpHdr = topIcon('check', () => toggleSelect('item'))
    + (isFav
       ? topIcon('exportUp', () => exportAll())
       : topIcon('plus', () => newItem(curGroup)))
    + topIcon('close', () => close());   // ✕ 直接关面板回酒馆
  let h = topBar(curGroup, grpHdr, true);
  h += '<div class="' + PREFIX + 'body"><div class="' + PREFIX + 'list">';
  // 多选工具条
  if (selItem) {
    h += '<div class="' + PREFIX + 'carbar">'
      + '<button class="' + PREFIX + 'btn" data-handle="' + reg(() => selAll()) + '">全选</button>'
      + '<button class="' + PREFIX + 'btn ghost" data-handle="' + reg(() => selNone()) + '">取消</button>'
      + '<span class="' + PREFIX + 'carbar-sp"></span>'
      + '<button class="' + PREFIX + 'btn danger" data-handle="' + reg(() => delSelectedItems()) + '">' + ico('trash', 13) + '删除' + '</button>'
      + '</div>';
  }
  if (!items.length) h += empty(isFav ? '还未收藏任何条目' : '这个分组是空的');
  const cm = getChatMap(ctx), gm = getGlobalMap();
  const names = resolveNames({ name: currentCharName(ctx) }, cm, gm);
  items.forEach(o => {
    if (selItem) {
      // 多选模式：只显示勾选框 + 标题
      const key = o.src + '|' + o.idx;
      const on = window.__selSet && window.__selSet.has(key);
      h += '<div class="' + PREFIX + 'itemrow ' + PREFIX + 'selmode" data-handle="' + reg(() => selToggleItem(o.src, o.idx)) + '">'
        + '<span class="' + PREFIX + 'selbox' + (on ? ' on' : '') + '">' + (on ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>' : '') + '</span>'
        + '<span class="' + PREFIX + 'ititle">' + esc(o.item.title || '') + '</span>'
        + '</div>';
    } else {
      // 普通模式：标题（点击进详情编辑）+ 收藏星 + 发送/填框
      h += '<div class="' + PREFIX + 'itemrow" data-handle="' + reg(() => openItem(o.src, o.idx)) + '">'
        + '<span class="' + PREFIX + 'ititle">' + esc(o.item.title || '') + '</span>'
        + '<span class="' + PREFIX + 'irowacts">'
        + '<span class="' + PREFIX + 'ifav' + (o.item.fav ? ' ' + PREFIX + 'favon' : '') + '" data-handle="' + reg(() => toggleFav(o.src, o.idx)) + '" title="收藏">' + ico(o.item.fav ? 'favOn' : 'star', 15) + '</span>'
        + '<span class="' + PREFIX + 'act on" data-handle="' + reg(() => sendGrab(o.src, o.idx)) + '" title="发送">' + ico('send', 13) + '</span>'
        + '<span class="' + PREFIX + 'act" data-handle="' + reg(() => fillGrab(o.src, o.idx)) + '" title="填框">' + ico('fill', 13) + '</span>'
        + '</span>'
        + '</div>';
    }
  });
  h += '</div></div>';
  return h;
}

// ---- 设置屏：新手友好 · 作用范围 + 名字替换 + 备份 ----
function renderSettingsView(ctx) {
  const cm = getChatMap(ctx), gm = getGlobalMap();
  let scope = (window.__thScope === 1 || window.__thScope === 0) ? window.__thScope : (gm.current != null ? 1 : 0);
  const activeMap = scope === 1 ? gm : cm;
  const activeIsGlobal = scope === 1;
  // 内存草稿：没选组时也暂存替换名称卡里的内容，避免退出丢失
  if (!window.__thDraft) window.__thDraft = { user: '', char: '', extra: [] };
  const curName = activeMap.current;
  const cur = curName != null ? activeMap.groups.find(x => x.name === curName) : null;
  // 当前填写的来源：已选组读组里，没选组读草稿
  const src = cur ? cur : window.__thDraft;
  if (!Array.isArray(src.extra)) src.extra = [];
  // 输入写回：有当前组直接写当前组+落库，没当前组写草稿
  window.__thOnEdit = function (which, kind, val, ei, field) {
    const isG = which >= 1;
    const map = isG ? getGlobalMap() : getChatMap(getCtx());
    const d = window.__thDraft || { user: '', char: '', extra: [] };
    const t = map.current != null ? map.groups.find(x => x.name === map.current) : null;
    if (kind === 'user' || kind === 'char') {
      if (t) t[kind] = val; else d[kind] = val;
    } else if (ei != null) {
      const arr = (t || d).extra; if (!Array.isArray(arr)) arr = []; (t || d).extra = arr;
      if (!arr[ei]) arr[ei] = { from: '', to: '' };
      arr[ei][field] = val;
    }
    if (t) { if (isG) saveGlobalMap(map); else saveChatMap(getCtx(), map); }
  };
  // 新增一行自定义替换（which: >=1=全局, 0=聊天）
  window.__thAddExtra = function (which) {
    const isG = which >= 1;
    const map = isG ? getGlobalMap() : getChatMap(getCtx());
    const d = window.__thDraft || { user: '', char: '', extra: [] };
    const t = map.current != null ? map.groups.find(x => x.name === map.current) : null;
    const arr = (t || d).extra; if (!Array.isArray(arr)) arr = []; (t || d).extra = arr;
    arr.push({ from: '', to: '' });
    if (t) { if (isG) saveGlobalMap(map); else saveChatMap(getCtx(), map); }
    render();
  };
  // 删一行自定义替换（which, ei）
  window.__thDelExtra = function (which, ei) {
    const isG = which >= 1;
    const map = isG ? getGlobalMap() : getChatMap(getCtx());
    const d = window.__thDraft || { user: '', char: '', extra: [] };
    const t = map.current != null ? map.groups.find(x => x.name === map.current) : null;
    const arr = (t || d).extra; if (Array.isArray(arr)) arr.splice(ei, 1);
    if (t) { if (isG) saveGlobalMap(map); else saveChatMap(getCtx(), map); }
    render();
  };
  window.__thSetScope = function (s) { window.__thScope = s === 1 ? 1 : 0; render(); };

  let h = topBar('设置', topIcon('close', () => close()), true);
  h += '<div class="' + PREFIX + 'body"><div class="' + PREFIX + 'list">';
  // ---- 卡1：替换名称 ----
  h += '<div class="' + PREFIX + 'seccard">'
    + '<div class="' + PREFIX + 'secti">' + ico('group', 15) + '<i>替换名称</i></div>';
  const scopeTag = activeIsGlobal ? '全局' : '当前聊天';
  h += '<div class="' + PREFIX + 'used"><span class="' + PREFIX + 'scopetag">' + esc(scopeTag) + '</span> '
    + (cur ? '当前：' + esc(cur.name) + '（' + esc(cur.user || '—') + ' ↔ ' + esc(cur.char || '—') + '）' : '还没设，填好后点下方「建立新组」或选一组') + '</div>';
  const which = activeIsGlobal ? 2 : 0;
  h += '<div class="' + PREFIX + 'name-row"><span class="' + PREFIX + 'who">你</span>'
    + '<input class="' + PREFIX + 'inp" data-map-kind="user" data-map-src="' + which + '" value="' + esc(src.user || '') + '" placeholder="填你的名字"></div>';
  h += '<div class="' + PREFIX + 'name-row"><span class="' + PREFIX + 'who small">角色 / 对方</span>'
    + '<input class="' + PREFIX + 'inp" data-map-kind="char" data-map-src="' + which + '" value="' + esc(src.char || '') + '" placeholder="填角色名字"></div>';
  h += '<hr class="' + PREFIX + 'sep">';
  const extra = src.extra;
  if (!extra.length) h += '<div class="' + PREFIX + 'extraempty">还没有自定义替换</div>';
  else {
    extra.forEach((e, ei) => {
      h += '<div class="' + PREFIX + 'maprow">'
        + '<input class="' + PREFIX + 'inp" data-extra-i="' + ei + '" data-extra-field="from" data-map-src="' + which + '" value="' + esc(e && e.from || '') + '" placeholder="要替换的词">'
        + '<span class="' + PREFIX + 'arr">' + ico('arrow', 12) + '</span>'
        + '<input class="' + PREFIX + 'inp" data-extra-i="' + ei + '" data-extra-field="to" data-map-src="' + which + '" value="' + esc(e && e.to || '') + '" placeholder="替换成什么">'
        + '<span class="' + PREFIX + 'delbtn" data-del-extra="' + ei + '" data-map-src="' + which + '" title="删掉这行">' + ico('close', 13) + '</span>'
        + '</div>';
    });
  }
  h += '<button class="' + PREFIX + 'addbtn" data-add-extra data-map-src="' + which + '">' + ico('plus', 13) + '<i>新增替换</i></button>';
  h += '</div>';
  // ---- 卡2：作用范围（二选一勾选） ----
  h += '<div class="' + PREFIX + 'seccard">'
    + '<div class="' + PREFIX + 'secti">' + ico('globe', 15) + '<i>作用范围</i></div>'
    + '<div class="' + PREFIX + 'hint">这一套名字用在哪些地方？</div>'
    + '<div class="' + PREFIX + 'checks">'
    + chkLine(1, scope === 1, '全局', '换到任何聊天记录都是这一套')
    + chkLine(0, scope === 0, '聊天记录', '只对当前聊天生效，新开聊天记录是空的')
    + '</div></div>';
  // ---- 卡3：分组管理（保存当前组 / 建立新组） ----
  h += '<div class="' + PREFIX + 'seccard">'
    + '<div class="' + PREFIX + 'secti">' + ico('star', 15) + '<i>分组管理</i></div>'
    + '<div class="' + PREFIX + 'hint">把你填好的名字存进当前组，或另起一个新组。</div>';
  let tags = activeMap.groups.map(g =>
    '<span class="' + PREFIX + 'grp' + ((activeMap.current === g.name) ? ' on' : '') + '" data-handle="' + reg(() => {
      activeMap.current = g.name;
      if (activeIsGlobal) saveGlobalMap(activeMap); else saveChatMap(ctx, activeMap);
      toast('已切换到「' + g.name + '」');
      render();
    }) + '">' + esc(g.name) + '</span>'
  ).join('');
  if (!tags) tags = '<div class="' + PREFIX + 'extraempty">（还没有组，点下方「建立新组」）</div>';
  else tags = '<div class="' + PREFIX + 'tagbar">' + tags + '</div>';
  h += tags;
  h += '<div class="' + PREFIX + 'btns">'
    + '<button class="' + PREFIX + 'btn primary" data-handle="' + reg(() => saveCurrentGroup(ctx, activeMap, activeIsGlobal)) + '">保存当前组</button>'
    + '<button class="' + PREFIX + 'btn ghost" data-handle="' + reg(() => buildNewGroup(ctx, activeMap, activeIsGlobal)) + '">建立新组</button>'
    + '</div></div>';
  // ---- 备份恢复（保留） ----
  h += '<div class="' + PREFIX + 'seccard">'
    + '<div class="' + PREFIX + 'secti">' + ico('export', 14) + '<i>备份与恢复</i></div>'
    + '<div class="' + PREFIX + 'hint">把你的小剧场和称呼设置存成文件，换设备或怕丢失时用。</div>'
    + '<div class="' + PREFIX + 'row2in" style="margin-top:10px;">'
    + '<button class="' + PREFIX + 'fbtn primary" data-handle="' + reg(() => exportAll()) + '">' + ico('export', 13) + '<i>导出备份</i></button>'
    + '<button class="' + PREFIX + 'fbtn" data-handle="' + reg(() => importAll()) + '">' + ico('import', 13) + '<i>导入备份</i></button>'
    + '<button class="' + PREFIX + 'fbtn danger" data-handle="' + reg(() => resetAll()) + '">' + ico('close', 13) + '<i>清空重置</i></button>'
    + '<button class="' + PREFIX + 'fbtn" data-handle="' + reg(() => favExportZip()) + '">' + ico('exportUp', 13) + '<i>导出ZIP</i></button>'
    + '<button class="' + PREFIX + 'fbtn" data-handle="' + reg(() => favImportZip()) + '">' + ico('import', 13) + '<i>导入ZIP</i></button>'
    + '</div></div>';
  // ---- 卡：AI 回复提示音（details 折叠） ----
  const nOn = notifyOn();
  h += '<div class="' + PREFIX + 'seccard"><details class="' + PREFIX + 'det">'
    + '<summary class="' + PREFIX + 'secti">' + ico('chat', 15)
    + '<i>AI 回复提示音</i>'
    + '<span class="' + PREFIX + 'notify-tag' + (nOn ? '' : ' off') + '">' + (nOn ? '开' : '关') + '</span>'
    + '</summary>'
    + '<div class="' + PREFIX + 'hint" style="margin-top:8px;">AI 回复生成完就响一声，提示你回酒馆。用一张「开关 + 预览」控制。</div>'
    + '<div class="' + PREFIX + 'chk" data-handle="' + reg(() => { notifySetOn(!notifyOn()); render(); }) + '">'
    + '<span class="' + PREFIX + 'box' + (nOn ? ' on' : '') + '">' + (nOn ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>' : '') + '</span>'
    + '<span><span class="' + PREFIX + 'lab">启用提示音</span><div class="' + PREFIX + 'sub">' + (nOn ? '开着，AI 回复完会响' : '已关闭') + '</div></span>'
    + '</div>'
    + '<div class="' + PREFIX + 'btns" style="margin-top:6px;">'
    + '<button class="' + PREFIX + 'btn ghost" data-handle="' + reg(() => notifyPreview()) + '">' + ico('play', 13) + '<i>试听一下</i></button>'
    + '</div>'
    + '</details></div>';
  h += thSettingsExt();       // 全局加固卡：作为普通卡片进入滚动列表（随页面上下滚）
  h += '</div></div>';
  return h;
}
function chkLine(s, on, lab, sub) {
  return '<div class="' + PREFIX + 'chk" data-handle="' + reg(() => {
    if (window.__thSetScope) window.__thSetScope(s);
  }) + '">'
    + '<span class="' + PREFIX + 'box' + (on ? ' on' : '') + '">' + (on ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>' : '') + '</span>'
    + '<span><span class="' + PREFIX + 'lab">' + esc(lab) + '</span><div class="' + PREFIX + 'sub">' + esc(sub) + '</div></span>'
    + '</div>';
}

// ---- 事件委托绑定（坑④日志后断言） ----
function bindUI(root) {
  root.onclick = function (e) {
    // 1) 删除自定义替换行
    const del = e.target.closest('[data-del-extra]');
    if (del && del.getAttribute('data-del-extra') != null) {
      e.preventDefault(); e.stopPropagation();
      const ei = parseInt(del.getAttribute('data-del-extra'), 10);
      const which = parseInt(del.getAttribute('data-map-src'), 10) || 0;
      if (window.__thDelExtra) window.__thDelExtra(which, ei);
      return;
    }
    // 2) 新增自定义替换行
    const add = e.target.closest('[data-add-extra]');
    if (add) {
      e.preventDefault(); e.stopPropagation();
      const which = parseInt(add.getAttribute('data-map-src'), 10) || 0;
      if (window.__thAddExtra) window.__thAddExtra(which);
      return;
    }
    // 3) 普通注册回调
    const el = e.target.closest('[data-handle]');
    if (el && el.getAttribute('data-handle')) { e.preventDefault(); runH(el.getAttribute('data-handle')); }
  };
  // 宏映射输入框实时落库（data-map-kind 或 data-extra-i，均带 data-map-src）
  root.oninput = function (e) {
    const el = e.target;
    if (!el || !el.getAttribute) return;
    const which = parseInt(el.getAttribute('data-map-src'), 10) || 0;
    if (el.getAttribute('data-map-kind')) {
      const kind = el.getAttribute('data-map-kind');
      if (window.__thOnEdit) window.__thOnEdit(which, kind, el.value);
    } else if (el.getAttribute('data-extra-i') != null) {
      const ei = parseInt(el.getAttribute('data-extra-i'), 10);
      const field = el.getAttribute('data-extra-field') || 'from';
      if (window.__thOnEdit) window.__thOnEdit(which, 'extra', el.value, ei, field);
    }
  };
}

// ---- 组 & 条目操作 ----
function newGroup() { thPrompt({ title: '新建分组', placeholder: '组名', yesText: '创建' }).then(n => { if (!n) { logEvent('newGroup-取消'); return; } const g = getGroups(); if (g.find(x => x.name === n)) { toast('分组已存在'); logEvent('newGroup-已存在', n); return; } g.push({ name: n, items: [] }); saveGroups(g); logEvent('newGroup-成功', '名字=' + n + ' 总组数=' + g.length); render(); }); }
function newItem(gn) { thSquare({ title: '写一条小剧场', placeholderTitle: '标题，可留空' }).then(r => { if (!r) { toast('已取消'); return; } const gs = getGroups(); const g = findGroup(gs, gn, true); if (!g) { toast('找不到分组'); return; } g.items.push({ title: (r.title || '').trim(), content: r.content || '', fav: false }); saveGroups(gs); logEvent('newItem', '组=' + gn + ' 现有 ' + g.items.length + ' 条'); toast('已保存 ' + g.items.length + ' 条'); render(); }); }
function toggleFav(src, idx) { const gs = getGroups(); const g = findGroup(gs, src, false); if (g && g.items[idx]) { g.items[idx].fav = !g.items[idx].fav; saveGroups(gs); logEvent('toggleFav', src); render(); } }
function editItem(src, idx) { const gs = getGroups(); const g = findGroup(gs, src, false); const it = g && g.items[idx]; if (!it) return; thSquare({ title: '编辑小剧场', placeholderTitle: '标题，可留空', valueTitle: it.title, valueBody: it.content }).then(r => { if (!r) return; it.title = (r.title || '').trim(); it.content = r.content || ''; saveGroups(gs); logEvent('editItem', src); render(); }); }
async function delItem(src, idx) { const ok = await thConfirm({ title: '删除条目', text: '确定删除这条吗？', yesText: '删除' }); if (!ok) return; const gs = getGroups(); const g = findGroup(gs, src, false); if (g && g.items[idx] !== undefined) g.items.splice(idx, 1); saveGroups(gs); logEvent('delItem', src); render(); }

// 批量删除条目（收藏视图或组内，多条跨组删除，带自绘确认）
async function delSelectedItems() {
  const s = window.__selSet || new Set();
  if (!s.size) { toast('还没勾选任何条目'); return; }
  const ok = await thConfirm({ title: '删除所选条目', text: '确定删除已勾选的 ' + s.size + ' 条小剧场吗？', yesText: '删除' });
  if (!ok) return;
  // 按 组名|idx 动态收集（索引会变，倒序删）。这里重建所有定位。
  const gs = getGroups();
  const kills = [];   // {gsRef, g, idx}
  getGroups().forEach(g => safeItems(g).forEach((it, idx) => {
    const k = g.name + '|' + idx;
    if (s.has(k)) {
      // 记得此刻引用 + 组内同序号：先存 组名→所有要删的idx
      kills.push({ gName: g.name, idx: idx });
    }
  }));
  // 收藏里也可能有（src 是源组，idx 是源组内下标）
  // 若处于普通组视图，遍历当前组即可。但为保证跨组正确，按 kills 整理
  const byGroup = {};
  kills.forEach(k => { if (!byGroup[k.gName]) byGroup[k.gName] = []; byGroup[k.gName].push(k.idx); });
  Object.keys(byGroup).forEach(gName => {
    const g = findGroup(gs, gName, false);
    if (!g) return;
    const idxs = byGroup[gName].sort((a, b) => b - a);   // 从大到小删
    idxs.forEach(i => { if (g.items[i] !== undefined) g.items.splice(i, 1); });
  });
  saveGroups(gs);
  window.__selSet = new Set();
  render();
  toast('已删除所选条目');
}
// 批量删除分组（主页多选）
async function delSelectedGroups() {
  const s = window.__selSet || new Set();
  if (!s.size) { toast('还没勾选任何分组'); return; }
  const ok = await thConfirm({ title: '删除所选分组', text: '确定删除已勾选的 ' + s.size + ' 个分组及其中的全部小剧场吗？', yesText: '删除' });
  if (!ok) return;
  const gs = getGroups().filter(g => !s.has(g.name));
  saveGroups(gs);
  window.__selSet = new Set();
  render();
  toast('已删除所选分组');
}

// ---- 发送到聊天 / 填输入框（改写成用户发言 或 只填空） ----
// 填框（只填进输入框，不自动发）
function fillBox(text) {
  try {
    const ta = document.getElementById('send_textarea');
    if (ta) { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); toast('已填入输入框'); return; }
    toast('找不到输入框');
  } catch (e) { console.warn('[小剧场] 填框失败:', e); }
}
// 直接发送：作为用户发言把这条小剧场放进酒馆聊天气泡（加入聊天记录）
// 【修复 v3】根治"时灵时不灵 / 发出去不上屏 / reload崩溃"：
//  · ctx.chat.push + saveChat（落盘稳定）
//  · 不用 reloadCurrentChat（会整段重绘崩成1条）
//  · 不用 MESSAGE_SENT 单独驱动（这个客户端里它不渲染气泡）
//  · 改为【克隆最后一条气泡 → 换内容 → 插到 #chat 末尾 → 滚到底】，稳上屏不崩。
function sendText(text) {
  if (!text) { toast('内容为空'); logEvent('发送-内容空', '返回'); return; }
  try {
    logEvent('发送-开始', 'text=' + (text.length > 60 ? text.slice(0, 60) + '…' : text));
    const ctx = getCtx();
    const chatIsArray = !!(ctx && Array.isArray(ctx.chat));
    const beforeMes = document.querySelectorAll('.mes').length;
    logEvent('发送-上下文', 'chatIsArray=' + chatIsArray
      + ' | chat_len=' + (chatIsArray ? ctx.chat.length : '-')
      + ' | onScreen_mes=' + beforeMes);
    if (!ctx || !Array.isArray(ctx.chat)) { logEvent('发送-无聊天', '降级填框'); fillBox(text); return; }
    const u = ctx.name1 || 'user';
    const beforeLen = ctx.chat.length;
    const hasSave = typeof ctx.saveChat === 'function';
    // 追加一条标准用户消息
    ctx.chat.push({
      name: u, is_user: true, is_system: false, is_name: true,
      send_date: Date.now() / 1000, mes: text,
      swipes: [], swipe_info: {}, swipes_total: 0, swipe_cur: 0,
      extra: { isSmallSys: false, token_count: 0, reasoning: '', hidden: false }
    });
    logEvent('发送-push完成', 'beforeLen=' + beforeLen + ' | afterLen=' + ctx.chat.length
      + ' | lastMes_len=' + String((ctx.chat[ctx.chat.length - 1] || {}).mes || '').length
      + ' | lastMes_is_user=' + !!(ctx.chat[ctx.chat.length - 1] || {}).is_user);
    // 落盘
    if (hasSave) { try { ctx.saveChat(); logEvent('发送-saveChat', 'ok'); } catch (e2) { logEvent('发送-saveChat', '抛错:' + (e2 && e2.message)); } }
    else { logEvent('发送-saveChat', '无此函数'); }
    // —— 核心：克隆最后一条气泡，换内容，插入 #chat 末尾（增量渲染，不整段重绘） ——
    const newNode = injectMesBubble(text, u);
    logEvent('发送-渲染', newNode ? '注入气泡成功' : '注入气泡失败,已尝试其他方式');
    if (newNode) { logEvent('发送-完成', '返回成功'); }
    else { logEvent('发送-完成', '无气泡可克隆,消息已落盘'); }
    // 保留 MESSAGE_SENT 派发（无害，供其它扩展感知"用户发了条消息"）
    try { if (ctx.eventSource && ctx.event_types && ctx.event_types.MESSAGE_SENT) ctx.eventSource.emit(ctx.event_types.MESSAGE_SENT, { mes: text, is_user: true }); } catch (e5) {}
    toast('已发送');
  } catch (e) { console.warn('[小剧场] 发送失败:', e); logEvent('发送-异常', (e && e.message) || String(e)); fillBox(text); }
}
// 【增量渲染】克隆聊天里最后一条 .mes 气泡，替换其中文本为 content，插入 #chat 末尾并滚到底。
// 返回插入节点；找不到可克隆的款式时返回 null（消息已落盘，交由其它机制）。
function injectMesBubble(content, userName) {
  try {
    const chat = document.getElementById('chat');
    if (!chat) { logEvent('渲染-无chat容器', ''); return null; }
    const all = chat.querySelectorAll('.mes');
    if (!all.length) { logEvent('渲染-无现成气泡', '无法克隆'); return null; }
    const src = all[all.length - 1]; // 最后一条气泡作模板
    const newNode = src.cloneNode(true);
    // 换文本：优先 .mes_text，其次 .mes_block/.mes_content/.mes_textarea/p
    let target = newNode.querySelector('.mes_text') || newNode.querySelector('.mes_block, .mes_content, .mes_textarea');
    if (target) {
      const holder = target.querySelector('p');
      if (holder) { holder.textContent = content; }
      else { target.textContent = content; }
    } else {
      // 极端情况：直接整块置文本
      newNode.textContent = content;
    }
    // 清理旧状态：去掉楼层号/名字里的"旧内容"，去掉旧角标按钮，防重复
    try { newNode.style.opacity = '1'; } catch (e) {}
    // 去掉小剧场/收藏注入的角标（.th-corner / [data-handle] 等），防重复叠加
    try {
      newNode.querySelectorAll('[data-th], [class*="th-"], .mes_corner, .mes_buttons, .mes_menu_elements, .mes_avatar_holder_extra, .interactable').forEach(function (el) {
        if (el && el.parentNode && (el.parentNode === newNode || el.parentNode.querySelector) && el.className && String(el.className).indexOf('mes') < 0) {
          try { el.remove(); } catch (e2) {}
        }
      });
    } catch (e3) {}
    newNode.setAttribute('data-th-injected', '1');
    chat.appendChild(newNode);
    // 滚到底
    try {
      const parent = chat.parentElement || document.querySelector('#chat') || null;
      const scroller = document.querySelector('.scrollableArea, .mes-scrollable, .messages_text') || chat;
      scroller.scrollTop = scroller.scrollHeight;
    } catch (e4) {}
    logEvent('渲染-注入', '插入#chat末尾 mes总数=' + chat.querySelectorAll('.mes').length);
    return newNode;
  } catch (e) { console.warn('[小剧场] 注入气泡失败:', e); logEvent('渲染-注入异常', (e && e.message)); return null; }
}
function sendGrab(src, idx) { const t = grabText(src, idx); if (t) sendText(t); else toast('内容为空'); }
function fillGrab(src, idx) { const t = grabText(src, idx); if (t) fillBox(t); else toast('内容为空'); }

// ---- 替换组操作（两组独立） ----
function pickGroup(ctx, map, isGlobal) {
  if (!map.groups.length) { toast('还没有保存的替换组'); return; }
  const lines = map.groups.map((g, i) => '<div class="' + PREFIX + 'pick" data-pick="' + i + '">' + esc(g.name) + ' — ' + esc(g.user) + ' / ' + esc(g.char) + '</div>').join('');
  const box = thModal('选择替换组', '<div style="max-height:220px;overflow:auto;">' + lines + '</div>', [{ text: '取消', cb: () => {} }]);
  box.querySelectorAll('[data-pick]').forEach(el => {
    el.style.cssText = 'padding:8px 6px;border-radius:6px;cursor:pointer;color:#ccc;font-size:13px;';
    el.onmouseover = () => el.style.background = '#2a3140';
    el.onmouseout = () => el.style.background = 'transparent';
    el.onclick = () => { const i = +el.getAttribute('data-pick'); map.current = map.groups[i].name; if (isGlobal) saveGlobalMap(map); else saveChatMap(ctx, map); document.getElementById(PREFIX + 'modal').remove(); render(); toast('已选择替换组'); };
  });
}
// 保存当前组：把替换名称卡当前内容写入已选中的组（没选则提示先选）
// 保存当前组：把替换名称卡当前内容 + 弹框输标题，存成一组（同名覆盖），保存后自动选中
function saveCurrentGroup(ctx, map, isGlobal) {
  const d = window.__thDraft || { user: '', char: '', extra: [] };
  const t = map.current != null ? map.groups.find(x => x.name === map.current) : null;
  const user = (t ? t.user : d.user) || '';
  const char = (t ? t.char : d.char) || '';
  const extraRaw = t ? t.extra : d.extra;
  const extra = Array.isArray(extraRaw) ? extraRaw.slice() : [];
  thPrompt({ title: '保存替换组·输标题', placeholder: '给这组起个名' }).then(name => {
    if (!name || !name.trim()) return;
    const nm = name.trim();
    let g = map.groups.find(x => x.name === nm);
    if (!g) { g = { name: nm, user: '', char: '', extra: [] }; map.groups.push(g); }
    g.user = user; g.char = char; g.extra = extra;
    map.current = nm;
    if (isGlobal) saveGlobalMap(map); else saveChatMap(ctx, map);
    render(); toast('已保存到「' + nm + '」');
  });
}
// 建立新组：弹框手动填标题 + 你名 + 角色名，完全手动新建，建后自动选中
function buildNewGroup(ctx, map, isGlobal) {
  thPrompt({ title: '建立新组·取标题', placeholder: '组名' }).then(name => {
    if (!name || !name.trim()) return;
    const nm = name.trim();
    thPrompt({ title: '填你的名字', placeholder: '例如：张三' }).then(user => {
      if (user === null) return;
      thPrompt({ title: '填角色名字', placeholder: '例如：林晚晴' }).then(char => {
        if (char === null) return;
        let g = map.groups.find(x => x.name === nm);
        if (!g) { g = { name: nm, user: '', char: '', extra: [] }; map.groups.push(g); }
        g.user = String(user || '').trim(); g.char = String(char || '').trim();
        if (!Array.isArray(g.extra)) g.extra = [];
        map.current = nm;
        if (isGlobal) saveGlobalMap(map); else saveChatMap(ctx, map);
        render(); toast('已建立并切换到「' + nm + '」');
      });
    });
  });
}
// ---- 导入导出 / 重置 ----
function exportAll() {
  try {
    const data = { version: 1, groups: getGroups(), mapGlobal: getGlobalMap(), fav: favLoad() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '小剧场备份-' + Date.now() + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
    toast('已导出备份');
  } catch (e) { console.warn('[小剧场] 导出失败:', e); toast('导出失败'); }
}
function importAll() {
  thConfirm({ title: '导入小剧场', text: '将读取一个 JSON 备份文件导入。继续？', yesText: '选择文件' }).then(ok => {
    if (!ok) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { try {
          const d = JSON.parse(rd.result);
          // 归一化成「我的分组结构 [{name, items:[{title,content,fav}]}]」
          let g = null;

          // 情形1：本插件的备份（直接是 groups 数组，或 {groups:[...], mapGlobal:{...}}）
          if (Array.isArray(d)) g = d;
          else if (d && Array.isArray(d.groups) && !d.prompts) {
            g = d.groups;   // 本插件自导出：groups 数组本身就是条目结构
            if (d && d.mapGlobal && typeof d.mapGlobal === 'object') saveGlobalMap(d.mapGlobal);
          }
          // 情形2：外插件「小剧场 miniStage」（有 _miniStage=true 或 prompts[]）
          else if (d && (d._miniStage === true || Array.isArray(d.prompts))) {
            const groupsRaw = Array.isArray(d.groups) ? d.groups : [];
            const prompts = Array.isArray(d.prompts) ? d.prompts : [];
            g = [];
            // 先把所有分组建立为 空 items 结构（临时保留 _importId 供归组）
            groupsRaw.forEach(gp => {
              if (!gp || typeof gp.name !== 'string') return;
              g.push({ name: gp.name, items: [], note: gp.note || '', _importId: gp.id });
            });
            // 把每条剧场(prompt)按 groupId 归入对应分组
            prompts.forEach(p => {
              if (!p || typeof p.content !== 'string') return;
              let target = null;
              if (p.groupId) target = g.find(x => x._importId === p.groupId);
              if (!target) {
                target = g[0];
                if (!target) { target = { name: '导入', items: [], _importId: '' }; g.push(target); }
              }
              target.items.push({ title: (typeof p.title === 'string' && p.title ? p.title : '未命名'), content: p.content, fav: !!p.starred });
            });
            if (!g.length) g = null;
          }

          if (!g) { toast('备份内容无效'); return; }
          // 兜底归一化：保证每个组都有 items 数组，并清理临时归组用的 _importId
          g.forEach(gg => { if (!gg.items || !Array.isArray(gg.items)) gg.items = []; delete gg._importId; });
          // 追加合并到现有（跳过重复：同组内 title 且 content 都相同的条目不重复追加）
          const existing = getGroups();
          let addedCnt = 0, skipCnt = 0;
          g.forEach(gg => {
            if (!gg || typeof gg.name !== 'string') return;
            const ex = existing.find(x => x.name === gg.name);
            if (!ex) {
              const items = (gg.items || []).filter(it => it && it.title !== undefined && it.content !== undefined);
              existing.push({ name: gg.name, items: items });
              addedCnt += items.length;
              return;
            }
            ex.items = ex.items || [];
            (gg.items || []).forEach(it => {
              if (!it || (it.title === undefined && it.content === undefined)) return;
              const dup = ex.items.some(old => old && old.title === (it.title || '') && old.content === (it.content || ''));
              if (dup) { skipCnt++; return; }
              ex.items.push({ title: (it.title || '').trim(), content: it.content || '', fav: !!it.fav });
              addedCnt++;
            });
          });
          saveGroups(existing);
          render(); toast('导入完成：合并 ' + addedCnt + ' 条，跳过重复 ' + skipCnt + ' 条，共 ' + existing.length + ' 组');
        } catch (e) { console.warn('[小剧场] 导入失败:', e); toast('导入失败'); } };
      rd.readAsText(f);
    };
    inp.click();
  });
}
async function resetAll() {
  const ok = await thConfirm({ title: '重置全部', text: '将清空所有分组、条目与收藏。此操作不可恢复，确定？', yesText: '清空' });
  if (!ok) return;
  saveGroups([]); saveGlobalMap({ groups: [], current: null });
  render(); toast('已重置');
}

// ============================================================
// 收录模式：双击聊天消息 → 反替换 → 收进小剧场分组
// ============================================================
// 收录消息：双击 + 每条消息右下角小收录图标（双入口，最稳）
// ============================================================
// 取一条消息的正文文本（多选择器兜底）
function collectGetMesText(mes) {
  try {
    const sels = ['.mes_text', '.text', '.mes_text_inner', '.mes_block', 'p', '.mes-content'];
    for (const s of sels) {
      const node = mes.querySelector(s);
      if (node && node.innerText && String(node.innerText).trim()) return String(node.innerText).trim();
    }
    return mes.innerText ? String(mes.innerText).trim() : '';
  } catch (e) { return ''; }
}
// 给每一条消息右下角插一个小的「收录」图标按钮
function collectAddIcon(mes) {
  try {
    if (!mes) return;
    if (mes.__thIconBinded) return;
    // 记录注入标记，避免重复
    mes.__thIconBinded = true;
    logEvent('角标-注入', 'mes.class=' + (mes.className || '') + ' 有文本=' + (!!collectGetMesText(mes)));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = '收录到小剧场';
    btn.innerHTML = ICO.check ? ico('check', 12) : '＋';
    btn.style.cssText = 'position:absolute;bottom:2px;right:2px;z-index:5;width:20px;height:20px;'
      + 'border:0;border-radius:6px;background:rgba(22,38,59,.78);color:#f6f5f1;'
      + 'display:flex;align-items:center;justify-content:center;cursor:pointer;'
      + 'box-shadow:0 1px 3px rgba(0,0,0,.3);';
    btn.onclick = function(ev){ ev.preventDefault(); ev.stopPropagation(); logEvent('角标-点击', 'opened');
      const txt=collectGetMesText(mes); if(txt) openCollectDialog(txt); else console.warn('[小剧场] 角标取不到文本'); };
    const pos = getComputedStyle(mes).position;
    if (pos === 'static') mes.style.position = 'relative';
    mes.appendChild(btn);
  } catch (e) { console.warn('[小剧场] 注入收录角标失败:', e); }
}
// 注册：双击事件委托 + 轮询给消息添加角标（含新消息，用 MutationObserver）
function registerChatDblclick() {
  try {
    logEvent('收录-注册', '脚本加载，开始找 #chat');
    const handler = () => {
      const chat = document.getElementById('chat');
      if (!chat) { logEvent('收录-注册', '#chat 未找到，继续等'); return false; }
      logEvent('收录-注册', '找到 #chat=' + (chat ? chat.id : '') + ' 现有 .mes=' + chat.querySelectorAll('.mes').length);
      if (!chat.__thDblBound) {
        chat.__thDblBound = true;
        chat.addEventListener('dblclick', function(e){
          const mes = e.target && e.target.closest ? e.target.closest('.mes') : null;
          if (!mes || mes === chat) { return; }
          const txt = collectGetMesText(mes);
          logEvent('双击-触发', 'mes=' + (mes.className||'') + ' 文本长度=' + (txt?txt.length:0));
          if (txt) openCollectDialog(txt);
        });
        logEvent('双击-绑定', '已绑 dblclick 到 #chat');
      }
      const scan = () => {
        const list = chat.querySelectorAll('.mes');
        logEvent('角标-扫描', '找到 .mes=' + list.length + ' 未注入=' + Array.prototype.filter.call(list, m=>!m.__thIconBinded).length);
        list.forEach(m => collectAddIcon(m));
      };
      scan();
      if (!chat.__thObserved) {
        chat.__thObserved = true;
        try { new MutationObserver(() => scan()).observe(chat, { childList: true, subtree: true }); logEvent('角标-观察', 'MutationObserver 已挂载'); } catch (e) {}
      }
      return true;
    };
    if (document.readyState !== 'loading' && document.getElementById('chat')) { handler(); return; }
    let tries = 0;
    (function t3(){ if (document.getElementById('chat')) { handler(); return; } if (++tries>80) return; setTimeout(t3,300); })();
    setInterval(function(){ try { const c=document.getElementById('chat'); if(c) (c.querySelectorAll('.mes')||[]).forEach(m=>collectAddIcon(m)); } catch(e){} }, 1500);
  } catch (e) { console.warn('[小剧场] 双击/角标收录绑定失败:', e); }
}
// 收集弹窗状态
let _collectState = null;
// 打开收录弹窗
function openCollectDialog(mesText) {
  try {
    logEvent('收集-open', 'mesText长度=' + (mesText ? mesText.length : 0));
    if (!mesText) { toast('没有可收录的文本'); logEvent('收集-open', '文本为空，直接返回'); return; }
    const groups = getGroups();
    logEvent('收集-open', 'groups数量=' + (Array.isArray(groups) ? groups.length : '非数组') + ' 首个组=' + (groups && groups[0] ? groups[0].name : '无'));
    if (!Array.isArray(groups) || !groups.length) { toast('请先建一个分组再来收录'); logEvent('收集-open', '没有分组，返回'); return; }
    _collectState = {
      source: mesText,
      title: '',                // 标题默认空，用户自己填
      group: groups[0].name,    // 默认选中第一个分组
      rules: [                  // 默认有 user / char 两行
        { from: '', to: '{{user}}' },
        { from: '', to: '{{char}}' }
      ],
    };
    logEvent('收集-open', '已设置状态，开始渲染弹窗');
    renderCollectDialog();
    logEvent('收集-open', 'renderCollectDialog 已调用完成');
  } catch (e) { console.warn('[小剧场] 打开收录弹窗失败:', e); logEvent('收集-open', '抛出异常: ' + (e && e.message)); }
}
// 渲染收录弹窗
function renderCollectDialog() {
  if (!_collectState) { logEvent('收集-render', '状态为空，返回'); return; }
  let st;
  try {
    st = _collectState;
    logEvent('收集-render', '开始绘制，source长度=' + (st.source ? st.source.length : 0) + ' 默认组=' + st.group);
    document.querySelectorAll('#' + PREFIX + 'modal').forEach(n => n.remove());
    const wrap = document.createElement('div'); wrap.id = PREFIX + 'modal';
    wrap.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99990;display:flex;align-items:center;justify-content:center;background:rgba(30,34,40,.45);';
    const box = document.createElement('div');
    box.style.cssText = 'width:min(340px,90%);max-height:88%;overflow-y:auto;background:#fff;border:1px solid #ecebe7;border-radius:16px;padding:14px;box-shadow:0 14px 38px rgba(20,24,30,.25);box-sizing:border-box;';
    // 挂到 body，确保在聊天主界面也能弹出
    st.__box = box; st.__wrap = wrap;
    let h = '<div style="font-weight:700;font-size:15px;color:#16263b;margin-bottom:4px;">收录到小剧场</div>'
      + '<div style="font-size:11px;color:#8b8f96;margin-bottom:12px;">双击了你选中的一条消息，反替换后收进分组。</div>';

  // 选分组
  const grpOpts = getGroups().map(g => '<option value="' + esc(g.name) + '"' + (g.name===st.group?' selected':'') + '>' + esc(g.name) + '</option>').join('');
  h += '<div class="' + PREFIX + 'mlabel">放到哪个组</div>'
    + '<select class="' + PREFIX + 'selbox-inp" id="' + PREFIX + 'col_grp" style="width:100%;height:34px;border:1px solid #e3e2dd;border-radius:9px;padding:0 8px;font-size:13px;margin-bottom:10px;background:#fff;color:#26292e;">' + grpOpts + '</select>';
  // 标题
  h += '<div class="' + PREFIX + 'mlabel">标题</div>'
    + '<input class="' + PREFIX + 'inp" id="' + PREFIX + 'col_title" value="' + esc(st.title) + '" style="width:100%;margin-bottom:10px;">';

  // 反替换规则
  h += '<div class="' + PREFIX + 'mlabel">反替换规则（把消息里的名字替换回占位符）</div>';
  st.rules.forEach((r,i)=>{
    h += '<div class="' + PREFIX + 'colrow">'
      + '<input class="' + PREFIX + 'inp" data-colrule="' + i + '" data-field="from" value="' + esc(r.from) + '" placeholder="消息里的名字" style="flex:1.2;">'
      + '<span class="' + PREFIX + 'arr">' + ico('arrow',12) + '</span>'
      + '<select data-colrule="' + i + '" data-field="to" style="flex:1;height:30px;border:1px solid #e3e2dd;border-radius:8px;font-size:12px;background:#fff;color:#26292e;">'
      +   '<option value="{{user}}"' + (r.to==='{{user}}'?' selected':'') + '>user</option>'
      +   '<option value="{{char}}"' + (r.to==='{{char}}'?' selected':'') + '>char</option>'
      +   '<option value="__custom__"' + (r.to!=='{{user}}'&&r.to!=='{{char}}'?' selected':'') + '>自定义</option>'
      + '</select>'
      + '<span class="' + PREFIX + 'delbtn" data-coldel="' + i + '" title="删掉这行">' + ico('close',13) + '</span>'
      + '</div>';
  });
  if (!st.rules.length) h += '<div class="' + PREFIX + 'extraempty" style="padding:6px 2px;">还没有规则，点下方「＋ 加规则」添加，或选一个替换组。</div>';
  h += '<button class="' + PREFIX + 'addbtn" data-coladd style="margin-top:6px;">' + ico('plus',13) + '<i>＋ 加规则</i></button>';

  // 一键套用替换组（下拉，默认空；选择了自动填规则）
  const gm = getGlobalMap();
  let groupOpts = '<option value="">（不套用）</option>' + gm.groups.map(gp =>
    '<option value="' + esc(gp.name) + '">' + esc(gp.name) + '</option>'
  ).join('');
  h += '<div class="' + PREFIX + 'mlabel" style="margin-top:10px;">一键套用替换组</div>'
    + '<select class="' + PREFIX + 'selbox-inp" id="' + PREFIX + 'col_groupapply" style="width:100%;margin-bottom:8px;">' + groupOpts + '</select>';

  // 反替换规则区标题 + 保存为组
  h += '<div class="' + PREFIX + 'mlabel" style="margin-top:4px;display:flex;justify-content:space-between;align-items:center;">'
    + '<span>反替换规则</span>'
    + '<button class="' + PREFIX + 'addbtn" data-colsavegroup style="padding:3px 9px;font-size:11px;">' + ico('star',12) + '<i>保存为组</i></button>'
    + '</div>';

  // 按钮（去掉预览）
  h += '<div class="' + PREFIX + 'btns" style="margin-top:14px;">'
    + '<button class="' + PREFIX + 'btn ghost" data-colcancel>取消</button>'
    + '<button class="' + PREFIX + 'btn primary" data-colfinish>' + ico('send',13) + '收录进组</button>'
    + '</div>';

  box.innerHTML = h;
  wrap.appendChild(box);
  // 关键：弹窗固定挂到 document.body（聊天主界面小剧场面板可能没开，挂 body 才能弹出）
  document.body.appendChild(wrap);
  logEvent('收集-render', '弹窗已挂到 body');

  // 绑定事件
  // 选组
  const grpSel = box.querySelector('#'+PREFIX+'col_grp');
  if (grpSel) grpSel.onchange = () => { st.group = grpSel.value; };
  // 标题
  const titleInp = box.querySelector('#'+PREFIX+'col_title');
  if (titleInp) titleInp.oninput = () => { st.title = titleInp.value; };
  // 规则输入
  box.querySelectorAll('[data-colrule]').forEach(inp => {
    inp.oninput = () => {
      const i = +inp.getAttribute('data-colrule');
      const field = inp.getAttribute('data-field');
      if (!st.rules[i]) st.rules[i] = { from:'', to:'{{user}}' };
      if (field === 'from') st.rules[i].from = inp.value;
      else {
        const selVal = inp.value;
        if (selVal === '__custom__') {
          // 原生 prompt 在安卓 WebView 不可用，改用自绘输入弹窗
          thPrompt({ title: '自定义要替换成的占位符', placeholder: '例如 {{name}}' }).then(cv => {
            if (cv == null) { inp.value = st.rules[i].to||'{{user}}'; return; }
            st.rules[i].to = cv;
            inp.value = cv;
            refreshColPreview(box, st);
          });
          return;
        }
        st.rules[i].to = selVal;
        refreshColPreview(box, st);
      }
      refreshColPreview(box, st);
    };
  });
  // 加规则
  const addBtn = box.querySelector('[data-coladd]');
  if (addBtn) addBtn.onclick = () => { st.rules.push({from:'',to:'{{user}}'}); renderCollectDialog(); };
  // 删除行
  box.querySelectorAll('[data-coldel]').forEach(btn => {
    btn.onclick = () => { const i=+btn.getAttribute('data-coldel'); st.rules.splice(i,1); renderCollectDialog(); };
  });
  // 一键套用替换组（下拉 onchange，选择后自动填规则）
  const grpApply = box.querySelector('#' + PREFIX + 'col_groupapply');
  if (grpApply) grpApply.onchange = () => {
    const name = grpApply.value;
    if (!name) return;
    const gp = gm.groups.find(x => x.name === name);
    if (!gp) return;
    st.rules = [];
    if (gp.user) st.rules.push({ from: gp.user, to: '{{user}}' });
    if (gp.char) st.rules.push({ from: gp.char, to: '{{char}}' });
    (gp.extra || []).forEach(ex => { if (ex && ex.from) st.rules.push({ from: ex.from, to: ex.to || '{{user}}' }); });
    renderCollectDialog();
  };
  // 存成替换组
  const saveBtn = box.querySelector('[data-colsavegroup]');
  if (saveBtn) saveBtn.onclick = () => {
    if (!st.rules.length) { toast('还没有规则可存'); return; }
    thPrompt({title:'存成替换组·取名', placeholder:'例如：我的这套'}).then(name=>{
      if (!name || !name.trim()) return;
      const gm2 = getGlobalMap();
      let g = gm2.groups.find(x=>x.name===name.trim());
      if (!g) { g={name:name.trim()}; gm2.groups.push(g); }
      g.user = (st.rules.find(r=>r.to==='{{user}}')||{}).from || '';
      g.char = (st.rules.find(r=>r.to==='{{char}}')||{}).from || '';
      g.extra = st.rules.filter(r=>r.to!=='{{user}}'&&r.to!=='{{char}}').map(r=>({from:r.from, to:r.to}));
      gm2.current = name.trim();
      saveGlobalMap(gm2);
      toast('已存成替换组「'+name.trim()+'」');
      renderCollectDialog();
    });
  };
  // 取消
  const cancel = box.querySelector('[data-colcancel]');
  if (cancel) cancel.onclick = () => { wrap.remove(); _collectState=null; };
  // 收录
  const fin = box.querySelector('[data-colfinish]');
  if (fin) fin.onclick = () => {
    const finalText = collectApplyRules(st.source, st.rules);
    const gs = getGroups();
    const g = findGroup(gs, st.group, true);
    if (!g) { toast('找不到分组'); return; }
    if (!Array.isArray(g.items)) g.items=[];
    g.items.push({ title: (st.title||'').trim() || '未命名', content: finalText, fav:false });
    saveGroups(gs);
    wrap.remove(); _collectState=null;
    toast('已收录到「'+st.group+'」');
  };
    logEvent('收集-render', '事件绑定完成，弹窗可用');
  } catch (e) { console.error('[小剧场] 绘制收录弹窗异常:', e); /* fallback: 原样收录 */ logEvent('收集-render-异常', (e && e.message) + '::' + (e && e.stack ? String(e.stack).slice(0,200) : '')); }
}
// 应用规则（反替换）
function collectApplyRules(text, rules) {
  let s = String(text||'');
  (rules||[]).forEach(r=>{
    const f = r && typeof r.from==='string' && r.from!=='' ? r.from : null;
    if (!f) return;
    const t2 = (typeof r.to==='string')?r.to:'';
    try { s = s.split(f).join(t2); } catch(e){}
  });
  return s;
}
// 刷新收集弹窗的预览区域
function refreshColPreview(box, st) {
  const nodes = box.querySelectorAll('.'+PREFIX+'used');
  if (nodes && nodes.length>=2) {
    try { if (nodes[1]) nodes[1].textContent = '后：' + collectApplyRules(st.source, st.rules); } catch(e) {}
  }
}
// 依赖：双击绑定需要在注册入口时一起开
registerChatDblclick();

// ============================================================
// 收藏聊天记录（迁移自「一切皆可收纳」SillyTavern-Plugin-Harvest）
//   - 长按 或 点消息右下角 ★ = 收藏当前这条（原样含 HTML/图片）
//   - 小剧场首页顶栏“小剧场”旁 ▶ = 进收藏查看界面（按角色分组 + 多选删除）
// ============================================================
const FAV_KEY = 'th-fav-store';
function favEmpty() { return { v: 1, items: [] }; }
function favLoad() {
  try { const d = JSON.parse(localStorage.getItem(FAV_KEY) || 'null'); if (d && Array.isArray(d.items)) return d; } catch (e) {}
  try {
    const ctx = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null;
    const ext = (ctx && ctx.extensionSettings) || (typeof extension_settings !== 'undefined' ? extension_settings : null);
    const d2 = ext && ext.character_theatre_fav;
    if (d2 && Array.isArray(d2.items)) return d2;
  } catch (e) {}
  return favEmpty();
}
function favPersist(d) {
  let lsOk = false;
  try { localStorage.setItem(FAV_KEY, JSON.stringify(d)); lsOk = true; }
  catch (e) { try { console.error('[小剧场] localStorage 写收藏失败', e); } catch(e2){} }
  let extOk = false;
  // 兜底写扩展设置
  try { const c = getCtx(); const s = (c && c.extensionSettings) || (typeof extension_settings !== 'undefined' ? extension_settings : null); if (s) { s.character_theatre_fav = d; extOk = true; if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced(); } } catch (e) {}
  if (!lsOk && !extOk) {
    try { if (typeof toast === 'function') toast('收藏保存可能丢失'); } catch (e2) {}
    try { logEvent('收藏双通道落盘均失败', String(FAV_KEY)); } catch (e3) {}
  }
}
function favRoleName() { try { const c = getCtx(); if (c && c.characters && c.characterId != null && c.characters[c.characterId]) return c.characters[c.characterId].name || ''; } catch (e) {} return ''; }
function favChatName() { try { const c = getCtx(); return String(c && c.name2 ? c.name2 : '').replace(/\.[a-z]+$/i, ''); } catch (e) {} return ''; }
// 角色固定色（沿用参考插件色池 + 根据角色名哈希分配）
const FAV_ROLE_COLORS = ['#c98f5f', '#7f9976', '#8d7ba6', '#a17f8f', '#9a8a6b'];
function favRoleColor(s) { let h = 0; const str = String(s || ''); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return FAV_ROLE_COLORS[h % FAV_ROLE_COLORS.length]; }
// 提取一条消息的原样 HTML（rendered，含普通 img + 穿透 shadowRoot 抓柏宝绘成品图原位插回）
function grabMesHtml(mesEl) {
  if (!mesEl) return '';
  try {
    let t = mesEl.querySelector('.mes_text');
    let html = t ? (t.innerHTML || '') : '';
    if (!html) {
      const c = mesEl.querySelector('.mes_block, .mes_content, .mes_textarea');
      if (c) html = c.innerHTML || '';
    }
    if (!html) html = mesEl.innerHTML || '';
    // —— 穿透 shadow root 抓<data-bbi-slot>里的成品图，插回原锚点位置 ——
    try {
      const anchorList = t ? t.querySelectorAll('div[data-bbi-slot]') : [];
      if (html && anchorList.length) {
        const collected = [];
        for (let i = 0; i < anchorList.length; i++) {
          let got = '';
          try {
            const sr = anchorList[i].shadowRoot;
            if (sr) {
              const im = sr.querySelector('img.bbi-figure__img') || sr.querySelector('img');
              if (im) {
                const s = String(im.getAttribute('src') || '').trim();
                if (s) got = '<img class="th-fav-img" src="' + esc(s) + '" style="max-width:100%;height:auto;border-radius:8px;margin:6px 0;display:block">';
              }
            }
          } catch (e3) {}
          collected.push(got);
        }
        if (collected.length) {
          let rep = 0;
          html = html.replace(/<div\s+data-bbi-slot[^>]*><\/div>/gi, function () {
            const g = collected[rep] || '';
            rep++;
            return g;
          });
        }
      }
    } catch (e) {}
    return html;
  } catch (e) { return ''; }
}
// 收藏阅读时清洗 html（对齐参考插件 cleanQuotes）：剔 <style> 防污染 + 中文/英文引号去重
// ① 单文本节点内连续同向引号收敛；② 相邻文本节点边界同向引号收敛（修复跨节点双引号）
function cleanFavHtml(html) {
  if (!html) return html;
  try {
    html = String(html).replace(/<style[\s\S]*?<\/style>/gi, '');
    const d = document.createElement('div');
    d.innerHTML = html;
    try {
      const QUOTE_L = '\u201C'; // 中文开 "
      const QUOTE_R = '\u201D'; // 中文闭 "
      // 收集所有文本节点
      const walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT, null, false);
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      let fixed = 0;
      // ① 单文本节点内：连续 2+ 个双/单引号（中英半全角）→ 收敛成 1 个
      const re = /[\u0022\u0027\u2018\u2019\u201C\u201D]{2,}/g;
      nodes.forEach(function (tn) {
        const t = tn.nodeValue;
        if (t && re.test(t)) {
          re.lastIndex = 0;
          const nt = t.replace(re, function (m) { return m.charAt(0); });
          if (nt !== t) { tn.nodeValue = nt; fixed++; }
        }
      });
      // ② 相邻文本节点边界：A 以引号结尾 && B 以同向引号开头 → 去掉 B 开头一个
      for (let i = 0; i < nodes.length - 1; i++) {
        const A = nodes[i], B = nodes[i + 1];
        if (!A || !B) continue;
        if (A.nextSibling !== B) continue; // 中间夹了元素，不是连续文本
        const at = A.nodeValue, bt = B.nodeValue;
        if (!at || !bt) continue;
        const aLast = at.charAt(at.length - 1);
        const bFirst = bt.charAt(0);
        if ((aLast === QUOTE_L && bFirst === QUOTE_L) || (aLast === QUOTE_R && bFirst === QUOTE_R)) {
          B.nodeValue = bt.slice(1);
          fixed++;
        }
      }
      if (fixed > 0) logEvent('引号-清洗', '收敛重复引号 共 ' + fixed + ' 处');
      return d.innerHTML;
    } catch (e2) {}
    return d.innerHTML;
  } catch (e) { return html; }
}
function grabMesPlain(mesEl) {
  try {
    const t = mesEl.querySelector('.mes_text');
    const p = t ? t.innerText : mesEl.innerText;
    return p ? String(p).trim() : '';
  } catch (e) { return ''; }
}
// 从消息元素拿“楼层号 / 名字 / 是否用户”作展示信息（尽力而为，不依赖）
function mesFloor(mesEl) {
  try {
    const c = getCtx(); const chat = (c && c.chat) ? c.chat : [];
    // 尝试从 DOM 的 data-message-id 拿楼层
    const idAttr = mesEl.getAttribute && mesEl.getAttribute('data-message-id');
    if (idAttr != null) { const f = parseInt(idAttr, 10); if (!isNaN(f) && f >= 0 && f < chat.length) return f; }
    return -1;
  } catch (e) { return -1; }
}
// 收藏当前这一条消息（长按 或 点 ★ 入口）
// 收藏专用标题弹窗（fixed + 顶层 z + 挂 body，解决在聊天主界面弹不出来的问题）
function favPrompt(opts) {
  return new Promise(function (resolve) {
    // 清残留
    document.querySelectorAll('#' + PREFIX + 'favprompt').forEach(function (n) { n.remove(); });
    var wrap = document.createElement('div');
    wrap.id = PREFIX + 'favprompt';
    wrap.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(24,28,34,.5);';
    var box = document.createElement('div');
    box.style.cssText = 'width:min(320px,86%);background:#fff;border:1px solid #ecebe7;border-radius:16px;padding:16px;box-shadow:0 14px 40px rgba(20,24,30,.35);color:#26292e;box-sizing:border-box;';
    box.innerHTML = '<div style="font-weight:700;font-size:15px;color:#16263b;margin-bottom:10px;">' + esc(opts.title || '输入') + '</div>'
      + '<input id="' + PREFIX + 'favp_inp" value="' + esc(opts.value || '') + '" placeholder="' + esc(opts.placeholder || '') + '" '
      + 'style="width:100%;height:38px;box-sizing:border-box;background:#fff;color:#26292e;border:1px solid #e3e2dd;border-radius:10px;padding:0 10px;font-size:14px;outline:none;">'
      + '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">'
      + '<button id="' + PREFIX + 'favp_cancel" style="border:0;border-radius:9px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;background:#eef0f3;color:#2b4460;">取消</button>'
      + '<button id="' + PREFIX + 'favp_ok" style="border:0;border-radius:9px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;background:#16263b;color:#f6f5f1;">' + esc(opts.yesText || '确定') + '</button>'
      + '</div>';
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    var inp = document.getElementById(PREFIX + 'favp_inp');
    document.getElementById(PREFIX + 'favp_cancel').onclick = function () { wrap.remove(); resolve(null); };
    document.getElementById(PREFIX + 'favp_ok').onclick = function () { var v = inp ? inp.value : ''; wrap.remove(); resolve(v); };
    if (inp) { inp.focus(); inp.select(); }
  });
}
function favCollectMes(mesEl) {
  try {
    if (!mesEl) { toast('未取到消息'); return; }
    const floor = mesFloor(mesEl);
    const c = getCtx(); const chat = (c && c.chat) ? c.chat : [];
    const m = (floor >= 0 && chat[floor]) ? chat[floor] : {};
    const name = m.name || '';
    const isUser = !!m.is_user || m.role === 'user';
    const rendered = grabMesHtml(mesEl);     // 原样 HTML（含 shadowRoot 图）
    const plain = grabMesPlain(mesEl);
    const role = favRoleName() || '未分类';
    // 先弹「写标题」小窗（备注标题，固定挂 body 顶层，聊天主界面也能弹）
    const defaultTitle = (name || '') + ' · 第' + (floor >= 0 ? floor : '?') + '楼';
    logEvent('收藏-开始', '准备弹标题框 角色=' + role);
    favPrompt({ title: '收藏这一条', placeholder: '给这条备注个标题', value: defaultTitle, yesText: '收藏' }).then(t => {
      if (t == null) { toast('已取消收藏'); logEvent('收藏-取消', '用户取消'); return; }
      const title = String(t).trim() || defaultTitle;
      const store = favLoad();
      store.items.push({
        id: 'e' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
        role: role, chatTitle: favChatName(),
        startFloor: floor, endFloor: floor, time: Date.now(), note: '', title: title,
        msgs: [{ name: name, is_user: isUser, role: isUser ? 'user' : 'assistant', mes: m.mes || m.content || plain || '', rendered: rendered, floor: floor }]
      });
      favPersist(store);
      logEvent('收藏-存', '标题=' + title.length + ' 角色=' + role + ' 文本=' + String(plain).length + ' html=' + String(rendered).length);
      toast('已收藏 · ' + role);
    });
  } catch (e) { console.warn('[小剧场] 收藏失败:', e); logEvent('收藏-异常', e && e.message); }
}
// 长按识别（区分滚动）：按住超过 ~420ms 且位移很小才算长按
// 长按收藏全局状态（解决 AI 生成时消息节点被流式重绘替换，导致 touchend 丢失、松手仍误触发收藏的问题）
let __longPress = { timer: 0, token: 0, sx: 0, sy: 0, active: false, canceled: false };
function __cancelLongPress() {
  if (__longPress.timer) { clearTimeout(__longPress.timer); __longPress.timer = 0; }
  __longPress.active = false; __longPress.canceled = true;
}
function bindMesLongPress(mes) {
  try {
    if (mes.__thLongBinded) return;
    mes.__thLongBinded = true;
    mes.addEventListener('touchstart', function (e) {
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      __cancelLongPress();
      const myToken = ++__longPress.token;
      __longPress.sx = touch.clientX; __longPress.sy = touch.clientY;
      __longPress.canceled = false; __longPress.active = true;
      __longPress.timer = setTimeout(function () {
        __longPress.timer = 0; __longPress.active = false;
        if (__longPress.canceled || myToken !== __longPress.token) return;
        try { e.preventDefault(); favCollectMes(mes); } catch (err) {}
      }, 420);
    }, { passive: false });
    mes.addEventListener('touchmove', function (e) {
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - __longPress.sx);
      const dy = Math.abs(touch.clientY - __longPress.sy);
      if (dx > 12 || dy > 12) __cancelLongPress();
    }, { passive: true });
    mes.addEventListener('touchend', __cancelLongPress);
    mes.addEventListener('touchcancel', __cancelLongPress);
  } catch (e) { /* ignore */ console.warn('[小剧场] 长按绑定失败:', e); }
}
// document 级兜底：即便消息节点被重绘替换而丢失 mes.touchend，只要在任意位置松手/取消，长按也会被打断，不再误触发收藏
(function __wireLongPressGlobal() {
  try {
    document.addEventListener('touchend', __cancelLongPress, { passive: true });
    document.addEventListener('touchcancel', __cancelLongPress, { passive: true });
  } catch (e) { /* ignore */ }
  // 滚动抑制：聊天区滚动时取消长按（AI 生成滚动中不会误触）
  function tryChat() {
    try {
      const chat = document.getElementById('chat');
      if (!chat) return false;
      if (!chat.__thScrollCancelBound) { chat.__thScrollCancelBound = true; chat.addEventListener('scroll', __cancelLongPress, { passive: true }); }
      return true;
    } catch (e) { return false; }
  }
  if (tryChat()) return;
  let tries = 0;
  const iv = setInterval(function () { if (tryChat() || ++tries > 30) clearInterval(iv); }, 300);
  setTimeout(function () { try { clearInterval(iv); } catch (e) {} }, 12000);
})();
// 给一条消息右下角放一个小圆钮（通用）：拍照 / 复制 / 收藏 共用
function mesCornerBtn(mes, opts) {
  const b = document.createElement('button');
  b.type = 'button'; b.title = opts.tip;
  b.innerHTML = opts.html;
  b.style.cssText = 'position:absolute;bottom:2px;right:' + opts.right + 'px;z-index:6;width:20px;height:20px;border:0;border-radius:6px;'
    + 'background:' + (opts.bg || 'rgba(22,38,59,.78)') + ';color:' + (opts.fg || '#f6f5f1') + ';'
    + 'display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3);';
  b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); try { opts.fn && opts.fn(mes); } catch (e) { console.warn('[小剧场] 消息角标出错:', e); } };
  mes.appendChild(b);
  return b;
}
// 收藏注入二号入口：在每条消息右下角放 ★（收藏）和 ✓（收录）两个小按钮，与长按并存
// 同时唤起拍照/复制角标（同排）
function favEnsureBtns(mes) {
  try {
    if (!mes || mes.__thFavBtnBinded) return;
    mes.__thFavBtnBinded = true;
    const pos = getComputedStyle(mes).position;
    if (pos === 'static') mes.style.position = 'relative';
    // ★ 收藏
    const star = document.createElement('button');
    star.type = 'button'; star.title = '收藏这条';
    star.innerHTML = ico('starbox', 12);
    star.style.cssText = 'position:absolute;bottom:2px;right:50px;z-index:6;width:20px;height:20px;border:0;border-radius:6px;'
      + 'background:rgba(200,164,95,.85);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3);';
    star.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); favCollectMes(mes); };
    mes.appendChild(star);
    // 拍照 / 复制 角标（right:98 拍照 / right:74 复制），与收藏星并排
    mesCornerBtn(mes, { tip: '复制这条', right: 74, html: iconCopy(13), fn: thCopyOne });
    mesCornerBtn(mes, { tip: '拍照这条', right: 98, html: iconCam(13), bg: 'rgba(43,68,96,.85)', fn: thCaptureOne });
    // ✓ 收录（原有逻辑已注入，这里确保不重复，配合排列）
    const chk = mes.querySelector('[data-th-collect]');
    if (chk) chk.style.right = '2px';
  } catch (e) { console.warn('[小剧场] 收藏按钮注入失败:', e); }
}
// 扫描 + 轮询：给所有 .mes 补长按与收藏按钮
function scanMesForFav() {
  try {
    const chat = document.getElementById('chat');
    if (!chat) return;
    (chat.querySelectorAll('.mes') || []).forEach(function (m) {
      bindMesLongPress(m);
      favEnsureBtns(m);
    });
  } catch (e) { /* ignore */ }
}
setInterval(scanMesForFav, 1800);
// —— 收藏查看界面状态 ——
let favCurView = 'list';        // list | detail
let favFilter = null;           // 角色名筛选，null=全部
let favOpen = [];               // 展开的角色名
let favSel = {};                // 多选删除 → id set
let favSelMode = false;
let favDetailId = null;
// 收藏查看入口：打开一个「覆盖小剧场之上的居中较高小窗」
function favOpenView() {
  logEvent('收藏-open', '调用收藏查看，items=' + (favLoad().items || []).length);
  favRenderView();
}
function favCloseView() { const w = document.getElementById(PREFIX + 'favroot'); if (w) w.remove(); favSel = {}; favSelMode = false; }
// 渲染收藏查看界面：居中 modal 小窗（层级高于小剧场，覆盖其之上）
function favRenderView() {
  const store = favLoad();
  // 收藏查看界面：按收藏时间降序（最新在前）。time 为收藏时 Date.now()。
  const items = (store.items || []).slice().sort((a, b) => (b.time || 0) - (a.time || 0));
  let root = document.getElementById(PREFIX + 'favroot');
  if (!root) {
    root = document.createElement('div');
    root.id = PREFIX + 'favroot';
    // 遮罩盖满，居中放小窗（z-index 远高于小剧场面板）。padding 与 #th-root 一致用 14px，避免把窗压窄
    root.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999990;background:rgba(24,28,34,.5);'
      + 'display:flex;align-items:center;justify-content:center;padding:14px;';
    document.body.appendChild(root);
    // 点遮罩空白关闭
    root.addEventListener('click', function (e) { if (e.target === root) favCloseView(); });
  }
  // 小窗容器（内层，尺寸与小剧场面板完全一致：width:480px;max-width:94%;height:min(500px,92%)）
  let winEl = document.getElementById(PREFIX + 'favwin');
  if (!winEl) {
    winEl = document.createElement('div');
    winEl.id = PREFIX + 'favwin';
    winEl.style.cssText = 'width:480px;max-width:94%;height:min(500px,92%);background:var(--th-bg,#f6f5f1);color:var(--th-ink,#26292e);'
      + 'border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(20,24,30,.35);'
      + 'display:flex;flex-direction:column;border:1px solid var(--th-line,#ecebe7);position:relative;';
    root.appendChild(winEl);
  }
  let h = '';

  if (favCurView === 'list') {
    // —— 列表：按角色分组（对齐新版「一切皆可收纳」C轻卡片）——
    const groups = {};
    items.forEach(it => { const k = it.role || '未分类'; if (!groups[k]) groups[k] = []; groups[k].push(it); });
    // 顶栏（左上角=返回，右侧=多选/删除 · 叉关闭）
    h += '<div class="' + PREFIX + 'fav-top">'
      + '<span class="' + PREFIX + 'fav-back" data-favback>' + ico('back', 14) + '</span>'
      + '<span class="' + PREFIX + 'fav-tt">' + (favSelMode ? '选择收藏' : '收藏 · ' + items.length + '条') + '</span>'
      + '<span class="' + PREFIX + 'fav-acts">'
      + (favSelMode
         ? '<span class="' + PREFIX + 'fav-act" data-favdel>'+ico('trash',13)+'删除</span>'
           + '<span class="' + PREFIX + 'fav-act" data-favinject>'+ico('send',13)+'注入</span>'
           + '<span class="' + PREFIX + 'fav-act" data-favexport>'+ico('exportUp',13)+'导出</span>'
         : '<span class="' + PREFIX + 'fav-act" data-favtoggle>多选</span>')
      + '<span class="' + PREFIX + 'fav-act" data-favclose>'+ico('close',14)+'</span>'
      + '</span></div>';


    h += '<div class="' + PREFIX + 'fav-body">';
    if (!items.length) h += '<div class="' + PREFIX + 'fav-empty">还没有收藏。<br>长按聊天消息，或点消息右下角 ★ 即可收藏。</div>';
    Object.keys(groups).forEach(k => {
      if (favFilter && favFilter !== k) return;
      const arr = groups[k];
      const isOpen = favOpen.indexOf(k) >= 0;
      const color = favRoleColor(k);
      h += '<div class="' + PREFIX + 'fav-grp' + (isOpen ? '' : ' ' + PREFIX + 'fav-fold') + '" data-role="' + esc(k) + '">'
        + '<div class="' + PREFIX + 'fav-ghead" data-favtoggleopen="' + esc(k) + '">'
        +   '<span class="' + PREFIX + 'fav-gband" style="background:' + color + '"></span>'
        +   '<span class="' + PREFIX + 'fav-gname">' + esc(k) + '</span>'
        +   '<span class="' + PREFIX + 'fav-gcount">' + arr.length + ' 条</span>'
        +   '<span class="' + PREFIX + 'fav-garrow">' + ico('arrow', 12) + '</span>'
        + '</div>'
        + '<div class="' + PREFIX + 'fav-gbody">' + arr.map(it => {
            const dt = new Date(it.time || Date.now());
            const ds = (dt.getMonth() + 1) + '·' + (dt.getDate() < 10 ? '0' : '') + dt.getDate();
            const floors = (it.startFloor >= 0 ? '第 ' + it.startFloor + '-' + (it.endFloor >= 0 ? it.endFloor : it.startFloor) + ' 楼' : '');
            const checked = favSel[it.id] ? ' on' : '';
            const box = favSelMode ? '<span class="' + PREFIX + 'fav-expbox' + checked + '" data-favexp="' + esc(it.id) + '">' + (checked ? '<svg width="12" height="12" viewBox="0 0 24 24" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>' : '') + '</span>' : '';
            return '<div class="' + PREFIX + 'fav-list-item' + (favSelMode ? ' sel' : '') + '" data-favid="' + esc(it.id) + '">'
              + box
              + '<div class="' + PREFIX + 'fav-li-tit">' + esc(it.title || (it.msgs && it.msgs[0] && it.msgs[0].name) || '收藏') + '</div>'
              + '<div class="' + PREFIX + 'fav-li-sub">' + ds + (floors ? ' · ' + floors : '') + ' · ' + (it.msgs ? it.msgs.length : 0) + ' 条</div>'
              + '</div>';
          }).join('') + '</div>'
        + '</div>';
    });
    if (favSelMode) h += '<div class="' + PREFIX + 'fav-selhint">已选 ' + Object.keys(favSel).length + ' 条 · 点「删除」批量删</div>';
    h += '</div>';
  } else {
    // —— 阅读详情（对齐新版 .hv-novel 样式）——
    const it = items.find(x => String(x.id) === String(favDetailId));
    h += '<div class="' + PREFIX + 'fav-top">'
      + '<span class="' + PREFIX + 'fav-back" data-favtolist>' + ico('back', 14) + '</span>'
      + '<span class="' + PREFIX + 'fav-tt">' + (it ? esc(it.role || '收藏') : '收藏') + '</span>'
      + '<span class="' + PREFIX + 'fav-acts">'
      + (it ? '<span class="' + PREFIX + 'fav-act" data-favdelone="' + esc(it.id) + '">'+ico('trash',12)+'</span>' : '')
      + '<span class="' + PREFIX + 'fav-act" data-favclose>'+ico('close',14)+'</span>'
      + '</span></div>';
    if (it) {
      h += '<div class="' + PREFIX + 'fav-prev">'
        + '<div class="' + PREFIX + 'fav-novel">'
        + '<div class="' + PREFIX + 'fav-nvote">' + esc(it.title || '') + '</div>'
        + '<div class="' + PREFIX + 'fav-nmeta">' + esc(it.role || '未分类') + ' · ' + esc(it.chatTitle || '') + ' · ' + esc(new Date(it.time||Date.now()).toLocaleString())
        + '<span class="' + PREFIX + 'fav-nfloors">' + (it.startFloor>=0 ? '第 ' + it.startFloor + '-' + (it.endFloor>=0?it.endFloor:it.startFloor) + ' 楼' : '') + '</span></div>'
        + '<div class="' + PREFIX + 'fav-nbody">';
      (it.msgs || []).forEach(m => {
        const me = !!m.is_user || m.role === 'user';
        const nm = m.name || (me ? '你' : '角色');
        h += '<div class="' + PREFIX + 'fav-np' + (me ? ' me' : '') + '">'
          + '<span class="' + PREFIX + 'fav-nname">' + esc(nm) + '</span>'
          + '<div class="' + PREFIX + 'fav-ncontent">' + (m.rendered ? cleanFavHtml(m.rendered) : esc(m.mes || '')) + '</div>'
          + '</div>';
      });
      h += '</div></div></div>';
    }
  }
  winEl.innerHTML = h;
  favBindView(winEl);
}
// 收藏界面事件
function favBindView(root) {
  root.onclick = function (e) {
    const el = e.target.closest ? e.target.closest('[data-favclose],[data-favback],[data-favtoggle],[data-favdel],'
      + '[data-favtoggleopen],[data-favid],[data-favexp],[data-favflt],[data-favtolist],[data-favdelone],[data-favexport],[data-favinject]') : null;
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    // 叉 = 关闭收藏小窗 + 连带关闭小剧场面板（回到酒馆主界面）
    if (el.getAttribute('data-favclose') != null) { favCloseView(); close(); return; }
    // 返回 = 关闭收藏小窗 + 回到小剧场首页（面板保留）
    if (el.getAttribute('data-favback') != null) { favCloseView(); goHome(); return; }
    if (el.getAttribute('data-favtolist') != null) { favCurView = 'list'; favRenderView(); return; }
    // 多选开关
    if (el.getAttribute('data-favtoggle') != null) { favSelMode = !favSelMode; favSel = {}; favRenderView(); return; }
    // 删除（多选批量）
    if (el.getAttribute('data-favdel') != null) {
      const ids = Object.keys(favSel);
      if (!ids.length) { toast('还没勾选要删的收藏'); return; }
      favConfirmTop('删除所选收藏', '确定删除已勾选的 ' + ids.length + ' 条收藏吗？', '删除').then(ok => {
        if (!ok) return; const s = favLoad(); s.items = (s.items||[]).filter(x => !ids.includes(String(x.id))); favPersist(s);
        favSel = {}; toast('已删除 ' + ids.length + ' 条'); favRenderView();
      });
      return;
    }
    // 批量导出 HTML（多选勾选的条目，图片 base64 内嵌）
    if (el.getAttribute('data-favexport') != null) {
      const ids = Object.keys(favSel);
      if (!ids.length) { toast('还没勾选要导出的收藏'); return; }
      favExportHTML(ids);
      return;
    }
    // 注入到聊天（多选勾选条目，一次性作为用户发言发回当前聊天）
    if (el.getAttribute('data-favinject') != null) {
      const ids = Object.keys(favSel);
      if (!ids.length) { toast('还没勾选要注入的收藏'); return; }
      favInjectToChat();
      return;
    }

    // 删除单条
    if (el.getAttribute('data-favdelone') != null) {
      const id = el.getAttribute('data-favdelone');
      thConfirm({ title: '删除收藏', text: '确定删除这条收藏吗？', yesText: '删除' }).then(ok => {
        if (!ok) return; const s = favLoad(); s.items = (s.items||[]).filter(x => String(x.id) !== String(id)); favPersist(s);
        favCurView = 'list'; favRenderView();
      }); return;
    }
    // 角色筛选
    if (el.getAttribute('data-favflt') != null) {
      const v = el.getAttribute('data-favflt'); favFilter = v === '' ? null : v; favRenderView(); return;
    }
    // 展开/收起某角色
    if (el.getAttribute('data-favtoggleopen') != null) {
      const k = el.getAttribute('data-favtoggleopen'); const i = favOpen.indexOf(k);
      if (i >= 0) favOpen.splice(i, 1); else favOpen.push(k);
      favRenderView(); return;
    }
    // 多选勾选框（data-favexp）
    if (el.getAttribute('data-favexp') != null) {
      const id = el.getAttribute('data-favexp');
      if (favSel[id]) delete favSel[id]; else favSel[id] = 1;
      favRenderView(); return;
    }
    // 点某条收藏 → 详情（或多选勾选）
    const id = el.getAttribute('data-favid');
    if (id != null) {
      if (favSelMode) { if (favSel[id]) delete favSel[id]; else favSel[id] = 1; favRenderView(); }
      else { favDetailId = id; favCurView = 'detail'; favRenderView(); }
    }
  };
}
// —— 首页顶栏 ▶ 图标（收藏查看入口）——
function favCreateTopIcon() { return topIcon('folder', () => { favOpenView(); }); }

// ===== 导出/导入（收藏） =====
// 逐条消息渲染成可读 HTML（含图片再打包）
function favMsgHtml(m) {
  try {
    if (m && m.rendered) return cleanFavHtml(m.rendered);
    return esc(m ? (m.mes || '') : '');
  } catch (e) { return ''; }
}
// 把 <img src> 逐个转成 base64（异步），用于 HTML 内嵌图片
function favInlineImgs(html, done) {
  try {
    const d = document.createElement('div');
    d.innerHTML = html;
    const imgs = d.querySelectorAll('img');
    let pending = imgs.length;
    if (!pending) { done(d.innerHTML); return; }
    imgs.forEach(function (im) {
      const src = im.getAttribute('src') || '';
      if (src.indexOf('data:') === 0) { if (--pending === 0) done(d.innerHTML); return; }
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            im.setAttribute('src', c.toDataURL('image/png'));
          } catch (e2) {}
          if (--pending === 0) done(d.innerHTML);
        };
        img.onerror = function () { if (--pending === 0) done(d.innerHTML); };
        img.src = src;
      } catch (e) { if (--pending === 0) done(d.innerHTML); }
    });
  } catch (e) { done(html); }
}
// 收藏导出为单个 HTML（多选勾选条目；图片 base64 内嵌）
// 待办3：把勾选的收藏一次性作为用户发言注入当前聊天（顶层直入，不用会被收藏窗盖住的 thConfirm）
// 通用顶层确认（fixed + 最高 z 挂 body，透过收藏窗也一定能看到）
function favConfirmTop(title, text, yesText) {
  return new Promise(function (resolve) {
    document.querySelectorAll('#' + PREFIX + 'favcfm').forEach(function(n){ n.remove(); });
    const wrap = document.createElement('div');
    wrap.id = PREFIX + 'favcfm';
    wrap.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999999;display:flex;align-items:center;justify-content:center;background:rgba(24,28,34,.5);';
    const box = document.createElement('div');
    box.style.cssText = 'width:min(320px,86%);background:#fff;border:1px solid #ecebe7;border-radius:16px;padding:16px;box-shadow:0 14px 40px rgba(20,24,30,.35);color:#26292e;box-sizing:border-box;';
    box.innerHTML = '<div style="font-weight:700;font-size:15px;color:#16263b;margin-bottom:10px;">' + esc(title || '确认') + '</div>'
      + '<div style="font-size:13px;color:#5b5f66;line-height:1.7;">' + esc(text || '') + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">'
      + '<button id="cf_cancel" style="border:0;border-radius:9px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;background:#eef0f3;color:#2b4460;">取消</button>'
      + '<button id="cf_ok" style="border:0;border-radius:9px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;background:#16263b;color:#f6f5f1;">' + esc(yesText || '确定') + '</button>'
      + '</div>';
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    box.querySelector('#cf_cancel').onclick = function(){ wrap.remove(); resolve(false); };
    box.querySelector('#cf_ok').onclick = function(){ wrap.remove(); resolve(true); };
  });
}

function favInjectToChat() {
  try {
    logEvent('注入-开始', 'favSel=' + Object.keys(favSel).length + '条');
    const ids = Object.keys(favSel);
    if (!ids.length) { toast('还没勾选要注入的收藏'); logEvent('注入-无选择', '返回'); return; }
    const store = favLoad();
    const ctx = getCtx();
    if (!ctx || !Array.isArray(ctx.chat)) { toast('找不到当前聊天'); logEvent('注入-无聊天', '返回'); return; }
    const picked = (store.items || []).filter(function (x) { return x && ids.indexOf(String(x.id)) >= 0; });
    logEvent('注入-匹配', 'picked=' + picked.length);
    // 顶层确认（fixed + 高 z，透过收藏窗也一定能看到）
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999999;display:flex;align-items:center;justify-content:center;background:rgba(24,28,34,.5);';
    const box = document.createElement('div');
    box.style.cssText = 'width:min(320px,86%);background:#fff;border:1px solid #ecebe7;border-radius:16px;padding:16px;box-shadow:0 14px 40px rgba(20,24,30,.35);color:#26292e;box-sizing:border-box;';
    box.innerHTML = '<div style="font-weight:700;font-size:15px;color:#16263b;margin-bottom:10px;">注入到聊天</div>'
      + '<div style="font-size:13px;color:#5b5f66;line-height:1.7;">把已勾选的 ' + picked.length + ' 条收藏，作为发言发回当前聊天？</div>'
      + '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">'
      + '<button id="cj_cancel" style="border:0;border-radius:9px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;background:#eef0f3;color:#2b4460;">取消</button>'
      + '<button id="cj_ok" style="border:0;border-radius:9px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;background:#16263b;color:#f6f5f1;">注入</button>'
      + '</div>';
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    box.querySelector('#cj_cancel').onclick = function () { wrap.remove(); logEvent('注入-取消', ''); };
    box.querySelector('#cj_ok').onclick = function () {
      wrap.remove();
      logEvent('注入-确认', '开始注入');
      const u = ctx.name1 || 'user';
      let n = 0;
      // 先收集要去重纯净的注入文本
      const injectTexts = [];
      picked.forEach(function (it) {
        (it.msgs || []).forEach(function (m) {
          let t = m && (m.mes || m.content);
          if (!t && m && m.rendered) { t = String(m.rendered).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
          t = String(t || '').trim();
          if (!t) return;
          injectTexts.push(t);
          ctx.chat.push({ name: u, is_user: true, is_system: false, is_name: true,
            send_date: Date.now() / 1000, mes: t, extra: { isSmallSys: false, token_count: 0, reasoning: '', hidden: false },
            swipes: [], swipe_info: {}, swipes_total: 0, swipe_cur: 0 });
          n++;
        });
      });
      logEvent('注入-数量', 'push=' + n);
      if (!n) { toast('选中的收藏没有可注入的文本'); logEvent('注入-空文本', ''); return; }
      // 落盘
      if (typeof ctx.saveChat === 'function') ctx.saveChat();
      // 增量渲染上屏：逐条克隆气泡插入 #chat 末尾（不用 reloadCurrentChat，防止整段重绘崩界面）
      let ok = 0;
      injectTexts.forEach(function (t) {
        if (injectMesBubble(t, u)) ok++;
      });
      logEvent('注入-渲染', '成功插入气泡=' + ok + '/' + n);
      if (ctx.eventSource && ctx.event_types) ctx.eventSource.emit(ctx.event_types.MESSAGE_SENT, { mes: '注入 ' + n + ' 条收藏', is_user: true });
      favCloseView();
      toast('已注入 ' + n + ' 条到聊天');
      logEvent('注入-完成', 'n=' + n + ' 上屏=' + ok);
    };
  } catch (e) { console.warn('[小剧场] 注入失败:', e); logEvent('注入-异常', (e && e.message)); toast('注入失败'); }
}
function favExportHTML(ids) {
  try {
    const store = favLoad();
    const picked = (store.items || []).filter(x => x && ids.indexOf(String(x.id)) >= 0);
    if (!picked.length) { toast('没有可导出的收藏'); return; }
    // 收集所有 rendered，等图片转 base64 后再拼完整 HTML
    const pendingRenders = picked.map(function (it) {
      return new Promise(function (res) {
        let sections = (it.msgs || []).map(function (m) {
          const nm = m.name || (m.is_user ? '你' : '角色');
          return '<div class="msg ' + (m.is_user ? 'me' : '') + '"><div class="who">' + esc(nm) + '</div><div class="body">' + favMsgHtml(m) + '</div></div>';
        }).join('');
        const meta = '<div class="meta">' + esc(it.role || '未分类') + ' · ' + esc(it.chatTitle || '') + ' · ' + (it.startFloor >= 0 ? '第' + it.startFloor + '-' + (it.endFloor >= 0 ? it.endFloor : it.startFloor) + '楼' : '') + '</div>';
        favInlineImgs(sections, function (withImg) {
          res('<div class="fav-item"><div class="title">' + esc(it.title || '') + '</div>' + meta + withImg + '</div>');
        });
      });
    });
    Promise.all(pendingRenders).then(function (parts) {
      const full = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<title>小剧场 · 收藏导出</title><style>'
        + 'body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f5f7;color:#1d1d1f;margin:0;padding:16px}'
        + '.fav-item{background:#fff;border:1px solid #f0f0f2;border-radius:12px;padding:14px;margin-bottom:14px}'
        + '.title{font-size:15px;font-weight:600;margin-bottom:6px}.meta{font-size:11px;color:#9a9a9e;margin-bottom:10px}'
        + '.msg{margin:6px 0;line-height:1.8}.msg .who{color:#b98a4b;font-weight:600;font-size:12.5px}.msg img{max-width:100%;border-radius:8px;display:block;margin:6px 0}'
        + '</style></head><body>' + parts.join('') + '</body></html>';
      const blob = new Blob([full], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '小剧场收藏导出.html';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
      toast('已导出 ' + picked.length + ' 条收藏为 HTML');
    });
  } catch (e) { console.warn('[小剧场] 导出HTML失败:', e); toast('导出失败'); }
}
// 设置页：导出 zip（收藏全部 + 图片，打包成 zip）
function favExportZip() {
  try {
    const store = favLoad();
    // 生成可预览 HTML（全部收藏，图片内嵌）
    const allIds = (store.items || []).map(x => String(x.id));
    // 复用 HTML 流程，但打包成 zip：先产出 html 字符串
    const sections = (store.items || []).map(function (it) {
      return new Promise(function (res) {
        let ms = (it.msgs || []).map(function (m) {
          const nm = m.name || (m.is_user ? '你' : '角色');
          return '<div class="msg ' + (m.is_user ? 'me' : '') + '"><div class="who">' + esc(nm) + '</div><div class="body">' + favMsgHtml(m) + '</div></div>';
        }).join('');
        favInlineImgs(ms, function (withImg) {
          res('<div class="fav-item"><div class="title">' + esc(it.title || '') + '</div><div class="meta">' + esc(it.role || '未分类') + ' · ' + esc(it.chatTitle || '') + '</div>' + withImg + '</div>');
        });
      });
    });
    Promise.all(sections).then(function (parts) {
      const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>小剧场收藏备份</title>'
        + '<style>body{font-family:sans-serif;background:#f5f5f7;color:#1d1d1f;margin:0;padding:16px}.fav-item{background:#fff;border:1px solid #f0f0f2;border-radius:12px;padding:14px;margin-bottom:14px}.title{font-weight:600;font-size:15px}.meta{font-size:11px;color:#9a9a9e;margin:8px 0}.msg{margin:6px 0;line-height:1.8}.msg img{max-width:100%}</style></head><body>' + parts.join('') + '</body></html>';
      const data = JSON.stringify({ v: 1, items: store.items || [] }, null, 2);
      // 生成 zip（手动 ZIP 打包：简单用 Base64 + 两个内容，交给 zip 库太重；这里导出为 self-extract 的 html + json 两个文件）
      // 简化：导出成一个 zip 需要库；此处用「下载单个 .zip 内含 html+json」——先尝试用 Blob + zip 不引库较难。
      // 退而：直接导出 html（可含图）+ 提示 json 在其中。为满足「zip」，用一个简单 zip 打包（store 存 html 和 data）
      buildZipAndDownload({ 'index.html': html, 'data.json': data });
    });
  } catch (e) { console.warn('[小剧场] 导出zip失败:', e); toast('导出失败'); }
}
// 简易 ZIP 打包（无外部库，最小实现：STORE 无压缩 + data descriptor，浏览器可解）
function buildZipAndDownload(files) {
  try {
    // 极简 ZIP：local file header + 中央目录。用 crc32。这里用最小合法 zip。
    const encoder = new TextEncoder();
    const name = 'archive.zip';
    let local = new Uint8Array(0);
    const central = [];
    const offsets = [];
    let offset = 0;
    Object.keys(files).forEach(function (n) {
      const nameArr = encoder.encode(n);
      const content = files[n];
      const bytes = typeof content === 'string' ? encoder.encode(content) : content;
      const crc = crc32(bytes);
      // local header (30 + nameLen + extra 0 + data)
      const lh = new Uint8Array(30 + nameArr.length);
      // signature
      lh[0]=0x50;lh[1]=0x4b;lh[2]=0x03;lh[3]=0x04;
      lh[4]=20;lh[5]=0; // version
      lh[6]=0;lh[7]=0; // flags (no enc, no data desc in header; use data desc)
      lh[8]=0;lh[9]=0; // compression store
      const t = localTime();
      // time
      lh[10]=t.time&0xff; lh[11]=(t.time>>8)&0xff; lh[12]=t.date&0xff; lh[13]=(t.date>>8)&0xff;
      // crc32 (set 0, use data descriptor)
      lh[14]=0;lh[15]=0;lh[16]=0;lh[17]=0;
      const csize=bytes.length, usize=bytes.length;
      lh[18]=csize&0xff; lh[19]=(csize>>8)&0xff; lh[20]=(csize>>16)&0xff; lh[21]=(csize>>24)&0xff;
      lh[22]=usize&0xff; lh[23]=(usize>>8)&0xff; lh[24]=(usize>>16)&0xff; lh[25]=(usize>>24)&0xff;
      lh[26]=nameArr.length&0xff; lh[27]=(nameArr.length>>8)&0xff;
      lh[28]=0; lh[29]=0;
      lh.set(nameArr, 30);
      const seg = concat(lh, bytes);
      local = concat(local, seg);
      offsets.push(offset);
      offset += seg.length;
      central.push({ nameArr: nameArr, csize: csize, crc: crc, localOffset: offset - seg.length });
    });
    // central directory
    let cd = new Uint8Array(0);
    central.forEach(function (c) {
      const h = new Uint8Array(46 + c.nameArr.length);
      h[0]=0x50;h[1]=0x4b;h[2]=0x01;h[3]=0x02;
      h[4]=20;h[5]=0; h[6]=20;h[7]=0;
      h[8]=0;h[9]=0; h[10]=0;h[11]=0;
      const t=localTime(); h[12]=t.time&0xff; h[13]=(t.time>>8)&0xff; h[14]=t.date&0xff; h[15]=(t.date>>8)&0xff;
      h[16]=c.crc&0xff; h[17]=(c.crc>>8)&0xff; h[18]=(c.crc>>16)&0xff; h[19]=(c.crc>>24)&0xff;
      h[20]=c.csize&0xff; h[21]=(c.csize>>8)&0xff; h[22]=(c.csize>>16)&0xff; h[23]=(c.csize>>24)&0xff;
      h[24]=c.csize&0xff; h[25]=(c.csize>>8)&0xff; h[26]=(c.csize>>16)&0xff; h[27]=(c.csize>>24)&0xff;
      h[28]=c.nameArr.length&0xff; h[29]=(c.nameArr.length>>8)&0xff;
      h[30]=0;h[31]=0; h[32]=0;h[33]=0; h[34]=0;h[35]=0; h[36]=0;h[37]=0;
      h[38]=0;h[39]=0; h[42]=0;h[43]=0;
      // local header offset
      h[42]=c.localOffset&0xff; h[43]=(c.localOffset>>8)&0xff; h[44]=(c.localOffset>>16)&0xff; h[45]=(c.localOffset>>24)&0xff;
      h.set(c.nameArr, 46);
      cd = concat(cd, h);
    });
    // End of central directory
    const eocd = new Uint8Array(22);
    eocd[0]=0x50;eocd[1]=0x4b;eocd[2]=0x05;eocd[3]=0x06;
    eocd[4]=0;eocd[5]=0; eocd[6]=0;eocd[7]=0;
    eocd[8]=central.length&0xff; eocd[9]=(central.length>>8)&0xff;
    eocd[10]=central.length&0xff; eocd[11]=(central.length>>8)&0xff;
    const cdSize=cd.length;
    eocd[12]=cdSize&0xff; eocd[13]=(cdSize>>8)&0xff; eocd[14]=(cdSize>>16)&0xff; eocd[15]=(cdSize>>24)&0xff;
    const cdOffset=local.length;
    eocd[16]=cdOffset&0xff; eocd[17]=(cdOffset>>8)&0xff; eocd[18]=(cdOffset>>16)&0xff; eocd[19]=(cdOffset>>24)&0xff;
    // comment 0
    const zip = concat(concat(local, cd), eocd);
    const blob = new Blob([zip], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
    toast('已导出 ZIP');
  } catch (e) { console.warn('[小剧场] ZIP导出失败:', e); toast('zip导出失败'); }
}
function crc32(bytes) {
  let c, crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) { c = (crc ^ bytes[i]) & 0xFF; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function concat(a, b) { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; }
function localTime() { const d = new Date(); return { time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) }; }
// 设置页：导入 zip / 读取
// 稳健 ZIP 解析：按 local file header 精确定位条目（STORE 无压缩），内容里再有 PK 也不会误截断
function _thExtractZipEntry(bytes, targetName) {
  try {
    const len = bytes.length;
    const dec = new TextDecoder('utf-8');
    // 扫描所有 local file header 签名 PK\x03\x04
    for (let i = 0; i + 30 <= len; i++) {
      if (bytes[i] === 0x50 && bytes[i+1] === 0x4b && bytes[i+2] === 0x03 && bytes[i+3] === 0x04) {
        const nameLen = bytes[i+26] | (bytes[i+27] << 8);
        const extraLen = bytes[i+28] | (bytes[i+29] << 8);
        const csize = (bytes[i+18] | (bytes[i+19] << 8) | (bytes[i+20] << 16) | (bytes[i+21] << 24)) >>> 0;
        const end = i + 30 + nameLen + extraLen + csize;
        if (end > len) { i = i + 30 + nameLen + extraLen - 1; continue; }
        let nm = '';
        try { nm = dec.decode(bytes.subarray(i + 30, i + 30 + nameLen)); } catch (e) {}
        if (nm === targetName) {
          let txt = '';
          try { txt = dec.decode(bytes.subarray(i + 30 + nameLen + extraLen, end)); } catch (e2) {}
          return txt;
        }
        i = end - 1;   // 跳过当前条目真实内容，避免把内容里的 PK 当 local header
      }
    }
    return null;
  } catch (e) { return null; }
}
function favImportZip() {
  try {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.zip,application/zip';
    inp.onchange = function () {
      const f = inp.files && inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = function () {
        try {
          // 稳健解析：按 local header 精确定位 data.json（内容里再有 PK 也不误截断）
          const arr = new Uint8Array(rd.result);
          const jsonStr = _thExtractZipEntry(arr, 'data.json');
          if (jsonStr === null) { toast('未找到 data.json'); return; }
          const obj = JSON.parse(jsonStr);
          if (obj && Array.isArray(obj.items)) {
            // 追加合并（无视命名重复，不覆盖当前收藏）；导入前自动快照兜底
            try { if (typeof thSnap === 'function') thSnap('ZIP导入前'); } catch(e3){}
            const _cur = favLoad();
            const _newItems = (Array.isArray(_cur.items) ? _cur.items : []).concat(obj.items);
            favPersist({ v: 1, items: _newItems });
            toast('已追加导入 ' + obj.items.length + ' 条收藏，现有共 ' + _newItems.length + ' 条');
            favRenderView();
          } else toast('导入内容无效');
        } catch (e) { console.warn('[小剧场] 导入zip解析失败:', e); toast('导入失败'); }
      };
      rd.readAsArrayBuffer(f);
    };
    inp.click();
  } catch (e) { console.warn('[小剧场] 导入zip失败:', e); }
}

// ---- 入口：只做悬浮球（主子钦点，绝不碰顶栏） ----
function registerEntry() {
  try {
    let fab = document.getElementById(PREFIX + 'fab');
    if (!fab) {
      fab = document.createElement('div');
      fab.id = PREFIX + 'fab';
      fab.title = '小剧场';
      document.body.appendChild(fab);
    }
    // 画布尺寸（允许 resize 更新）
    let vw = window.innerWidth, vh = window.innerHeight;
    // 记忆位置：优先读 localStorage，否则贴近原右下角
    let px = vw - 50, py = vh - 170;
    try {
      const o = JSON.parse(localStorage.getItem(PREFIX + 'fabpos')) || {};
      if (isFinite(o.x)) px = o.x;
      if (isFinite(o.y)) py = o.y;
    } catch (e) {}
    let cur = { x: px, y: py };
    let drag = null;                      // {sx, sy, startX, startY, moved}
    fab.__dragMoved = false;
    const SIZE = 34;
    // 定位 + 边界限制 + 存储
    function place() { fab.style.left = Math.round(cur.x) + 'px'; fab.style.top = Math.round(cur.y) + 'px'; }
    function clamp() { cur.x = Math.max(0, Math.min(vw - SIZE, cur.x)); cur.y = Math.max(0, Math.min(vh - SIZE, cur.y)); }
    function persist() { try { localStorage.setItem(PREFIX + 'fabpos', JSON.stringify({ x: cur.x, y: cur.y })); } catch (e) {} }
    fab.style.cssText = 'position:fixed;left:0px;top:0px;z-index:90000;'
      + 'width:34px;height:34px;border-radius:50%;'
      + 'background:#16263b;color:#f6f5f1;display:flex;align-items:center;justify-content:center;'
      + 'box-shadow:0 4px 14px rgba(20,24,30,.4);cursor:pointer;'
      + '-webkit-tap-highlight-color:transparent;user-select:none;touch-action:none;';
    place();
    // 触摸拖动
    fab.addEventListener('touchstart', function (e) {
      if (e.touches[0]) { drag = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, startX: cur.x, startY: cur.y, moved: false }; fab.__dragMoved = false; }
    }, { passive: false });
    fab.addEventListener('touchmove', function (e) {
      if (drag && e.touches[0]) {
        const dx = e.touches[0].clientX - drag.sx, dy = e.touches[0].clientY - drag.sy;
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { drag.moved = true; fab.__dragMoved = true; }
        if (drag.moved) { cur.x = drag.startX + dx; cur.y = drag.startY + dy; clamp(); place(); e.preventDefault(); }
      }
    }, { passive: false });
    fab.addEventListener('touchend', function () { if (drag) { drag = null; clamp(); place(); persist(); } }, { passive: false });
    // 鼠标拖动（桌面/开发调试兼容）
    fab.addEventListener('mousedown', function (e) { e.preventDefault(); drag = { sx: e.clientX, sy: e.clientY, startX: cur.x, startY: cur.y, moved: false }; fab.__dragMoved = false; });
    document.addEventListener('mousemove', function (e) {
      if (drag) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { drag.moved = true; fab.__dragMoved = true; }
        if (drag.moved) { cur.x = drag.startX + dx; cur.y = drag.startY + dy; clamp(); place(); }
      }
    });
    document.addEventListener('mouseup', function () { if (drag) { drag = null; clamp(); place(); persist(); } });
    // 点击 = 打开；若刚拖过则不打开
    fab.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (fab.__dragMoved) { fab.__dragMoved = false; return; } open(); });
    // 窗口大小变化时夹住边界
    window.addEventListener('resize', function () { vw = window.innerWidth; vh = window.innerHeight; clamp(); place(); persist(); });
    // AI 回复完提示音：挂事件监听（延迟重试，等酒馆 context 就绪；防重复绑定）
    bindNotifyRetry();
    console.log('[小剧场·诊断] 悬浮球拖动功能已启用');
  } catch (e) { console.warn('[小剧场] 悬浮球挂载失败:', e); }
}
// 挂载 AI 回复结束提示音监听（带重试与防重）
let _notifyBound = false, _notifyRetries = 0;
function bindNotifyRetry() {
  if (_notifyBound) return;
  try {
    const ctx = getCtx();
    const ev = ctx && ctx.eventSource;
    if (!ev || typeof ev.on !== 'function' || !ctx.event_types) {
      if (++_notifyRetries <= 40) setTimeout(bindNotifyRetry, 500);   // 最多重试 ~20s
      return;
    }
    const et = ctx.event_types;
    const onAiDone = function () { if (notifyOn()) notifyTrigger(); };
    // 优先用「生成结束」事件；兼容老版本用「收到完整消息」
    try { if (et.GENERATION_ENDED != null) { ev.on(et.GENERATION_ENDED, onAiDone); ev.on(et.MESSAGE_RECEIVED, onAiDone); } }
    catch (e) { ev.on(et.MESSAGE_RECEIVED, onAiDone); }
    _notifyBound = true;
    logEvent('提示音-绑定', '监听已挂载');
    console.log('[小剧场·诊断] AI回复提示音监听已挂载');
  } catch (e) { console.warn('[小剧场] 提示音绑定失败:', e); if (++_notifyRetries <= 40) setTimeout(bindNotifyRetry, 600); }
}
// 拍照按钮图标（相机 SVG，size=图标尺寸）
function iconCam(size) {
  const s = size || 17;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M4 7V5a1 1 0 0 1 1-1h4l2-3h6l2 3h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7h1Z"/><circle cx="12" cy="13" r="3.5"/></svg>';
}
// 复制按钮图标（size=图标尺寸）
function iconCopy(size) {
  const s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
}
// 复制「这一条」聊天消息文本到剪贴板
function thCopyOne(mes) {
  try {
    if (!mes) { toast('未取到消息'); return; }
    const txt = collectGetMesText(mes);
    if (!txt || !txt.trim()) { toast('这条消息没有可复制的文本'); return; }
    const doCopy = function () {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px;top:0;'; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); toast('已复制这一条'); } catch (e) { toast('复制失败'); }
      ta.remove();
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function(){ toast('已复制这一条'); }, doCopy);
      } else doCopy();
    } catch (e) { doCopy(); }
  } catch (e) { console.warn('[小剧场] 单条复制失败:', e); toast('复制失败'); }
}
// 拍照「这一条」消息 → 导出 PNG 图片（可进相册/预览）
// 拍照「这一条」消息 → 导出 PNG（foreignObject 优先，失败走纯文本 canvas 兜底，保证一定能出 PNG）
// 拍照「这一条」消息 → 导出 PNG（竖屏 + 显示全部文字；foreignObject 优先，失败走纯文本 canvas）
function thCaptureOne(mes) {
  try {
    if (!mes) { toast('未取到消息'); return; }
    logEvent('拍照-开始', '单条消息');
    // 克隆这条消息，剔除覆盖其上的操作角标，拍干净
    const cl = mes.cloneNode(true);
    (cl.querySelectorAll('button')).forEach(function(b){ b.remove(); });
    const imgs = Array.prototype.slice.call(cl.querySelectorAll('img'));
    let pending = imgs.length;
    if (!pending) { startRaster(); return; }
    imgs.forEach(function (im) {
      const src = im.getAttribute('src') || '';
      if (src.indexOf('data:') === 0) { if (--pending === 0) startRaster(); return; }
      try {
        const t = new Image(); t.crossOrigin = 'anonymous';
        t.onload = function () {
          try { const cv = document.createElement('canvas'); cv.width = t.naturalWidth; cv.height = t.naturalHeight; cv.getContext('2d').drawImage(t, 0, 0); im.setAttribute('src', cv.toDataURL('image/png')); } catch (e) {}
          if (--pending === 0) startRaster();
        };
        t.onerror = function () { if (--pending === 0) startRaster(); };
        t.src = src;
      } catch (e) { if (--pending === 0) startRaster(); }
    });
    // 方案A：离屏 SVG foreignObject → canvas → PNG（竖屏容宽）
    function startRaster() {
      try {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-99999px;top:0;width:520px;background:#fff;padding:16px;box-sizing:border-box;z-index:-1;word-break:break-word;';
        host.appendChild(cl);
        document.body.appendChild(host);
        const w = host.scrollWidth || 520;
        const h = host.scrollHeight || 400;
        const inner = host.innerHTML;
        host.remove();
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">'
          + '<foreignObject width="100%" height="100%">'
          + '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + w + 'px;min-height:' + h + 'px;background:#fff;color:#222;font:14px/1.7 sans-serif;word-break:break-word;">'
          + inner + '</div></foreignObject></svg>';
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        const img = new Image();
        img.onload = function () {
          try {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0);
            savePng(c.toDataURL('image/png'), '小剧场-消息.png');
            logEvent('拍照-成功', 'foreignObject ' + w + 'x' + h);
          } catch (e2) { console.warn('[小剧场] canvas绘制失败，走纯文本兜底:', e2); logEvent('拍照-兜底', 'canvas失败'); textFallback(); }
        };
        img.onerror = function () { console.warn('[小剧场] SVG失败，走纯文本兜底'); logEvent('拍照-兜底', 'SVG失败'); textFallback(); };
        img.src = url;
      } catch (e3) { console.warn('[小剧场] 离屏失败，走纯文本兜底:', e3); logEvent('拍照-兜底', '离屏失败'); textFallback(); }
    }
    // 方案B兜底：竖屏纯文本 canvas，显示这条消息全部文字（自动换行、不截断）
    function textFallback() {
      try {
        const txt = collectGetMesText(mes) || String(mes.innerText || '');
        logEvent('拍照-兜底-文本长度', String(txt).length);
        const g0 = document.createElement('canvas').getContext('2d');
        // 竖屏：窄一点（~620 物理像素内约 520 逻辑），高度随内容增长
        const pageW = 520, fontPx = 17, lh = 30, padX = 22, padTop = 24, padBottom = 24;
        g0.font = fontPx + 'px sans-serif';
        const avail = pageW - padX * 2;
        const lines = [];
        String(txt).split(/\r?\n/).forEach(function (src) {
          let seg = String(src || ' ');
          if (!seg.trim() && seg.length === 0) seg = ' ';
          // 按宽度自动换行
          while (g0.measureText(seg).width > avail) {
            let cut = seg.length - 1;
            while (cut > 0 && g0.measureText(seg.slice(0, cut)).width > avail) cut--;
            lines.push(seg.slice(0, cut));
            seg = seg.slice(cut);
          }
          lines.push(seg);
        });
        const pageW2 = pageW, pageH = Math.max(200, padTop + padBottom + lines.length * lh);
        const c = document.createElement('canvas');
        c.width = Math.ceil(pageW2); c.height = Math.ceil(pageH);
        const g = c.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = '#222222'; g.font = fontPx + 'px sans-serif';
        let y = padTop;
        lines.forEach(function (ln) { g.fillText(ln, padX, y); y += lh; });
        savePng(c.toDataURL('image/png'), '小剧场-消息.png');
        logEvent('拍照-成功-兜底', '竖屏全文 ' + lines.length + '行 ' + c.width + 'x' + c.height);
      } catch (e4) { console.warn('[小剧场] 纯文本兜底失败:', e4); logEvent('拍照-异常', (e4 && e4.message)); toast('这条消息图片导出失败'); }
    }
    function savePng(png, name) {
      try {
        const a = document.createElement('a');
        a.href = png; a.download = name; a.style.cssText = 'display:none';
        document.body.appendChild(a); a.click();
        setTimeout(function(){ a.remove(); }, 300);
        toast('已保存图片 PNG');
      } catch (e) { console.warn('[小剧场] 保存PNG失败:', e); logEvent('拍照-保存失败', (e && e.message)); toast('图片保存失败'); }
    }
  } catch (e) { console.warn('[小剧场] 单条拍照失败:', e); logEvent('拍照-异常', (e && e.message)); toast('拍照失败'); }
}
// 即插件加载即挂悬浮球；页面还没好就重试几次
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', registerEntry);
  } else {
  let tries = 0;
  (function tryReg() {
    if (document.body) { registerEntry(); return; }
    if (++tries > 30) { registerEntry(); return; }
    setTimeout(tryReg, 300);
  })();
}
// ============================================================
// 全局加固模块（v2.1.0 · 存得死死的：冷备份 + 自动快照 + 持久化校验）
// 纯增量，不改动上面任何既有函数逻辑。三块全局数据统一纳入防护：
//   groups(th-theatre-data) / mapGlobal(th-map-global) / fav(th-fav-store)
// 全部保持【跨角色全局】，与主人确认过，内容要存得死死的。
// ============================================================

// ---- 收集三块全局数据（全局常驻） ----
function thCollectGlobal() {
  var g = []; try { g = getGroups(); } catch(e){ g = []; }
  var m = { groups:[], current:null }; try { m = getGlobalMap(); } catch(e){ m = { groups:[], current:null }; }
  var f = favEmpty(); try { f = favLoad(); } catch(e){ f = favEmpty(); }
  return { groups: Array.isArray(g) ? g : [], mapGlobal: m, fav: f, ts: Date.now() };
}

// ---- 自动快照：存独立键 th-snapshots，保留最近 5 份 ----
const TH_SNAP_KEY = 'th-snapshots';
const TH_SNAP_MAX = 5;
function thGetSnaps() {
  try { var r = localStorage.getItem(TH_SNAP_KEY); var a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
function thSnap(label) {
  try {
    var arr = thGetSnaps();
    var snap = thCollectGlobal();
    snap.label = label || '自动快照';
    snap.ts = Date.now();
    if (arr[0] && Math.abs(arr[0].ts - snap.ts) < 1200) return false; // 去抖
    arr.unshift(snap);
    if (arr.length > TH_SNAP_MAX) arr = arr.slice(0, TH_SNAP_MAX);
    localStorage.setItem(TH_SNAP_KEY, JSON.stringify(arr));
    logEvent('快照-已存', (label || '') + ' / 现共' + arr.length + '份');
    return true;
  } catch(e) { logEvent('快照-失败', e && e.message); return false; }
}

// ---- 恢复最近快照（默认最新 index=0）----
function thRestoreSnap(idx) {
  try {
    var arr = thGetSnaps();
    var snap = arr && arr[(idx >= 0) ? idx : 0];
    if (!snap) { toast('没有可用快照'); return false; }
    if (Array.isArray(snap.groups)) saveGroups(snap.groups);
    if (snap.mapGlobal && typeof snap.mapGlobal === 'object') saveGlobalMap(snap.mapGlobal);
    if (snap.fav) favPersist(snap.fav);
    toast('已从快照恢复');
    logEvent('快照-恢复', '#' + ((idx >= 0) ? idx : 0) + ' ' + (snap.label || ''));
    if (typeof render === 'function') { try { render(); } catch(e){} }
    return true;
  } catch(e) { logEvent('快照-恢复失败', e && e.message); toast('快照恢复失败'); return false; }
}

// ---- 冷备份：三块全局数据一次导出为独立 JSON 文件（含收藏）----
function thFullBackup() {
  try {
    var data = { app: 'character-theatre', v: 1.1, ts: Date.now(), thFullBackup: true, data: thCollectGlobal() };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = '小剧场全量备份-' + new Date().toISOString().slice(0, 10) + '-' + Date.now() + '.json';
    a.style.cssText = 'display:none';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 300);
    toast('已导出全量备份(含收藏)');
    logEvent('冷备份-导出', 'groups=' + data.data.groups.length + ' fav=' + (data.data.fav ? data.data.fav.items.length : 0));
  } catch(e) { console.warn('[小剧场] 全量导出失败:', e); logEvent('冷备份-导出失败', e && e.message); toast('导出失败'); }
}

// ---- 冷恢复：读取全量 JSON 文件，覆盖回三块全局数据（恢复前自动快照）----
function thFullRestore() {
  try {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function(){
      var file = inp.files && inp.files[0]; if (!file) return;
      var rd = new FileReader();
      rd.onload = function(){
        try {
          var data = JSON.parse(String(rd.result || ''));
          var d = null;
          // 兼容两种备份格式：平铺（exportAll 老备份/裸数组） 或 双层（thFullBackup）
          if (data && Array.isArray(data.groups)) d = data;
          else if (data && data.data && Array.isArray(data.data.groups)) d = data.data;
          else if (Array.isArray(data)) d = { groups: data };
          if (!d || !Array.isArray(d.groups)) { toast('不是有效的全量备份文件'); return; }
          thSnap('全量恢复前');                      // 恢复前先保住当前现场
          saveGroups(d.groups);
          if (d.mapGlobal && typeof d.mapGlobal === 'object') saveGlobalMap(d.mapGlobal);
          if (d.fav) { try { favPersist(d.fav); } catch(e2){} }
          toast('全量恢复成功');
          logEvent('冷备份-恢复', 'groups=' + d.groups.length + ' fav=' + (d.fav ? d.fav.items.length : 0));
          if (typeof render === 'function') { try { render(); } catch(e){} }
        } catch(e2) { console.warn('[小剧场] 全量恢复解析失败:', e2); logEvent('冷备份-恢复失败', e2 && e2.message); toast('恢复失败'); }
      };
      rd.readAsText(file);
    };
    document.body.appendChild(inp); inp.click();
    setTimeout(function(){ try{ document.body.removeChild(inp); }catch(e){} }, 500);
  } catch(e) { console.warn('[小剧场] 全量恢复失败:', e); logEvent('冷备份-恢复异常', e && e.message); toast('恢复失败'); }
}

// ---- 持久化校验：回读 localStorage 与内存权威缓存比对，暴露"假保存成功" ----
function thVerifyPersistence() {
  try {
    var rows = [];
    var keys = [ { k: KEY_DATA, label: '分组' }, { k: KEY_MAP_GLOBAL, label: '替换组' }, { k: FAV_KEY, label: '收藏' } ];
    keys.forEach(function(it){
      try {
        var raw = localStorage.getItem(it.k);
        if (raw == null) { rows.push(it.label + '=未落盘'); return; }
        var disk = JSON.parse(raw);
        var mem = (typeof _cache !== 'undefined' && _cache[it.k] !== undefined) ? _cache[it.k] : null;
        var ok = (mem === null) ? true : (JSON.stringify(disk) === JSON.stringify(mem));
        rows.push(it.label + '=' + (ok ? '一致' : '不一致!'));
      } catch(e){ rows.push(it.label + '=读取异常'); }
    });
    logEvent('持久化-校验', rows.join(' | '));
    toast('校验: ' + rows.join(' | '));
  } catch(e) { logEvent('持久化-校验失败', e && e.message); toast('校验失败'); }
}

// ---- 关键写操作后的自动快照（节流 3 秒一次，防 localStorage 抖动）----
var _thSnapAt = 0;
function thAutoSnap(label) {
  try {
    var now = Date.now();
    if (now - _thSnapAt < 3000) return;
    _thSnapAt = now;
    thSnap(label || '自动');
  } catch(e) {}
}

// ---- 页面隐藏/卸载前最后一拍快照（进程被杀的最后一刻保数据）----
try {
  if (typeof window !== 'undefined' && window.addEventListener) {
    function _thFlushSnap() { try { thAutoSnap('离页'); } catch(e){} }
    window.addEventListener('pagehide', _thFlushSnap);
    window.addEventListener('visibilitychange', function(){ try { if (document.visibilityState === 'hidden') thAutoSnap('切后台'); } catch(e){} });
  }
} catch(e) {}

// ---- 设置页注入按钮（通过包裹 renderSettingsView 追加全局加固卡，纯透传）----
function thSettingsExt() {
  // details 折叠：默认收起，一进来不占屏（对齐现有 AI 提示音卡的 th-det/th-secti 范式）
  return '<div class="' + PREFIX + 'seccard" style="margin-top:10px;"><details class="' + PREFIX + 'det">'
    + '<summary class="' + PREFIX + 'secti">' + ico('check', 15) + '<i>全局加固 · 存得死死的</i></summary>'
    + '<div class="' + PREFIX + 'hint" style="margin-top:8px;">三块全局数据(小剧场/替换组/收藏)统一冷备份+自动快照。全量JSON落盘到Download，清缓存也不丢。</div>'
    + '<div class="' + PREFIX + 'row2in" style="margin-top:8px;">'
    + '<button class="' + PREFIX + 'fbtn primary" data-handle="' + reg(thFullBackup) + '">' + ico('exportUp', 13) + '<i>全量备份</i></button>'
    + '<button class="' + PREFIX + 'fbtn" data-handle="' + reg(thFullRestore) + '">' + ico('open', 13) + '<i>全量恢复</i></button>'
    + '<button class="' + PREFIX + 'fbtn" data-handle="' + reg(function(){ thSnap('手动'); toast('已存快照'); }) + '">' + ico('plus', 13) + '<i>存快照</i></button>'
    + '<button class="' + PREFIX + 'fbtn" data-handle="' + reg(function(){ thRestoreSnap(0); }) + '">' + ico('back', 13) + '<i>恢复快照</i></button>'
    + '<button class="' + PREFIX + 'fbtn" data-handle="' + reg(thVerifyPersistence) + '">' + ico('check', 13) + '<i>校验落盘</i></button>'
    + '</div></details></div>';
}


// ---- 写入口自动快照：每次保存关键全局数据后节流自动沉淀一份快照（存得死死的）----
(function(){
  try {
    // 仅在加固模块的 thAutoSnap 已定义时才启用（防止顺序依赖问题）
    if (typeof thAutoSnap !== 'function') return;
    var _o1 = saveGroups, _o2 = saveGlobalMap, _o3 = favPersist;
    saveGroups = function(g){
      var r = _o1.apply(this, arguments);
      try { thAutoSnap('保存小剧场'); } catch(e){}
      return r;
    };
    saveGlobalMap = function(m){
      var r = _o2.apply(this, arguments);
      try { thAutoSnap('保存替换组'); } catch(e){}
      return r;
    };
    favPersist = function(d){
      var r = _o3.apply(this, arguments);
      try { thAutoSnap('保存收藏'); } catch(e){}
      return r;
    };
  } catch(e){}
})();

})();
