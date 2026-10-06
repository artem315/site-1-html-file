'use strict';
/* =====================================================================
   Craftory — клиентская часть. Данные приходят с сервера через /api,
   справочники лежат в shared.js (общие с сервером).
   ===================================================================== */
/* ---------------- Утилиты ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = '') => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const now = () => Date.now();
const DAY = 864e5;
const nfCompact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const nfInt = new Intl.NumberFormat('ru-RU');
const fmtNum = (n) => nfCompact.format(n || 0);
const fmtInt = (n) => nfInt.format(n || 0);
const fmtDate = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateShort = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
function timeAgo(t) {
  const s = Math.max(1, Math.round((now() - t) / 1000));
  if (s < 60) return 'только что';
  const m = Math.round(s / 60); if (m < 60) return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
  const h = Math.round(m / 60); if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
  const d = Math.round(h / 24); if (d < 30) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
  const mo = Math.round(d / 30); if (mo < 12) return `${mo} ${plural(mo, 'месяц', 'месяца', 'месяцев')} назад`;
  const y = Math.round(mo / 12); return `${y} ${plural(y, 'год', 'года', 'лет')} назад`;
}
function fmtSize(b) {
  if (b < 1024) return `${b} Б`;
  if (b < 1048576) return `${(b / 1024).toFixed(1).replace('.', ',')} КБ`;
  return `${(b / 1048576).toFixed(1).replace('.', ',')} МБ`;
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const isUrl = (s) => /^https?:\/\/[^\s]+$/i.test(String(s || '').trim());
function envLabel(p) {
  const c = p.clientSide !== 'unsupported', s = p.serverSide !== 'unsupported';
  if (c && s) return p.serverSide === 'optional' ? 'Клиент, сервер по желанию' : p.clientSide === 'optional' ? 'Сервер, клиент по желанию' : 'Клиент и сервер';
  if (c) return 'Только клиент';
  if (s) return 'Только сервер';
  return 'Не указано';
}
const catLabel = (type, c) => (CATEGORIES[type] && CATEGORIES[type][c]) || c;

/* ---------------- Иконки ---------------- */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  flag: '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  bug: '<rect x="7" y="7" width="10" height="14" rx="5"/><path d="M12 7V4M3 13h4M17 13h4M4 19l3-2M20 19l-3-2M4 7l3 2M20 7l-3 2"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  package: '<path d="M16.5 9.4 7.5 4.2"/><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1 0 2-.8 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .9-1.5 2-1.5h2.3A4.7 4.7 0 0 0 22 11.3C22 6 17.5 2 12 2Z"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
  server: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>',
  braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  bookmark: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  arrowL: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
};
const ic = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 29 9.5 16 17 3 9.5Z" fill="#f2b68a"/><path d="M3 9.5 16 17v13L3 22.5Z" fill="#d97e43"/><path d="M29 9.5 16 17v13l13-7.5Z" fill="#9b4d22"/><path d="M6 13.5l4 2.3v3.5l-4-2.3Z" fill="#56bfa9"/><path d="M22 20.2l4-2.3v3.4l-4 2.4Z" fill="#56bfa9"/><path d="M14 6.5l4 2.3-4 2.3-4-2.3Z" fill="#fff" fill-opacity=".35"/></svg>`;

/* ---------------- Сгенерированная графика (пиксель-арт) ---------------- */
const artCache = new Map();
function svgUri(svg) { return `data:image/svg+xml,${encodeURIComponent(svg)}`; }
function iconArt(seed) {
  const key = `i${seed}`; if (artCache.has(key)) return artCache.get(key);
  const r = rng(seed); const hue = Math.floor(r() * 360);
  const c1 = `hsl(${hue} 62% 58%)`, c2 = `hsl(${(hue + 35) % 360} 72% 74%)`, c3 = `hsl(${(hue + 320) % 360} 55% 40%)`;
  const bg = `hsl(${hue} 28% 17%)`;
  let px = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    const v = r(); if (v < 0.42) continue;
    const c = v < 0.72 ? c1 : v < 0.9 ? c2 : c3;
    px += `<rect x="${x + 2}" y="${y + 2}" width="1" height="1" fill="${c}"/><rect x="${9 - x}" y="${y + 2}" width="1" height="1" fill="${c}"/>`;
  }
  const uri = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges"><rect width="12" height="12" fill="${bg}"/>${px}</svg>`);
  artCache.set(key, uri); return uri;
}
function sceneArt(seed) {
  const key = `s${seed}`; if (artCache.has(key)) return artCache.get(key);
  const r = rng(seed); const W = 160, H = 90;
  const night = r() < 0.22, hue = Math.floor(r() * 50) + (night ? 215 : 185);
  const skyTop = night ? `hsl(${hue} 45% 12%)` : `hsl(${hue} 65% 62%)`;
  const skyBot = night ? `hsl(${hue + 20} 40% 26%)` : `hsl(${(hue + 160) % 360} 75% 80%)`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBot}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
  if (night) for (let i = 0; i < 26; i++) s += `<rect x="${Math.floor(r() * W)}" y="${Math.floor(r() * 40)}" width="1" height="1" fill="#fff" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
  const sx = 20 + Math.floor(r() * 120), sy = 10 + Math.floor(r() * 16);
  s += `<rect x="${sx}" y="${sy}" width="10" height="10" fill="${night ? '#e8ecf5' : '#fff3c4'}"/>`;
  for (let i = 0; i < 4; i++) { const cx = Math.floor(r() * W), cy = 6 + Math.floor(r() * 26), cw = 14 + Math.floor(r() * 22); s += `<rect x="${cx}" y="${cy}" width="${cw}" height="4" fill="#fff" opacity="${night ? 0.12 : 0.65}"/><rect x="${cx + 4}" y="${cy - 3}" width="${cw - 8}" height="3" fill="#fff" opacity="${night ? 0.12 : 0.65}"/>`; }
  const grassHue = 70 + Math.floor(r() * 70);
  const layers = [
    { base: 46, amp: 14, col: `hsl(${hue} 25% ${night ? 20 : 55}%)`, step: 6 },
    { base: 58, amp: 10, col: `hsl(${grassHue} 35% ${night ? 16 : 38}%)`, step: 4 },
    { base: 70, amp: 7, col: `hsl(${grassHue} 45% ${night ? 12 : 30}%)`, step: 4 },
  ];
  layers.forEach((L, li) => {
    const ph = r() * 10, fr = 0.03 + r() * 0.04;
    for (let x = 0; x < W; x += L.step) {
      const h = Math.round(L.base + Math.sin(x * fr + ph) * L.amp * 0.6 + Math.sin(x * fr * 2.7 + ph * 2) * L.amp * 0.4);
      s += `<rect x="${x}" y="${h}" width="${L.step}" height="${H - h}" fill="${L.col}"/>`;
      if (li === 2) {
        s += `<rect x="${x}" y="${h}" width="${L.step}" height="2" fill="hsl(${grassHue} 55% ${night ? 22 : 46}%)"/>`;
        s += `<rect x="${x}" y="${h + 6}" width="${L.step}" height="${H}" fill="hsl(28 30% ${night ? 12 : 30}%)"/>`;
        if (r() < 0.18) s += `<rect x="${x + 1}" y="${h - 7}" width="2" height="7" fill="hsl(28 35% 24%)"/><rect x="${x - 2}" y="${h - 14}" width="8" height="8" fill="hsl(${grassHue + 10} 45% ${night ? 14 : 26}%)"/>`;
      }
    }
  });
  if (r() < 0.5) { const wy = 78 + Math.floor(r() * 5); s += `<rect x="0" y="${wy}" width="${W}" height="${H - wy}" fill="hsl(205 60% ${night ? 22 : 45}%)" opacity=".85"/>`; }
  s += '</svg>';
  const uri = svgUri(s); artCache.set(key, uri); return uri;
}
function readImage(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { res(img); setTimeout(() => URL.revokeObjectURL(u), 1000); };
    img.onerror = () => rej(new Error('Файл не похож на изображение.'));
    img.src = u;
  });
}
async function canvasBlob(c, type = 'image/webp', quality = 0.9) {
  const b = await new Promise((res) => c.toBlob(res, type, quality));
  if (b && b.type === type) return b;
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
async function imageToSquareBlob(file, size = 256) {
  const img = await readImage(file);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); const s = Math.min(img.width, img.height);
  ctx.imageSmoothingEnabled = s > size;
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return canvasBlob(c);
}
async function imageToBlob(file, maxW = 1920) {
  const img = await readImage(file);
  if (file.type === 'image/gif' || img.width <= maxW) return file; // GIF не пережимаем, чтобы сохранить анимацию
  const scale = maxW / img.width;
  const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return canvasBlob(c, 'image/webp', 0.88);
}
/* ---------------- Markdown ---------------- */
function safeUrl(u, img = false) {
  u = String(u).replace(/&amp;/g, '&');
  if (img) return /^(https:\/\/|data:image\/(png|jpe?g|gif|webp);)/i.test(u);
  return /^(https?:\/\/|#\/|mailto:)/i.test(u);
}
function mdInline(src) {
  let s = esc(src); const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => (safeUrl(u, true) ? `<img src="${u}" alt="${alt}" loading="lazy">` : ''));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => (safeUrl(u) ? `<a href="${u}"${u.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer nofollow"'}>${t}</a>` : t));
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, n) => `<code>${codes[n]}</code>`);
  return s;
}
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n'); const out = []; let i = 0;
  const startsBlock = (l) => /^(#{1,4}\s|```|>|\s*[-*+]\s+|\s*\d+[.)]\s+|(-{3,}|\*{3,})\s*$|\|)/.test(l);
  while (i < lines.length) {
    const l = lines[i]; let m;
    if (/^```/.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = Math.min(4, m[1].length + 1); out.push(`<h${n}>${mdInline(m[2])}</h${n}>`); i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^>/.test(l)) { const buf = []; while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`); continue; }
    if (/^\s*[-*+]\s+/.test(l)) { const buf = []; while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\s*[-*+]\s+/, '')); out.push(`<ul>${buf.map((x) => `<li>${mdInline(x)}</li>`).join('')}</ul>`); continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { const buf = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\s*\d+[.)]\s+/, '')); out.push(`<ol>${buf.map((x) => `<li>${mdInline(x)}</li>`).join('')}</ol>`); continue; }
    if (/^\|/.test(l) && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((h) => `<th>${mdInline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${mdInline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = [l]; i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${buf.map(mdInline).join('<br>')}</p>`);
  }
  return out.join('\n');
}


/* ---------------- Состояние и API ---------------- */
let db = null; // данные, которые видит текущий пользователь; присылает сервер
const prefs = { theme: 'system', view: 'list' };
function loadPrefs() { try { Object.assign(prefs, JSON.parse(localStorage.getItem('craftory.prefs') || '{}')); } catch { /* хранилище недоступно */ } }
function savePrefs() { try { localStorage.setItem('craftory.prefs', JSON.stringify(prefs)); } catch { /* хранилище недоступно */ } }
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
async function api(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: { 'X-Craftory': '1', Accept: 'application/json' } };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch { throw new ApiError('Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.', 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && db && db.me) refreshState().then(() => renderHeader()); // сессия истекла
    throw new ApiError(data.error || `Ошибка сервера (${res.status}). Попробуйте ещё раз.`, res.status);
  }
  if (data.state) db = data.state;
  return data;
}
async function refreshState() { try { db = await api('GET', '/api/state'); } catch { /* оставляем прежние данные */ } return db; }
function uploadFile(blob, name, kind, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/uploads?kind=${kind}`);
    x.setRequestHeader('X-Craftory', '1');
    x.setRequestHeader('X-Filename', encodeURIComponent(name || 'file'));
    x.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText); } catch { /* пустой ответ */ }
      if (x.status >= 200 && x.status < 300) resolve(d); else reject(new ApiError(d.error || `Не удалось загрузить файл (${x.status}).`, x.status));
    };
    x.onerror = () => reject(new ApiError('Загрузка прервалась: нет связи с сервером.', 0));
    x.send(blob);
  });
}
const mediaUrl = (id) => `/media/${encodeURIComponent(id)}`;
/* Блокирует кнопку на время запроса и показывает ошибку, если он не удался */
async function busy(btn, fn, label = 'Сохраняем…') {
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

/* ---------------- Доступ к данным ---------------- */
const userById = (id) => db.users.find((u) => u.id === id);
const userByName = (n) => db.users.find((u) => u.username.toLowerCase() === String(n).toLowerCase());
const projById = (id) => db.projects.find((p) => p.id === id);
const projBySlug = (s) => db.projects.find((p) => p.slug === s) || projById(s);
const versionById = (id) => db.versions.find((v) => v.id === id);
const versionsOf = (pid) => db.versions.filter((v) => v.projectId === pid).sort((a, b) => b.published - a.published);
const me = () => (db && db.me ? userById(db.me) || null : null);
const isMember = (p, u = me()) => !!u && p.members.some((m) => m.userId === u.id);
const isOwner = (p, u = me()) => !!u && p.ownerId === u.id;
const isAdmin = (u = me()) => !!u && u.role === 'admin';
const canEdit = (p, u = me()) => !!u && (isMember(p, u) || isAdmin(u));
const canView = (p, u = me()) => p.status === 'published' || p.status === 'unlisted' || canEdit(p, u);
const isListed = (p) => p.status === 'published';
const isFollowing = (p, u = me()) => !!u && db.follows.some((f) => f.userId === u.id && f.projectId === p.id);
const projectIcon = (p) => (p.icon ? mediaUrl(p.icon) : iconArt(hashStr(p.id)));
const userAvatar = (u) => (u && u.avatar ? mediaUrl(u.avatar) : iconArt(hashStr(`${u ? u.id : 'x'}avatar`)));
const unreadCount = (u = me()) => (u ? db.notifications.filter((n) => n.userId === u.id && !n.read).length : 0);
function coverOf(p) {
  const g = p.gallery.find((x) => x.featured) || p.gallery[0];
  return g ? galleryImg(g) : { src: sceneArt(hashStr(`${p.id}cover`)) };
}
function imgAttrs(o) { return `src="${esc(o.src)}"`; }
function galleryImg(g) { return { src: g.upload ? mediaUrl(g.upload) : sceneArt(g.gen ?? hashStr(g.id)) }; }
function compactVersions(list) {
  const sorted = [...list].sort(cmpGV);
  if (sorted.length <= 4) return sorted;
  return [`${sorted[sorted.length - 1]}–${sorted[0]}`];
}

/* ---------------- Тосты, модальные окна, подтверждения ---------------- */
function toast(text, type = 'ok') {
  let wrap = $('.toasts'); if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toasts'; wrap.setAttribute('role', 'status'); document.body.append(wrap); }
  const t = document.createElement('div'); t.className = `toast ${type === 'error' ? 'error' : ''}`; t.textContent = text; wrap.append(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3500);
}
const modalStack = [];
function openModal({ title, body, foot = '', wide = false, onMount }) {
  const bd = document.createElement('div'); bd.className = 'modal-backdrop';
  bd.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Закрыть">${ic('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const prevFocus = document.activeElement;
  const m = { el: bd, close() { bd.remove(); const i = modalStack.indexOf(m); if (i >= 0) modalStack.splice(i, 1); if (prevFocus && prevFocus.focus) prevFocus.focus(); m.onClose?.(); } };
  bd.addEventListener('mousedown', (e) => { if (e.target === bd) m.close(); });
  bd.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { e.preventDefault(); m.close(); } });
  document.body.append(bd); modalStack.push(m);
  onMount?.(bd, m);
  const f = bd.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select');
  (f || bd.querySelector('.modal-head button')).focus();
  return m;
}
function confirmDialog({ title, text, confirm = 'Подтвердить', danger = false, typeToConfirm = null }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title,
      body: `<p class="muted">${esc(text)}</p>${typeToConfirm ? `<div class="field"><label for="cf-type">Чтобы подтвердить, введите <b>${esc(typeToConfirm)}</b></label><input class="input" id="cf-type" autocomplete="off"></div>` : ''}`,
      foot: `<button class="btn" data-close>Отмена</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-ok" ${typeToConfirm ? 'disabled' : ''}>${esc(confirm)}</button>`,
      onMount(el) {
        const ok = $('#cf-ok', el);
        if (typeToConfirm) $('#cf-type', el).addEventListener('input', (e) => { ok.disabled = e.target.value.trim() !== typeToConfirm; });
        ok.addEventListener('click', () => { done = true; m.close(); resolve(true); });
      },
    });
    m.onClose = () => { if (!done) resolve(false); };
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const lb = $('.lightbox'); if (lb) { lb.remove(); return; }
    if (modalStack.length) { modalStack[modalStack.length - 1].close(); return; }
    closeMenus();
  }
  const lb = $('.lightbox');
  if (lb && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) $(e.key === 'ArrowRight' ? '.lb-next' : '.lb-prev', lb)?.click();
});
function closeMenus(except) { $$('.dropdown.open').forEach((d) => { if (d !== except) d.classList.remove('open'); }); }
document.addEventListener('click', (e) => { const dd = e.target.closest('.dropdown'); closeMenus(dd); });

/* ---------------- Тема ---------------- */
const mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function effectiveTheme() { return prefs.theme === 'system' ? (mqDark && !mqDark.matches ? 'light' : 'dark') : prefs.theme; }
function applyTheme() {
  if (prefs.theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', prefs.theme);
}
mqDark?.addEventListener?.('change', () => { if (prefs.theme === 'system') renderHeader(); });

/* ---------------- Маршрутизация ---------------- */
function parseHash() {
  let h = location.hash.slice(1) || '/';
  if (!h.startsWith('/')) h = `/${h}`;
  const qi = h.indexOf('?');
  const path = (qi >= 0 ? h.slice(0, qi) : h).replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : ''));
  return { path, query };
}
function go(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (replace) { history.replaceState(null, '', target); render(); return; }
  if (location.hash === target) render(); else location.hash = path;
}
function setQuery(path, q) {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])).toString();
  history.replaceState(null, '', `#${path}${qs ? `?${qs}` : ''}`);
}
const routes = [];
const route = (re, fn) => routes.push([re, fn]);
let keepScroll = false;
function rerender() { keepScroll = true; render(); }
function render() {
  const app = $('#app'); if (!db) return;
  const { path, query } = parseHash();
  closeMenus();
  let page = null;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { page = fn(...m.slice(1).map((x) => (x == null ? x : decodeURIComponent(x))), query); break; }
  }
  if (!page) page = pageNotFound();
  if (page.redirect) { go(page.redirect, { replace: true }); return; }
  const y = window.scrollY;
  renderHeader(path);
  app.innerHTML = page.html;
  document.title = page.title ? `${page.title} — Craftory` : 'Craftory — моды, сборки и шейдеры для Minecraft';
  page.after?.(app);
  window.scrollTo(0, keepScroll ? y : 0);
  keepScroll = false;
}
window.addEventListener('hashchange', () => render());
const requireLogin = () => ({ redirect: `/auth/signin?next=${encodeURIComponent(parseHash().path)}` });

/* ---------------- Делегирование событий ---------------- */
const A = {}; // действия по data-action
const F = {}; // формы по data-form
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && A[el.dataset.action]) { e.preventDefault(); A[el.dataset.action](el, e); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return; e.preventDefault();
  F[f.dataset.form]?.(f, e);
});
const formData = (f) => Object.fromEntries(new FormData(f).entries());
const formList = (f, name) => new FormData(f).getAll(name);
function fieldError(f, msg) {
  let el = $('.form-error', f);
  if (!el) { el = document.createElement('p'); el.className = 'error-text form-error'; el.setAttribute('role', 'alert'); f.prepend(el); }
  el.textContent = msg; el.hidden = !msg;
  if (msg) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------------- Шапка и подвал ---------------- */
const NAV = Object.entries(TYPES).map(([k, t]) => ({ href: `/${t.path}`, label: t.label, type: k }));
function renderHeader(path = parseHash().path) {
  const u = me(); const unread = unreadCount(u); const theme = effectiveTheme();
  const nav = NAV.map((n) => `<a href="#${n.href}" class="${path === n.href ? 'active' : ''}">${n.label}</a>`).join('');
  $('#header').innerHTML = `
  <div class="container header-inner">
    <a class="brand" href="#/" aria-label="Craftory — на главную">${LOGO}<span>Craftory</span></a>
    <nav class="main-nav" aria-label="Разделы">${nav}</nav>
    <div class="header-actions">
      <button class="btn btn-ghost btn-icon" data-action="toggleTheme" title="${theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}" aria-label="Сменить тему">${ic(theme === 'dark' ? 'sun' : 'moon')}</button>
      ${u ? `
        <button class="btn btn-primary hide-sm" data-action="createProject">${ic('plus')}Создать</button>
        <a class="btn btn-ghost btn-icon bell" href="#/dashboard/notifications" aria-label="Уведомления: ${unread}">${ic('bell')}${unread ? `<span class="count">${unread > 99 ? '99+' : unread}</span>` : ''}</a>
        <div class="dropdown">
          <button class="avatar-btn" data-action="toggleMenu" aria-label="Меню профиля" aria-haspopup="true"><img class="avatar" src="${esc(userAvatar(u))}" width="32" height="32" alt=""></button>
          <div class="dropdown-menu" role="menu">
            <div class="dropdown-head"><img class="avatar" src="${esc(userAvatar(u))}" width="36" height="36" alt=""><div><b>${esc(u.displayName)}</b><div class="faint" style="font-size:.84rem">@${esc(u.username)}</div></div></div>
            <hr>
            <a href="#/user/${esc(u.username)}">${ic('user')}Профиль</a>
            <a href="#/dashboard">${ic('dashboard')}Панель автора</a>
            <a href="#/dashboard/projects">${ic('box')}Мои проекты</a>
            <a href="#/dashboard/collections">${ic('bookmark')}Коллекции</a>
            <a href="#/dashboard/following">${ic('heart')}Подписки</a>
            <button data-action="createProject">${ic('plus')}Создать проект</button>
            ${isAdmin(u) ? `<a href="#/dashboard/moderation">${ic('shield')}Модерация</a>` : ''}
            <hr>
            <a href="#/settings">${ic('settings')}Настройки</a>
            <button data-action="logout">${ic('logout')}Выйти</button>
          </div>
        </div>` : `
        <a class="btn btn-ghost hide-sm" href="#/auth/signin">Войти</a>
        <a class="btn btn-primary" href="#/auth/signup">Регистрация</a>`}
      <button class="btn btn-ghost btn-icon burger" data-action="toggleNav" aria-label="Разделы">${ic('menu')}</button>
    </div>
  </div>
  <nav class="mobile-nav" aria-label="Разделы">${nav}${u ? '' : '<a href="#/auth/signin">Войти</a>'}</nav>`;
}
function renderFooter() {
  $('#footer').innerHTML = `<div class="container footer-grid">
    <div><a class="brand" href="#/">${LOGO}<span>Craftory</span></a><p>Открытый каталог модов, сборок, ресурспаков, шейдеров, плагинов и датапаков для Minecraft: Java Edition. Не связан с Mojang и Microsoft.</p></div>
    <div><h4>Каталог</h4>${NAV.map((n) => `<a href="#${n.href}">${n.label}</a>`).join('')}</div>
    <div><h4>Авторам</h4><a href="#" data-action="createProject">Опубликовать проект</a><a href="#/dashboard">Панель автора</a><a href="#/dashboard/analytics">Аналитика</a><a href="#/about">Правила публикации</a></div>
    <div><h4>Craftory</h4><a href="#/about">О проекте</a><a href="#/settings/data">Данные и приватность</a><a href="#/auth/signup">Создать аккаунт</a></div>
  </div>`;
}
A.toggleMenu = (el) => { const d = el.closest('.dropdown'); const open = !d.classList.contains('open'); closeMenus(); d.classList.toggle('open', open); };
A.toggleNav = () => $('.mobile-nav')?.classList.toggle('open');
A.toggleTheme = () => { prefs.theme = effectiveTheme() === 'dark' ? 'light' : 'dark'; savePrefs(); applyTheme(); renderHeader(); };
A.logout = async () => { try { await api('POST', '/api/auth/signout'); toast('Вы вышли из аккаунта.'); go('/'); } catch (e) { toast(e.message, 'error'); } };

/* ---------------- Общие компоненты ---------------- */
function authorOf(p) { return userById(p.ownerId); }
function statusBadge(p) { return p.status === 'published' ? '' : `<span class="badge badge-${p.status}">${STATUSES[p.status]}</span>`; }
function loaderChip(l) { const L = LOADERS[l] || { label: l, color: '#999' }; return `<span class="chip"><span class="dot" style="background:${L.color}"></span>${esc(L.label)}</span>`; }
function catChips(p, max = 4) { return p.categories.slice(0, max).map((c) => `<a class="chip" href="#/${TYPES[p.type].path}?c=${encodeURIComponent(c)}">${esc(catLabel(p.type, c))}</a>`).join(''); }
function projectRow(p, { extra = '' } = {}) {
  const a = authorOf(p); const href = `#/project/${esc(p.slug)}`;
  return `<article class="p-row">
    <a href="${href}" tabindex="-1" aria-hidden="true"><img class="p-icon" src="${esc(projectIcon(p))}" alt="" width="84" height="84" loading="lazy"></a>
    <div style="min-width:0">
      <div class="p-title"><a class="name" href="${href}">${esc(p.title)}</a><span class="by">от <a href="#/user/${esc(a?.username)}">${esc(a?.displayName || 'неизвестно')}</a></span>${statusBadge(p)}</div>
      <p class="p-summary">${esc(p.summary)}</p>
    </div>
    <div class="p-stats">
      <span class="st">${ic('download')}<b class="num">${fmtNum(p.downloads)}</b> <span class="hide-sm">загрузок</span></span>
      <span class="st">${ic('heart')}<b class="num">${fmtNum(p.followers)}</b> <span class="hide-sm">подписчиков</span></span>
    </div>
    <div class="p-meta">
      <div class="chips">${catChips(p)}${p.loaders.slice(0, 3).map(loaderChip).join('')}</div>
      <span class="faint" style="font-size:.85rem" title="${esc(fmtDate(p.updated))}">${ic('clock', 'inline')} Обновлён ${esc(timeAgo(p.updated))}</span>
      ${extra}
    </div>
  </article>`;
}
function projectCard(p) {
  const a = authorOf(p); const href = `#/project/${esc(p.slug)}`;
  return `<article class="p-card">
    <a href="${href}" tabindex="-1" aria-hidden="true"><img class="cover" ${imgAttrs(coverOf(p))} alt="" loading="lazy"></a>
    <div class="body">
      <div class="head"><img class="p-icon" src="${esc(projectIcon(p))}" alt="" width="64" height="64" loading="lazy">
        <div style="min-width:0;padding-bottom:2px"><a class="name" href="${href}" style="color:var(--fg);font-weight:700;display:block">${esc(p.title)}</a><span class="faint" style="font-size:.84rem">от ${esc(a?.displayName || '—')}</span></div></div>
      <p class="p-summary">${esc(p.summary)}</p>
      <div class="chips">${catChips(p, 2)}</div>
      <div class="foot"><span>${ic('download')}<b class="num">${fmtNum(p.downloads)}</b></span><span>${ic('heart')}<b class="num">${fmtNum(p.followers)}</b></span><span class="faint" style="margin-left:auto">${esc(TYPES[p.type].one)}</span></div>
    </div>
  </article>`;
}
function miniProject(p, sub) {
  return `<a class="mini" href="#/project/${esc(p.slug)}"><img class="p-icon" src="${esc(projectIcon(p))}" alt="" width="40" height="40" loading="lazy"><div style="min-width:0"><b>${esc(p.title)}</b><small>${esc(sub ?? `${TYPES[p.type].one} · ${fmtNum(p.downloads)} загрузок`)}</small></div></a>`;
}
function emptyState(icon, title, text = '', action = '') {
  return `<div class="empty">${ic(icon)}<b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}
function pagination(page, pages, actionName) {
  if (pages <= 1) return '';
  const nums = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2].filter((n) => n >= 1 && n <= pages));
  const list = [...nums].sort((a, b) => a - b); let out = ''; let prev = 0;
  for (const n of list) { if (n - prev > 1) out += '<span class="faint" style="align-self:center">…</span>'; out += `<button class="btn btn-sm ${n === page ? 'btn-active' : ''}" data-action="${actionName}" data-page="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`; prev = n; }
  return `<nav class="pagination" aria-label="Страницы">
    <button class="btn btn-sm btn-icon" data-action="${actionName}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Назад">${ic('chevL')}</button>${out}
    <button class="btn btn-sm btn-icon" data-action="${actionName}" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Вперёд">${ic('chevR')}</button></nav>`;
}
function niceStep(v) { const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
function seriesFor(pids, days) {
  const out = [];
  for (let d = days - 1; d >= 0; d--) {
    const t = now() - d * DAY; const k = dateKey(t);
    out.push({ t, v: pids.reduce((a, id) => a + ((db.stats[id] || {})[k] || 0), 0) });
  }
  return out;
}
function chartSVG(series, label = 'Загрузки по дням') {
  const W = 760, H = 240, L = 52, R = 16, T = 14, B = 30;
  const vmax = Math.max(1, ...series.map((s) => s.v));
  const step = vmax <= 4 ? 1 : niceStep(vmax / 4); const max = Math.ceil(vmax / step) * step;
  const n = series.length;
  const x = (i) => L + (n <= 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let grid = '';
  for (let v = 0; v <= max + 1e-9; v += step) grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmtNum(v)}</text>`;
  const every = Math.max(1, Math.ceil(n / 7));
  let xl = '';
  series.forEach((s, i) => { if ((n - 1 - i) % every === 0) xl += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(fmtDateShort(s.t))}</text>`; });
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ');
  const area = `M${x(0).toFixed(1)},${y(0).toFixed(1)} L${pts.replace(/ /g, ' L')} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} Z`;
  const last = series[n - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}<path class="area" d="${area}"/><polyline class="line" points="${pts}"/>${xl}<circle class="dotp" cx="${x(n - 1).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="4.5"/></svg>`;
}

/* =====================================================================
   Страницы: главная, каталог, проект, версия
   ===================================================================== */
route(/^\/$/, () => {
  const listed = db.projects.filter(isListed);
  const totalDl = listed.reduce((a, p) => a + p.downloads, 0);
  const creators = new Set(listed.flatMap((p) => p.members.map((m) => m.userId))).size;
  const featured = listed.filter((p) => p.featured).sort((a, b) => b.downloads - a.downloads).slice(0, 6);
  const fresh = [...listed].sort((a, b) => b.updated - a.updated).slice(0, 5);
  const newest = [...listed].sort((a, b) => b.created - a.created).slice(0, 6);
  const tiles = Object.entries(TYPES).map(([k, t]) => {
    const c = listed.filter((p) => p.type === k).length;
    return `<a class="type-tile" href="#/${t.path}"><span class="ti">${ic(t.icon)}</span><span><b>${t.label}</b><small>${c} ${plural(c, 'проект', 'проекта', 'проектов')}</small></span></a>`;
  }).join('');
  return {
    html: `<div class="container">
      <section class="hero">
        <img class="hero-art" src="${esc(sceneArt(2))}" alt="">
        <div class="hero-shade"></div>
        <div class="hero-body">
          <span class="eyebrow">Minecraft: Java Edition</span>
          <h1>Моды, сборки и шейдеры, которые <em>приятно</em> искать</h1>
          <p>Каталог от авторов для игроков: скачивайте без рекламы и ожидания, фильтруйте по версии игры и загрузчику, подписывайтесь на обновления.</p>
          <form class="search-box" data-form="heroSearch" role="search">${ic('search')}<input class="input" name="q" id="hero-q" placeholder="Например: миникарта, оптимизация, шейдеры для слабых ПК" aria-label="Поиск по модам"></form>
          <div class="hero-stats">
            <div><b class="num">${fmtInt(listed.length)}</b><span>проектов</span></div>
            <div><b class="num">${fmtNum(totalDl)}</b><span>загрузок</span></div>
            <div><b class="num">${fmtInt(creators)}</b><span>авторов</span></div>
          </div>
        </div>
      </section>
      <div class="type-tiles">${tiles}</div>
      <section class="section">
        <div class="section-head"><h2>Выбор редакции</h2><a href="#/mods">Весь каталог</a></div>
        <div class="p-grid">${featured.map(projectCard).join('')}</div>
      </section>
      <div class="proj-layout section">
        <section>
          <div class="section-head"><h2>Недавно обновлённые</h2></div>
          <div class="p-list">${fresh.map((p) => projectRow(p)).join('')}</div>
        </section>
        <aside class="side">
          <div class="panel"><h3>Новые проекты</h3><div class="mini-list">${newest.map((p) => miniProject(p, `${TYPES[p.type].one} · ${timeAgo(p.created)}`)).join('')}</div></div>
        </aside>
      </div>
      <section class="panel section creator-cta">
        <div class="stack">
          <span class="eyebrow">Для авторов</span>
          <h2>Опубликуйте свой проект за пять минут</h2>
          <p class="muted">Загрузите файл, отметьте версии игры и загрузчики, и проект появится в поиске. В панели автора видно загрузки по дням и подписчиков.</p>
          <div class="row"><button class="btn btn-primary" data-action="createProject">${ic('plus')}Создать проект</button><a class="btn" href="#/about">Правила публикации</a></div>
        </div>
        <ol class="steps">
          <li><span><b>Создайте проект.</b> Название, краткое описание и тип: мод, сборка, шейдер или другой.</span></li>
          <li><span><b>Загрузите версию.</b> Файл, номер версии, совместимость и журнал изменений.</span></li>
          <li><span><b>Опубликуйте.</b> Подписчики получат уведомление о каждой новой версии.</span></li>
        </ol>
      </section>
    </div>`,
  };
});
F.heroSearch = (f) => { const q = formData(f).q.trim(); go(`/mods${q ? `?q=${encodeURIComponent(q)}` : ''}`); };

/* ---------------- Каталог ---------------- */
const SORTS = { relevance: 'По релевантности', downloads: 'По загрузкам', follows: 'По подписчикам', newest: 'Сначала новые', updated: 'Недавно обновлённые' };
function searchProjects(type, s) {
  let list = db.projects.filter((p) => p.type === type && isListed(p));
  if (s.c.length) list = list.filter((p) => s.c.every((c) => p.categories.includes(c)));
  if (s.l.length) list = list.filter((p) => s.l.some((l) => p.loaders.includes(l)));
  if (s.v.length) list = list.filter((p) => s.v.some((v) => p.gameVersions.includes(v)));
  if (s.e.includes('client')) list = list.filter((p) => p.clientSide !== 'unsupported');
  if (s.e.includes('server')) list = list.filter((p) => p.serverSide !== 'unsupported');
  if (s.os) list = list.filter((p) => p.license !== 'ARR');
  const q = s.q.trim().toLowerCase();
  const score = new Map();
  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const author = authorOf(p);
      const hay = { title: p.title.toLowerCase(), summary: p.summary.toLowerCase(), tags: p.categories.map((c) => catLabel(p.type, c).toLowerCase()).join(' '), author: `${author?.username} ${author?.displayName}`.toLowerCase(), desc: p.description.toLowerCase() };
      let sc = 0;
      for (const w of words) {
        let ws = 0;
        if (hay.title.startsWith(w)) ws += 14; if (hay.title.includes(w)) ws += 10;
        if (hay.tags.includes(w)) ws += 5; if (hay.summary.includes(w)) ws += 4;
        if (hay.author.includes(w)) ws += 3; if (hay.desc.includes(w)) ws += 1;
        if (!ws) return false; sc += ws;
      }
      score.set(p.id, sc + Math.log10(p.downloads + 10)); return true;
    });
  }
  const sort = s.s === 'relevance' && !q ? 'downloads' : s.s;
  const by = {
    relevance: (a, b) => score.get(b.id) - score.get(a.id), downloads: (a, b) => b.downloads - a.downloads,
    follows: (a, b) => b.followers - a.followers, newest: (a, b) => b.created - a.created, updated: (a, b) => b.updated - a.updated,
  }[sort] || ((a, b) => b.downloads - a.downloads);
  return list.sort(by);
}
route(/^\/(mods|modpacks|resourcepacks|shaders|plugins|datapacks)$/, (path, query) => {
  const type = TYPE_BY_PATH[path]; const T = TYPES[type];
  const split = (v) => (v ? String(v).split(',').filter(Boolean) : []);
  const s = {
    q: query.q || '', c: split(query.c), l: split(query.l), v: split(query.v), e: split(query.e), os: query.os === '1',
    s: SORTS[query.s] ? query.s : (query.q ? 'relevance' : 'downloads'), p: Math.max(1, parseInt(query.p, 10) || 1),
    n: [10, 20, 50].includes(+query.n) ? +query.n : 20, view: query.view || prefs.view || 'list',
  };
  const cats = CATEGORIES[type]; const loaders = LOADERS_BY_TYPE[type];
  const chk = (name, value, label, on) => `<label class="check"><input type="checkbox" data-f="${name}" value="${esc(value)}" ${on ? 'checked' : ''}>${label}</label>`;
  const gvAll = s.v.length > 0 || query.allv === '1';
  const filtersHtml = `
    <div class="filter-group"><h4>Категории</h4>${Object.entries(cats).map(([k, l]) => chk('c', k, esc(l), s.c.includes(k))).join('')}</div>
    ${loaders.length > 1 ? `<div class="filter-group"><h4>${type === 'shader' ? 'Загрузчик шейдеров' : type === 'plugin' ? 'Платформа' : 'Загрузчик'}</h4>${loaders.map((l) => chk('l', l, `<span class="dot" style="width:9px;height:9px;border-radius:2px;background:${LOADERS[l].color}"></span>${esc(LOADERS[l].label)}`, s.l.includes(l))).join('')}</div>` : ''}
    <div class="filter-group"><h4>Версия игры</h4><div id="gv-list">${GAME_VERSIONS.map((v, i) => `<div ${i >= 6 && !gvAll ? 'hidden' : ''} data-gv>${chk('v', v, `<span class="mono">${v}</span>`, s.v.includes(v))}</div>`).join('')}</div>
      ${gvAll ? '' : `<button class="linkish" data-action="showAllVersions">Показать все версии</button>`}</div>
    ${type === 'mod' || type === 'modpack' ? `<div class="filter-group"><h4>Окружение</h4>${chk('e', 'client', 'Клиент', s.e.includes('client'))}${chk('e', 'server', 'Сервер', s.e.includes('server'))}</div>` : ''}
    <div class="filter-group"><h4>Лицензия</h4>${chk('os', '1', 'Только с открытым кодом', s.os)}</div>`;
  const update = () => {
    setQuery(`/${path}`, { q: s.q, c: s.c, l: s.l, v: s.v, e: s.e, os: s.os ? '1' : '', s: s.s === (s.q ? 'relevance' : 'downloads') ? '' : s.s, p: s.p > 1 ? s.p : '', n: s.n !== 20 ? s.n : '', view: s.view !== 'list' ? s.view : '' });
    const all = searchProjects(type, s);
    const pages = Math.max(1, Math.ceil(all.length / s.n)); if (s.p > pages) s.p = pages;
    const items = all.slice((s.p - 1) * s.n, s.p * s.n);
    const chips = [
      ...s.c.map((c) => ['c', c, catLabel(type, c)]), ...s.l.map((l) => ['l', l, LOADERS[l].label]),
      ...s.v.map((v) => ['v', v, v]), ...s.e.map((e) => ['e', e, e === 'client' ? 'Клиент' : 'Сервер']), ...(s.os ? [['os', '1', 'Открытый код']] : []),
    ];
    $('#active-filters').innerHTML = chips.length ? `${chips.map(([k, v, l]) => `<button class="chip" data-action="dropFilter" data-k="${k}" data-v="${esc(v)}" aria-label="Убрать фильтр ${esc(l)}">${esc(l)} ${ic('x').replace('<svg', '<svg width="12" height="12"')}</button>`).join('')}<button class="chip" data-action="clearFilters">Сбросить всё</button>` : '';
    $('#result-count').textContent = `${fmtInt(all.length)} ${plural(all.length, 'проект', 'проекта', 'проектов')}`;
    $('#results').innerHTML = items.length
      ? (s.view === 'grid' ? `<div class="p-grid">${items.map(projectCard).join('')}</div>` : `<div class="p-list">${items.map((p) => projectRow(p)).join('')}</div>`)
      : emptyState('search', 'Ничего не нашлось', 'Попробуйте убрать часть фильтров или изменить запрос.', chips.length ? '<button class="btn" data-action="clearFilters">Сбросить фильтры</button>' : '');
    $('#pager').innerHTML = pagination(s.p, pages, 'browsePage');
    $$('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.view === s.view));
  };
  A.browsePage = (el) => { s.p = +el.dataset.page; update(); $('#app').scrollIntoView({ behavior: 'smooth' }); };
  A.dropFilter = (el) => {
    const { k, v } = el.dataset;
    if (k === 'os') s.os = false; else s[k] = s[k].filter((x) => x !== v);
    const cb = $(`input[data-f="${k}"][value="${CSS.escape(v)}"]`); if (cb) cb.checked = false;
    s.p = 1; update();
  };
  A.clearFilters = () => { s.c = []; s.l = []; s.v = []; s.e = []; s.os = false; s.p = 1; $$('input[data-f]').forEach((i) => { i.checked = false; }); update(); };
  A.showAllVersions = (el) => { $$('[data-gv]').forEach((d) => { d.hidden = false; }); el.remove(); };
  A.setView = (el) => { s.view = el.dataset.view; prefs.view = s.view; savePrefs(); update(); };
  A.toggleFilters = () => $('.filters').classList.toggle('open');
  return {
    title: T.label,
    html: `<div class="container">
      <div class="page-head"><div><h1>${T.label}</h1><p class="muted">${{ mod: 'Моды меняют и дополняют игру. Ставятся через загрузчик: Fabric, Forge, NeoForge или Quilt.', modpack: 'Готовые наборы модов с настройками. Импортируются в лаунчер одним файлом.', resourcepack: 'Текстуры, звуки, модели и интерфейс. Работают без модов.', shader: 'Свет, тени, вода и небо. Нужен Iris или OptiFine.', plugin: 'Расширения для серверов на Paper, Spigot, Purpur и других платформах.', datapack: 'Меняют игру без модов: рецепты, механики, генерация мира.' }[type]}</p></div>
        <button class="btn" data-action="createProject">${ic('upload')}Опубликовать ${T.acc}</button></div>
      <div class="browse">
        <aside class="filters" aria-label="Фильтры">${filtersHtml}</aside>
        <section style="min-width:0">
          <div class="toolbar">
            <div class="search-box">${ic('search')}<input class="input" id="browse-q" type="search" value="${esc(s.q)}" placeholder="Искать среди: ${esc(T.label.toLowerCase())}" aria-label="Поиск"></div>
            <select class="select" id="browse-sort" aria-label="Сортировка">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${k === s.s ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <select class="select" id="browse-n" aria-label="На странице">${[10, 20, 50].map((n) => `<option value="${n}" ${n === s.n ? 'selected' : ''}>По ${n}</option>`).join('')}</select>
            <div class="seg" role="group" aria-label="Вид"><button data-action="setView" data-view="list" aria-label="Списком">${ic('list')}</button><button data-action="setView" data-view="grid" aria-label="Плиткой">${ic('grid')}</button></div>
            <button class="btn filters-toggle" data-action="toggleFilters">${ic('filter')}Фильтры</button>
          </div>
          <div class="active-filters" id="active-filters"></div>
          <div class="result-count" id="result-count" aria-live="polite"></div>
          <div id="results"></div>
          <div id="pager"></div>
        </section>
      </div></div>`,
    after(root) {
      update();
      const qIn = $('#browse-q', root);
      qIn.addEventListener('input', debounce(() => { const had = !!s.q; s.q = qIn.value; if (!had && s.q && s.s === 'downloads') { s.s = 'relevance'; $('#browse-sort').value = 'relevance'; } s.p = 1; update(); }, 180));
      $('#browse-sort', root).addEventListener('change', (e) => { s.s = e.target.value; s.p = 1; update(); });
      $('#browse-n', root).addEventListener('change', (e) => { s.n = +e.target.value; s.p = 1; update(); });
      $('.filters', root).addEventListener('change', (e) => {
        const i = e.target.closest('input[data-f]'); if (!i) return;
        const k = i.dataset.f;
        if (k === 'os') s.os = i.checked; else s[k] = i.checked ? [...new Set([...s[k], i.value])] : s[k].filter((x) => x !== i.value);
        s.p = 1; update();
      });
    },
  };
});

/* ---------------- Проект ---------------- */
function projectHeader(p) {
  const following = isFollowing(p); const vs = versionsOf(p.id);
  return `
    ${p.status === 'draft' ? `<div class="notice">${ic('info')}<div><b>Это черновик.</b> Его видите только вы и участники проекта. ${vs.length ? 'Когда всё будет готово, опубликуйте проект в настройках.' : 'Загрузите хотя бы одну версию, а затем опубликуйте проект.'} <a href="#/project/${esc(p.slug)}/settings">Открыть настройки</a></div></div>` : ''}
    ${p.status === 'unlisted' ? `<div class="notice">${ic('eye')}<div><b>Проект доступен только по ссылке.</b> Он не показывается в поиске и на главной.</div></div>` : ''}
    ${p.status === 'withheld' ? `<div class="notice danger">${ic('alert')}<div><b>Проект скрыт модерацией.</b> Его не видно в каталоге. Исправьте нарушения и напишите модератору через жалобу или в сообществе.</div></div>` : ''}
    <header class="proj-head">
      <img class="p-icon" src="${esc(projectIcon(p))}" alt="" width="96" height="96">
      <div style="min-width:0">
        <h1>${esc(p.title)} ${statusBadge(p)}</h1>
        <p class="summary">${esc(p.summary)}</p>
        <div class="stats">
          <span>${ic('download')}<b class="num">${fmtInt(p.downloads)}</b> ${plural(p.downloads, 'загрузка', 'загрузки', 'загрузок')}</span>
          <span>${ic('heart')}<b class="num">${fmtInt(p.followers)}</b> ${plural(p.followers, 'подписчик', 'подписчика', 'подписчиков')}</span>
          <span>${ic('tag')}${esc(TYPES[p.type].one)}</span>
          <span title="${esc(fmtDate(p.updated))}">${ic('clock')}Обновлён ${esc(timeAgo(p.updated))}</span>
        </div>
        <div class="chips" style="margin-top:12px">${catChips(p, 6)}</div>
      </div>
      <div class="proj-actions">
        <button class="btn btn-primary btn-lg" data-action="downloadModal" data-id="${p.id}" ${vs.length ? '' : 'disabled'}>${ic('download')}Скачать</button>
        <button class="btn btn-lg btn-icon ${following ? 'btn-active' : ''}" data-action="follow" data-id="${p.id}" aria-pressed="${following}" title="${following ? 'Отписаться' : 'Подписаться на обновления'}" aria-label="${following ? 'Отписаться' : 'Подписаться'}">${ic('heart')}</button>
        <button class="btn btn-lg btn-icon" data-action="saveToCollection" data-id="${p.id}" title="Добавить в коллекцию" aria-label="Добавить в коллекцию">${ic('bookmark')}</button>
        <div class="dropdown">
          <button class="btn btn-lg btn-icon" data-action="toggleMenu" aria-label="Ещё">${ic('dots')}</button>
          <div class="dropdown-menu">
            ${canEdit(p) ? `<a href="#/project/${esc(p.slug)}/settings">${ic('settings')}Настройки проекта</a>` : ''}
            <button data-action="copyLink" data-text="${esc(`${location.href.split('#')[0]}#/project/${p.slug}`)}">${ic('link')}Скопировать ссылку</button>
            <button data-action="copyLink" data-text="${esc(p.id)}">${ic('copy')}Скопировать ID</button>
            ${isMember(p) ? '' : `<hr><button data-action="report" data-id="${p.id}">${ic('flag')}Пожаловаться</button>`}
          </div>
        </div>
      </div>
    </header>`;
}
function projectSide(p) {
  const L = p.links || {};
  const linkDefs = [['source', 'code', 'Исходный код'], ['issues', 'bug', 'Сообщить об ошибке'], ['wiki', 'book', 'Вики'], ['discord', 'chat', 'Сообщество'], ['donate', 'coin', 'Поддержать автора']];
  const links = linkDefs.filter(([k]) => L[k]).map(([k, i, l]) => `<a href="${esc(L[k])}" target="_blank" rel="noopener noreferrer nofollow">${ic(i)}${l}</a>`).join('');
  const more = db.projects.filter((x) => x.ownerId === p.ownerId && x.id !== p.id && isListed(x)).sort((a, b) => b.downloads - a.downloads).slice(0, 4);
  return `<aside class="side">
    <div class="panel"><h3>Совместимость</h3>
      <div class="stack" style="gap:10px">
        <div><div class="faint" style="font-size:.84rem;margin-bottom:6px">Minecraft: Java Edition</div><div class="chips">${p.gameVersions.length ? compactVersions(p.gameVersions).map((v) => `<span class="chip mono">${esc(v)}</span>`).join('') : '<span class="faint">Пока нет версий</span>'}</div></div>
        ${p.loaders.length ? `<div><div class="faint" style="font-size:.84rem;margin-bottom:6px">${p.type === 'plugin' ? 'Платформы' : 'Загрузчики'}</div><div class="chips">${p.loaders.map(loaderChip).join('')}</div></div>` : ''}
        <div><div class="faint" style="font-size:.84rem;margin-bottom:6px">Окружение</div><span class="chip">${ic(p.clientSide !== 'unsupported' ? 'monitor' : 'server').replace('<svg', '<svg width="13" height="13"')}${esc(envLabel(p))}</span></div>
      </div></div>
    ${links ? `<div class="panel"><h3>Ссылки</h3><div class="link-list">${links}</div></div>` : ''}
    <div class="panel"><h3>Авторы</h3>${p.members.map((m) => { const u = userById(m.userId); return u ? `<a class="member" href="#/user/${esc(u.username)}"><img class="avatar" src="${esc(userAvatar(u))}" width="36" height="36" alt=""><span><b>${esc(u.displayName)}</b><small>${esc(m.role)}</small></span></a>` : ''; }).join('')}</div>
    <div class="panel"><h3>Сведения</h3><dl class="kv">
      <dt>Лицензия</dt><dd>${esc(LICENSES[p.license] || p.license)}</dd>
      <dt>Опубликован</dt><dd>${esc(fmtDate(p.created))}</dd>
      <dt>Обновлён</dt><dd>${esc(fmtDate(p.updated))}</dd>
      <dt>Версий</dt><dd class="num">${versionsOf(p.id).length}</dd>
    </dl></div>
    ${more.length ? `<div class="panel"><h3>Ещё от автора</h3><div class="mini-list">${more.map((x) => miniProject(x)).join('')}</div></div>` : ''}
  </aside>`;
}
function versionTable(p, vs, { compact = false } = {}) {
  if (!vs.length) return emptyState('file', 'Версий пока нет', canEdit(p) ? 'Загрузите первую версию, чтобы проект можно было скачать.' : 'Автор ещё не загрузил файлы.', canEdit(p) ? `<button class="btn btn-primary" data-action="newVersion" data-id="${p.id}">${ic('upload')}Загрузить версию</button>` : '');
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th></th><th>Версия</th><th>Совместимость</th>${compact ? '' : '<th>Опубликована</th>'}<th>Загрузки</th><th></th></tr></thead>
    <tbody>${vs.map((v) => `<tr>
      <td><span class="channel-mark badge-${v.channel}" title="${CHANNELS[v.channel]}">${CHANNELS[v.channel][0]}</span></td>
      <td><a class="t-name" href="#/project/${esc(p.slug)}/version/${v.id}">${esc(v.name)}</a><div class="t-sub mono">${esc(v.number)}</div></td>
      <td><div class="chips">${v.loaders.map(loaderChip).join('')}</div><div class="t-sub mono" style="margin-top:4px">${esc(compactVersions(v.gameVersions).join(', '))}</div></td>
      ${compact ? '' : `<td class="num" title="${esc(fmtDate(v.published))}">${esc(timeAgo(v.published))}</td>`}
      <td class="num">${fmtInt(v.downloads)}</td>
      <td style="text-align:right"><button class="btn btn-sm btn-icon btn-primary" data-action="downloadVersion" data-id="${v.id}" aria-label="Скачать ${esc(v.name)}" title="Скачать">${ic('download')}</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}
route(/^\/project\/([^/]+)(?:\/(gallery|changelog|versions))?$/, (slug, tab = 'description', query) => {
  const p = projBySlug(slug); if (!p) return loadMissingProject(slug);
  if (p.slug !== slug) return { redirect: `/project/${p.slug}${tab !== 'description' ? `/${tab}` : ''}` };
  const vs = versionsOf(p.id); const base = `#/project/${esc(p.slug)}`;
  const tabs = [['description', 'Описание', base, null], ['gallery', 'Галерея', `${base}/gallery`, p.gallery.length], ['changelog', 'Журнал изменений', `${base}/changelog`, null], ['versions', 'Версии', `${base}/versions`, vs.length]];
  let body = '';
  if (tab === 'description') {
    body = p.description.trim() ? `<div class="panel"><div class="md">${md(p.description)}</div></div>` : `<div class="panel">${emptyState('book', 'Описания пока нет')}</div>`;
    if (vs.length) body += `<div class="section-head" style="margin-top:24px"><h2>Последние версии</h2><a href="${base}/versions">Все версии</a></div>${versionTable(p, vs.slice(0, 3), { compact: true })}`;
  } else if (tab === 'gallery') {
    body = p.gallery.length ? `<div class="gallery-grid">${p.gallery.map((g, i) => `<figure class="g-item" style="margin:0"><button class="thumb" data-action="lightbox" data-id="${p.id}" data-i="${i}" aria-label="Открыть изображение ${esc(g.title)}"><img ${imgAttrs(galleryImg(g))} alt="${esc(g.title)}" loading="lazy"></button><figcaption class="cap"><b>${esc(g.title)}</b>${g.desc ? `<p>${esc(g.desc)}</p>` : ''}</figcaption></figure>`).join('')}</div>`
      : emptyState('image', 'В галерее пусто', canEdit(p) ? 'Добавьте скриншоты в настройках проекта.' : '', canEdit(p) ? `<a class="btn" href="${base}/settings/gallery">Добавить изображения</a>` : '');
  } else if (tab === 'changelog') {
    body = vs.length ? `<div class="stack" style="gap:14px">${vs.map((v) => `<article class="panel">
      <div class="row" style="justify-content:space-between"><div class="row"><span class="badge badge-${v.channel}">${CHANNELS[v.channel]}</span><a href="${base}/version/${v.id}" style="color:var(--fg);font-weight:700;font-size:1.05rem">${esc(v.name)}</a></div><span class="faint" style="font-size:.88rem">${esc(fmtDate(v.published))}</span></div>
      <div class="md" style="margin-top:10px">${v.changelog.trim() ? md(v.changelog) : '<p class="faint">Без описания изменений.</p>'}</div></article>`).join('')}</div>` : emptyState('clock', 'Журнал пуст', 'Изменения появятся вместе с первой версией.');
  } else if (tab === 'versions') {
    const fl = query.loader || '', fv = query.gv || '', fc = query.ch || '';
    const filtered = vs.filter((v) => (!fl || v.loaders.includes(fl)) && (!fv || v.gameVersions.includes(fv)) && (!fc || v.channel === fc));
    body = `<div class="toolbar">
      ${p.loaders.length > 1 ? `<select class="select" data-vfilter="loader" aria-label="Загрузчик"><option value="">Все загрузчики</option>${p.loaders.map((l) => `<option value="${l}" ${l === fl ? 'selected' : ''}>${esc(LOADERS[l]?.label || l)}</option>`).join('')}</select>` : ''}
      <select class="select" data-vfilter="gv" aria-label="Версия игры"><option value="">Все версии игры</option>${p.gameVersions.slice().reverse().map((v) => `<option ${v === fv ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="select" data-vfilter="ch" aria-label="Канал"><option value="">Все каналы</option>${Object.entries(CHANNELS).map(([k, l]) => `<option value="${k}" ${k === fc ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="spacer"></span>
      ${canEdit(p) ? `<button class="btn btn-primary" data-action="newVersion" data-id="${p.id}">${ic('upload')}Загрузить версию</button>` : ''}
    </div>${filtered.length || !vs.length ? versionTable(p, filtered) : emptyState('filter', 'Под фильтры не подходит ни одна версия')}`;
  }
  return {
    title: p.title,
    html: `<div class="container">${projectHeader(p)}
      <nav class="tabs" aria-label="Разделы проекта">${tabs.map(([k, l, h, n]) => `<a href="${h}" class="${k === tab ? 'active' : ''}">${l}${n ? `<span class="n">${n}</span>` : ''}</a>`).join('')}
        ${canEdit(p) ? `<a href="${base}/settings" style="margin-left:auto">${ic('settings').replace('<svg', '<svg width="16" height="16"')}Настройки</a>` : ''}</nav>
      <div class="proj-layout"><div style="min-width:0">${body}</div>${projectSide(p)}</div></div>`,
    after(root) {
      $$('[data-vfilter]', root).forEach((sel) => sel.addEventListener('change', () => {
        const q = {}; $$('[data-vfilter]', root).forEach((s) => { if (s.value) q[s.dataset.vfilter] = s.value; });
        setQuery(`/project/${p.slug}/versions`, q); rerender();
      }));
    },
  };
});
A.lightbox = (el) => {
  const p = projById(el.dataset.id); let i = +el.dataset.i;
  const lb = document.createElement('div'); lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Просмотр изображения');
  const draw = () => {
    const g = p.gallery[i];
    lb.innerHTML = `<button class="btn btn-icon lb-close" aria-label="Закрыть">${ic('x')}</button>
      ${p.gallery.length > 1 ? `<button class="btn btn-icon lb-nav lb-prev" aria-label="Предыдущее">${ic('chevL')}</button><button class="btn btn-icon lb-nav lb-next" aria-label="Следующее">${ic('chevR')}</button>` : ''}
      <figure><img ${imgAttrs(galleryImg(g))} alt="${esc(g.title)}"><figcaption><b>${esc(g.title)}</b>${g.desc ? ` — ${esc(g.desc)}` : ''} <span style="opacity:.6">(${i + 1} из ${p.gallery.length})</span></figcaption></figure>`;
    $('.lb-close', lb).focus();
  };
  lb.addEventListener('click', (e) => {
    if (e.target.closest('.lb-close') || e.target === lb) lb.remove();
    else if (e.target.closest('.lb-next')) { i = (i + 1) % p.gallery.length; draw(); }
    else if (e.target.closest('.lb-prev')) { i = (i - 1 + p.gallery.length) % p.gallery.length; draw(); }
  });
  document.body.append(lb); draw();
};
A.copyLink = async (el) => {
  const text = el.dataset.text;
  try { await navigator.clipboard.writeText(text); toast('Скопировано в буфер обмена.'); }
  catch { openModal({ title: 'Скопируйте вручную', body: `<input class="input mono" id="copy-field" value="${esc(text)}" readonly>`, onMount: (m) => $('#copy-field', m).select() }); }
};
A.follow = async (el) => {
  const u = me(); if (!u) { go(`/auth/signin?next=${encodeURIComponent(parseHash().path)}`); return; }
  const p = projById(el.dataset.id); const was = isFollowing(p);
  try {
    await busy(el, () => api(was ? 'DELETE' : 'POST', `/api/projects/${p.id}/follow`), '…');
    toast(was ? `Вы отписались от ${p.title}.` : `Вы подписались на ${p.title}. Мы сообщим о новых версиях.`);
    rerender();
  } catch (e) { toast(e.message, 'error'); }
};

/* Проект, которого нет в общих данных (например, доступный только по ссылке), загружаем отдельно */
const missingTried = new Map();
function loadMissingProject(slug) {
  const t = missingTried.get(slug);
  if (t && Date.now() - t < 2000) return pageNotFound('Проект не найден', 'Возможно, его удалили, скрыли или ссылка с опечаткой.');
  missingTried.set(slug, Date.now());
  api('GET', `/api/projects/${encodeURIComponent(slug)}`).then((b) => {
    for (const p of b.projects) if (!projById(p.id)) db.projects.push(p);
    for (const v of b.versions) if (!versionById(v.id)) db.versions.push(v);
  }).catch(() => {}).finally(() => rerender());
  return { title: 'Загрузка', html: '<div class="container"><p class="muted">Загружаем проект…</p></div>' };
}

/* ---------------- Скачивание ---------------- */
function bestVersion(p, gv, loader) {
  const vs = versionsOf(p.id).filter((v) => (!gv || v.gameVersions.includes(gv)) && (!loader || v.loaders.includes(loader)));
  return vs.find((v) => v.channel === 'release') || vs[0] || null;
}
function downloadFile(v, f) {
  const a = document.createElement('a');
  a.href = `/download/${encodeURIComponent(f.id)}`; a.download = '';
  document.body.append(a); a.click(); a.remove();
  v.downloads++; const p = projById(v.projectId); if (p) p.downloads++;
  toast(f.hasFile ? `Скачивание: ${f.name}` : `Скачивание: ${f.name}. У демо-проектов вместо файла текстовая заглушка.`);
  if (parseHash().path.startsWith('/project/')) rerender();
}
A.downloadVersion = (el) => { const v = versionById(el.dataset.id); const f = v.files.find((x) => x.id === el.dataset.file) || v.files.find((x) => x.primary) || v.files[0]; if (f) downloadFile(v, f); };
A.downloadModal = (el) => {
  const p = projById(el.dataset.id);
  const gvs = p.gameVersions.slice().reverse();
  let gv = gvs[0] || '', loader = p.loaders.length > 1 ? p.loaders[0] : '';
  openModal({
    title: `Скачать ${p.title}`,
    body: `<div class="field-row">
        <div class="field"><label for="dl-gv">Версия игры</label><select class="select" id="dl-gv">${gvs.map((v) => `<option>${v}</option>`).join('')}</select></div>
        ${p.loaders.length > 1 ? `<div class="field"><label for="dl-loader">${p.type === 'plugin' ? 'Платформа' : 'Загрузчик'}</label><select class="select" id="dl-loader">${p.loaders.map((l) => `<option value="${l}">${esc(LOADERS[l]?.label || l)}</option>`).join('')}</select></div>` : ''}
      </div><div id="dl-out"></div>
      <p class="faint" style="font-size:.86rem">${TYPES[p.type].folder ? `Положите файл в папку <code class="mono">${TYPES[p.type].folder}</code>.` : 'Импортируйте архив в лаунчер, который поддерживает сборки.'} <a href="#/project/${esc(p.slug)}/versions" data-close>Все версии</a></p>`,
    onMount(m) {
      const draw = () => {
        const v = bestVersion(p, gv, loader); const f = v && (v.files.find((x) => x.primary) || v.files[0]);
        $('#dl-out', m).innerHTML = v && f ? `<div class="dl-result"><span class="channel-mark badge-${v.channel}">${CHANNELS[v.channel][0]}</span><div class="info"><b>${esc(v.name)}</b><span class="faint mono" style="font-size:.82rem">${esc(f.name)} · ${fmtSize(f.size)}</span></div><button class="btn btn-primary" data-action="downloadVersion" data-id="${v.id}" data-file="${f.id}">${ic('download')}Скачать</button></div>`
          : `<div class="notice danger">${ic('alert')}<div>Для этой версии игры${loader ? ` и загрузчика ${esc(LOADERS[loader]?.label)}` : ''} файлов нет. Выберите другую комбинацию.</div></div>`;
      };
      $('#dl-gv', m).addEventListener('change', (e) => { gv = e.target.value; draw(); });
      $('#dl-loader', m)?.addEventListener('change', (e) => { loader = e.target.value; draw(); });
      draw();
    },
  });
};

/* ---------------- Версия ---------------- */
route(/^\/project\/([^/]+)\/version\/([^/]+)$/, (slug, vid) => {
  const p = projBySlug(slug); if (!p) return loadMissingProject(slug);
  const v = versionById(vid);
  if (!v || v.projectId !== p.id) return pageNotFound('Версия не найдена');
  const author = userById(v.authorId);
  const deps = v.deps.map((d) => ({ ...d, p: projById(d.projectId) })).filter((d) => d.p);
  const depLabel = { required: 'Обязательная', optional: 'Необязательная', incompatible: 'Несовместима' };
  return {
    title: `${v.name} — ${p.title}`,
    html: `<div class="container">
      <a href="#/project/${esc(p.slug)}/versions" class="row" style="gap:6px;margin-bottom:16px;width:fit-content">${ic('arrowL').replace('<svg', '<svg width="16" height="16"')}${esc(p.title)}: все версии</a>
      <div class="page-head"><div><div class="row"><span class="badge badge-${v.channel}">${CHANNELS[v.channel]}</span><span class="mono faint">${esc(v.number)}</span></div><h1 style="margin-top:8px">${esc(v.name)}</h1></div>
        <div class="row">${canEdit(p) ? `<button class="btn" data-action="editVersion" data-id="${v.id}">${ic('edit')}Изменить</button><button class="btn btn-danger" data-action="deleteVersion" data-id="${v.id}">${ic('trash')}Удалить</button>` : ''}
        <button class="btn btn-primary" data-action="downloadVersion" data-id="${v.id}">${ic('download')}Скачать</button></div></div>
      <div class="proj-layout"><div class="stack" style="gap:16px;min-width:0">
        <section class="panel"><h3>Файлы</h3><div class="stack" style="gap:8px">${v.files.map((f) => `<div class="file-row">${ic('file').replace('<svg', '<svg width="18" height="18"')}<span class="fn">${esc(f.name)}</span>${f.primary ? '<span class="badge badge-release">Основной</span>' : ''}<span class="faint num">${fmtSize(f.size)}</span><button class="btn btn-sm" data-action="downloadVersion" data-id="${v.id}" data-file="${f.id}">${ic('download')}Скачать</button></div>`).join('')}</div></section>
        <section class="panel"><h3>Изменения</h3><div class="md">${v.changelog.trim() ? md(v.changelog) : '<p class="faint">Автор не описал изменения.</p>'}</div></section>
        ${deps.length ? `<section class="panel"><h3>Зависимости</h3><div class="mini-list">${deps.map((d) => miniProject(d.p, depLabel[d.type])).join('')}</div></section>` : ''}
      </div>
      <aside class="side"><div class="panel"><h3>Сведения</h3><dl class="kv">
        <dt>Проект</dt><dd><a href="#/project/${esc(p.slug)}">${esc(p.title)}</a></dd>
        <dt>Номер</dt><dd class="mono">${esc(v.number)}</dd>
        <dt>Канал</dt><dd>${CHANNELS[v.channel]}</dd>
        <dt>${p.type === 'plugin' ? 'Платформы' : 'Загрузчики'}</dt><dd>${v.loaders.map((l) => esc(LOADERS[l]?.label || l)).join(', ')}</dd>
        <dt>Версии игры</dt><dd class="mono">${esc(v.gameVersions.join(', '))}</dd>
        <dt>Загрузки</dt><dd class="num">${fmtInt(v.downloads)}</dd>
        <dt>Опубликована</dt><dd>${esc(fmtDate(v.published))}</dd>
        <dt>Автор</dt><dd>${author ? `<a href="#/user/${esc(author.username)}">${esc(author.displayName)}</a>` : '—'}</dd>
      </dl></div></aside></div></div>`,
  };
});

/* =====================================================================
   Создание и редактирование проектов, версии
   ===================================================================== */
const errText = (e) => (e && e.message) || 'Что-то пошло не так. Попробуйте ещё раз.';
const submitBtn = (f) => $('button[type=submit]', f) || $(`button[form="${f.id}"]`);

A.createProject = () => {
  const u = me(); if (!u) { toast('Войдите, чтобы опубликовать проект.'); go('/auth/signin?next=%2Fdashboard%2Fprojects'); return; }
  let slugTouched = false;
  openModal({
    title: 'Новый проект',
    body: `<form data-form="createProject" id="create-form" class="stack" style="gap:14px">
      <div class="field"><span class="field-label">Тип</span><div class="check-grid">${Object.entries(TYPES).map(([k, t], i) => `<label class="pick"><input type="radio" name="type" value="${k}" ${i === 0 ? 'checked' : ''}>${ic(t.icon).replace('<svg', '<svg width="18" height="18"')}${t.one}</label>`).join('')}</div></div>
      <div class="field"><label for="cp-title">Название</label><input class="input" id="cp-title" name="title" maxlength="64" required placeholder="Например: Cozy Lanterns"></div>
      <div class="field"><label for="cp-slug">Адрес</label><input class="input mono" id="cp-slug" name="slug" maxlength="48" required pattern="[a-z0-9\\-]+"><span class="hint">Будет доступен по ссылке #/project/<span id="cp-slug-preview">…</span>. Только латиница, цифры и дефис.</span></div>
      <div class="field"><label for="cp-summary">Кратко о проекте</label><input class="input" id="cp-summary" name="summary" maxlength="140" required placeholder="Одна фраза, которая видна в поиске"></div>
      <div class="field"><label for="cp-status">Видимость после публикации</label><select class="select" id="cp-status" name="visibility"><option value="published">В каталоге</option><option value="unlisted">Только по ссылке</option></select><span class="hint">Проект создаётся черновиком. Опубликовать его можно после загрузки первой версии.</span></div>
    </form>`,
    foot: '<button class="btn" data-close>Отмена</button><button class="btn btn-primary" type="submit" form="create-form">Создать черновик</button>',
    onMount(m) {
      const t = $('#cp-title', m), s = $('#cp-slug', m), pv = $('#cp-slug-preview', m);
      t.addEventListener('input', () => { if (!slugTouched) { s.value = slugify(t.value); pv.textContent = s.value || '…'; } });
      s.addEventListener('input', () => { slugTouched = true; s.value = s.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); pv.textContent = s.value || '…'; });
    },
  });
};
F.createProject = async (f) => {
  const d = formData(f);
  try {
    const r = await busy(submitBtn(f), () => api('POST', '/api/projects', { type: d.type, title: d.title, slug: d.slug, summary: d.summary, visibility: d.visibility }), 'Создаём…');
    modalStack.slice().forEach((m) => m.close());
    toast('Черновик создан. Заполните описание и загрузите первую версию.');
    go(`/project/${r.slug}/settings`);
  } catch (e) { fieldError(f, errText(e)); }
};

const SETTINGS_SECTIONS = [['general', 'Основное', 'settings'], ['description', 'Описание', 'book'], ['gallery', 'Галерея', 'image'], ['versions', 'Версии', 'file'], ['links', 'Ссылки', 'link'], ['members', 'Участники', 'users']];
route(/^\/project\/([^/]+)\/settings(?:\/([a-z]+))?$/, (slug, section = 'general') => {
  if (!me()) return requireLogin();
  const p = projBySlug(slug); if (!p || !canEdit(p)) return pageNotFound('Нет доступа', 'Настройки проекта доступны только его участникам.');
  const base = `/project/${p.slug}/settings`; const vs = versionsOf(p.id);
  let body = ''; let after = null;
  if (section === 'general') {
    const cats = CATEGORIES[p.type];
    body = `<div class="panel"><h2>Основное</h2>
      <div class="icon-edit" style="margin:18px 0"><img class="p-icon" src="${esc(projectIcon(p))}" alt="Иконка проекта" width="96" height="96">
        <div class="stack" style="gap:8px"><label class="btn" for="icon-file" id="icon-label">${ic('upload')}Загрузить иконку</label><input type="file" id="icon-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        ${p.icon ? `<button class="btn btn-ghost btn-sm" data-action="removeIcon" data-id="${p.id}">Вернуть сгенерированную</button>` : ''}<span class="hint faint" style="font-size:.82rem">Квадрат, будет уменьшен до 256×256.</span></div></div>
      <form data-form="projGeneral" data-id="${p.id}" class="stack" style="gap:16px">
        <div class="field"><label for="pg-title">Название</label><input class="input" id="pg-title" name="title" value="${esc(p.title)}" maxlength="64" required></div>
        <div class="field"><label for="pg-slug">Адрес</label><input class="input mono" id="pg-slug" name="slug" value="${esc(p.slug)}" maxlength="48" required pattern="[a-z0-9\\-]+"></div>
        <div class="field"><label for="pg-summary">Кратко о проекте</label><input class="input" id="pg-summary" name="summary" value="${esc(p.summary)}" maxlength="140" required></div>
        <div class="field"><span class="field-label">Категории</span><span class="hint">Выберите до пяти. Они помогают найти проект через фильтры.</span><div class="check-grid">${Object.entries(cats).map(([k, l]) => `<label class="check"><input type="checkbox" name="categories" value="${k}" ${p.categories.includes(k) ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div></div>
        <div class="field-row">
          <div class="field"><label for="pg-client">Нужен на клиенте</label><select class="select" id="pg-client" name="clientSide">${Object.entries(SIDES).map(([k, l]) => `<option value="${k}" ${p.clientSide === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="pg-server">Нужен на сервере</label><select class="select" id="pg-server" name="serverSide">${Object.entries(SIDES).map(([k, l]) => `<option value="${k}" ${p.serverSide === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="pg-license">Лицензия</label><select class="select" id="pg-license" name="license">${Object.entries(LICENSES).map(([k, l]) => `<option value="${k}" ${p.license === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="pg-status">Статус</label><select class="select" id="pg-status" name="status" ${p.status === 'withheld' && !isAdmin() ? 'disabled' : ''}>${Object.entries(STATUSES).filter(([k]) => k !== 'withheld' || isAdmin() || p.status === 'withheld').map(([k, l]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="hint">${vs.length ? 'Черновик видят только участники.' : 'Чтобы опубликовать, загрузите хотя бы одну версию.'}</span></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${ic('check')}Сохранить</button></div>
      </form></div>
      ${isOwner(p) || isAdmin() ? `<div class="panel danger-zone" style="margin-top:16px"><h2>Удаление</h2><p class="muted" style="margin:8px 0 14px">Проект, все его версии, файлы и изображения будут удалены. Отменить это нельзя.</p><button class="btn btn-danger" data-action="deleteProject" data-id="${p.id}">${ic('trash')}Удалить проект</button></div>` : ''}`;
    after = (root) => {
      $('#icon-file', root).addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const label = $('#icon-label', root); label.textContent = 'Загружаем…';
        try {
          const blob = await imageToSquareBlob(file, 256);
          const up = await uploadFile(blob, file.name, 'image');
          await api('PATCH', `/api/projects/${p.id}`, { icon: up.id });
          toast('Иконка обновлена.'); rerender();
        } catch (err) { toast(errText(err), 'error'); label.innerHTML = `${ic('upload')}Загрузить иконку`; }
      });
    };
  } else if (section === 'description') {
    body = `<div class="panel"><form data-form="projDescription" data-id="${p.id}" class="stack" style="gap:14px">
      <div class="row" style="justify-content:space-between"><h2>Описание</h2><div class="tab-switch" role="tablist"><button type="button" class="on" data-mode="edit">Редактор</button><button type="button" data-mode="preview">Предпросмотр</button></div></div>
      <p class="muted" style="font-size:.9rem">Поддерживается Markdown: <code class="mono">## заголовок</code>, <code class="mono">**жирный**</code>, <code class="mono">*курсив*</code>, списки, ссылки, цитаты, таблицы и блоки кода.</p>
      <textarea class="textarea code" id="pd-text" name="description" maxlength="${LIMITS.descriptionChars}" style="min-height:420px" aria-label="Текст описания">${esc(p.description)}</textarea>
      <div class="md panel" id="pd-preview" hidden></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${ic('check')}Сохранить описание</button></div></form></div>`;
    after = (root) => {
      $$('.tab-switch button', root).forEach((b) => b.addEventListener('click', () => {
        const prev = b.dataset.mode === 'preview';
        $$('.tab-switch button', root).forEach((x) => x.classList.toggle('on', x === b));
        $('#pd-text', root).hidden = prev; $('#pd-preview', root).hidden = !prev;
        if (prev) $('#pd-preview', root).innerHTML = md($('#pd-text', root).value) || '<p class="faint">Пусто.</p>';
      }));
    };
  } else if (section === 'gallery') {
    body = `<div class="panel"><h2>Галерея</h2><p class="muted" style="margin:6px 0 16px">Скриншоты показываются на вкладке «Галерея». Изображение с отметкой «Обложка» видно в карточке проекта.</p>
      <form data-form="galleryAdd" data-id="${p.id}" class="stack" style="gap:12px">
        <label class="dropzone" for="g-file" id="g-drop">${ic('image')}<b>Выберите изображение</b><span id="g-file-name" style="font-size:.86rem">PNG, JPG, WebP или GIF, до 10 МБ</span></label>
        <input type="file" id="g-file" name="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        <div class="field-row"><div class="field"><label for="g-title">Подпись</label><input class="input" id="g-title" name="title" maxlength="80" placeholder="Например: База у водопада"></div>
        <div class="field"><label for="g-desc">Описание</label><input class="input" id="g-desc" name="desc" maxlength="200"></div></div>
        <label class="check"><input type="checkbox" name="featured" value="1">Сделать обложкой</label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${ic('upload')}Добавить</button></div>
      </form></div>
      <div class="gallery-grid" style="margin-top:16px">${p.gallery.map((g) => `<div class="g-item"><img ${imgAttrs(galleryImg(g))} alt="${esc(g.title)}" loading="lazy"><div class="cap"><b>${esc(g.title)}</b>${g.desc ? `<p>${esc(g.desc)}</p>` : ''}
        <div class="row" style="margin-top:10px">${g.featured ? '<span class="badge badge-release">Обложка</span>' : `<button class="btn btn-sm" data-action="galleryFeature" data-id="${p.id}" data-g="${g.id}">Сделать обложкой</button>`}<span class="spacer"></span><button class="btn btn-sm btn-danger btn-icon" data-action="galleryDelete" data-id="${p.id}" data-g="${g.id}" aria-label="Удалить">${ic('trash')}</button></div></div></div>`).join('')}</div>`;
    after = (root) => {
      const input = $('#g-file', root), drop = $('#g-drop', root);
      input.addEventListener('change', () => { $('#g-file-name', root).textContent = input.files[0] ? input.files[0].name : 'PNG, JPG, WebP или GIF, до 10 МБ'; });
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change')); } });
    };
  } else if (section === 'versions') {
    body = `<div class="panel" style="margin-bottom:16px"><div class="row" style="justify-content:space-between"><div><h2>Версии</h2><p class="muted" style="margin-top:4px">${vs.length} ${plural(vs.length, 'версия', 'версии', 'версий')}, ${fmtInt(p.downloads)} ${plural(p.downloads, 'загрузка', 'загрузки', 'загрузок')}</p></div><button class="btn btn-primary" data-action="newVersion" data-id="${p.id}">${ic('upload')}Загрузить версию</button></div></div>
      ${vs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Версия</th><th>Канал</th><th>Совместимость</th><th>Загрузки</th><th></th></tr></thead><tbody>
      ${vs.map((v) => `<tr><td><a class="t-name" href="#/project/${esc(p.slug)}/version/${v.id}">${esc(v.name)}</a><div class="t-sub">${esc(fmtDate(v.published))}</div></td><td><span class="badge badge-${v.channel}">${CHANNELS[v.channel]}</span></td><td class="mono" style="font-size:.84rem">${esc(v.loaders.map((l) => LOADERS[l]?.label || l).join(', '))}<div class="t-sub">${esc(compactVersions(v.gameVersions).join(', '))}</div></td><td class="num">${fmtInt(v.downloads)}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-sm btn-icon" data-action="editVersion" data-id="${v.id}" aria-label="Изменить">${ic('edit')}</button> <button class="btn btn-sm btn-icon btn-danger" data-action="deleteVersion" data-id="${v.id}" aria-label="Удалить">${ic('trash')}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="panel">${emptyState('upload', 'Версий пока нет', 'Загрузите файл, чтобы проект можно было скачать и опубликовать.')}</div>`}`;
  } else if (section === 'links') {
    const L = p.links || {};
    const def = [['source', 'Исходный код', 'https://git.example.com/you/project'], ['issues', 'Трекер ошибок', 'https://git.example.com/you/project/issues'], ['wiki', 'Вики', 'https://wiki.example.com/project'], ['discord', 'Сообщество (чат, форум)', 'https://chat.example.com/invite'], ['donate', 'Поддержать автора', 'https://donate.example.com/you']];
    body = `<div class="panel"><h2>Ссылки</h2><p class="muted" style="margin:6px 0 16px">Показываются в боковой панели проекта. Только адреса, начинающиеся с https:// или http://.</p>
      <form data-form="projLinks" data-id="${p.id}" class="stack" style="gap:14px">${def.map(([k, l, ph]) => `<div class="field"><label for="pl-${k}">${l}</label><input class="input" id="pl-${k}" name="${k}" type="url" maxlength="300" value="${esc(L[k] || '')}" placeholder="${ph}"></div>`).join('')}
      <div class="form-actions"><button class="btn btn-primary" type="submit">${ic('check')}Сохранить ссылки</button></div></form></div>`;
  } else if (section === 'members') {
    body = `<div class="panel"><h2>Участники</h2><p class="muted" style="margin:6px 0 16px">Участники могут редактировать проект и загружать версии. Удалить проект может только владелец.</p>
      <div class="stack" style="gap:8px">${p.members.map((mb) => { const u = userById(mb.userId); if (!u) return ''; return `<div class="file-row"><img class="avatar" src="${esc(userAvatar(u))}" width="36" height="36" alt=""><span style="flex:1;min-width:0"><a href="#/user/${esc(u.username)}" style="font-weight:700;color:var(--fg)">${esc(u.displayName)}</a> <span class="faint">@${esc(u.username)}</span><br><small class="faint">${esc(mb.role)}</small></span>${u.id !== p.ownerId && (isOwner(p) || isAdmin() || u.id === me().id) ? `<button class="btn btn-sm btn-danger" data-action="removeMember" data-id="${p.id}" data-u="${u.id}">${u.id === me().id ? 'Покинуть проект' : 'Убрать'}</button>` : ''}</div>`; }).join('')}</div>
      ${isOwner(p) || isAdmin() ? `<form data-form="addMember" data-id="${p.id}" class="field-row" style="margin-top:18px;align-items:end">
        <div class="field"><label for="am-user">Имя пользователя</label><input class="input" id="am-user" name="username" required placeholder="например, pixelwren"></div>
        <div class="field"><label for="am-role">Роль</label><select class="select" id="am-role" name="role">${MEMBER_ROLES.slice(1).map((r) => `<option>${r}</option>`).join('')}</select></div>
        <div class="field"><button class="btn btn-primary" type="submit">${ic('plus')}Пригласить</button></div></form>` : ''}</div>`;
  } else return pageNotFound();
  return {
    title: `Настройки — ${p.title}`,
    html: `<div class="container"><div class="row" style="margin-bottom:20px"><img class="p-icon" src="${esc(projectIcon(p))}" width="48" height="48" alt=""><div><h1 style="font-size:1.3rem">${esc(p.title)} ${statusBadge(p)}</h1><span class="faint">Настройки проекта</span></div></div>
      <div class="side-layout"><nav class="side-nav" aria-label="Разделы настроек"><a class="back" href="#/project/${esc(p.slug)}">${ic('arrowL')}К странице проекта</a>
      ${SETTINGS_SECTIONS.map(([k, l, i]) => `<a href="#${base}/${k}" class="${k === section ? 'active' : ''}">${ic(i)}${l}</a>`).join('')}</nav>
      <div style="min-width:0">${body}</div></div></div>`,
    after,
  };
});
F.projGeneral = async (f) => {
  const d = formData(f); const cats = formList(f, 'categories');
  if (cats.length > 5) return fieldError(f, `Выбрано ${cats.length} категорий, можно не больше пяти.`);
  const body = { title: d.title, slug: d.slug, summary: d.summary, categories: cats, clientSide: d.clientSide, serverSide: d.serverSide, license: d.license };
  if (d.status) body.status = d.status;
  try {
    const r = await busy(submitBtn(f), () => api('PATCH', `/api/projects/${f.dataset.id}`, body));
    toast(r.published ? 'Проект опубликован и появился в каталоге.' : 'Изменения сохранены.');
    go(`/project/${r.slug}/settings/general`, { replace: true });
  } catch (e) { fieldError(f, errText(e)); }
};
F.projDescription = async (f) => {
  try { await busy(submitBtn(f), () => api('PATCH', `/api/projects/${f.dataset.id}`, { description: formData(f).description })); fieldError(f, ''); toast('Описание сохранено.'); }
  catch (e) { fieldError(f, errText(e)); }
};
F.projLinks = async (f) => {
  const links = formData(f);
  for (const v of Object.values(links)) if (v.trim() && !isUrl(v)) return fieldError(f, `Ссылка «${v.trim()}» должна начинаться с https:// или http://.`);
  try { await busy(submitBtn(f), () => api('PATCH', `/api/projects/${f.dataset.id}`, { links })); fieldError(f, ''); toast('Ссылки сохранены.'); }
  catch (e) { fieldError(f, errText(e)); }
};
F.galleryAdd = async (f) => {
  const file = $('#g-file', f).files[0]; const d = formData(f);
  if (!file) return fieldError(f, 'Выберите изображение.');
  if (file.size > LIMITS.imageBytes) return fieldError(f, `Файл весит ${fmtSize(file.size)}, а можно не больше 10 МБ.`);
  const btn = submitBtn(f);
  try {
    await busy(btn, async () => {
      const blob = await imageToBlob(file);
      const up = await uploadFile(blob, file.name, 'image', (x) => { btn.textContent = `Загружаем… ${Math.round(x * 100)}%`; });
      await api('POST', `/api/projects/${f.dataset.id}/gallery`, { upload: up.id, title: d.title, desc: d.desc, featured: !!d.featured });
    }, 'Загружаем…');
    toast('Изображение добавлено.'); rerender();
  } catch (e) { fieldError(f, errText(e)); }
};
A.galleryFeature = async (el) => {
  try { await busy(el, () => api('PATCH', `/api/projects/${el.dataset.id}/gallery/${el.dataset.g}`, { featured: true }), '…'); rerender(); } catch (e) { toast(errText(e), 'error'); }
};
A.galleryDelete = async (el) => {
  const p = projById(el.dataset.id); const g = p.gallery.find((x) => x.id === el.dataset.g);
  if (!(await confirmDialog({ title: 'Удалить изображение?', text: `«${g.title}» исчезнет из галереи.`, confirm: 'Удалить', danger: true }))) return;
  try { await api('DELETE', `/api/projects/${p.id}/gallery/${g.id}`); toast('Изображение удалено.'); rerender(); } catch (e) { toast(errText(e), 'error'); }
};
A.removeIcon = async (el) => { try { await api('PATCH', `/api/projects/${el.dataset.id}`, { icon: null }); rerender(); } catch (e) { toast(errText(e), 'error'); } };
A.deleteProject = async (el) => {
  const p = projById(el.dataset.id);
  if (!(await confirmDialog({ title: 'Удалить проект?', text: `Проект «${p.title}», его версии, файлы и изображения будут удалены навсегда.`, confirm: 'Удалить навсегда', danger: true, typeToConfirm: p.slug }))) return;
  try { await api('DELETE', `/api/projects/${p.id}`); toast(`Проект «${p.title}» удалён.`); go('/dashboard/projects'); } catch (e) { toast(errText(e), 'error'); }
};
F.addMember = async (f) => {
  const d = formData(f);
  try { await busy(submitBtn(f), () => api('POST', `/api/projects/${f.dataset.id}/members`, { username: d.username, role: d.role })); toast('Участник добавлен и получил уведомление.'); rerender(); }
  catch (e) { fieldError(f, errText(e)); }
};
A.removeMember = async (el) => {
  const leaving = el.dataset.u === me().id;
  if (leaving && !(await confirmDialog({ title: 'Покинуть проект?', text: 'Вы больше не сможете редактировать этот проект, пока владелец не пригласит вас снова.', confirm: 'Покинуть', danger: true }))) return;
  try { await api('DELETE', `/api/projects/${el.dataset.id}/members/${el.dataset.u}`); toast(leaving ? 'Вы покинули проект.' : 'Участник удалён.'); if (leaving) go('/dashboard/projects'); else rerender(); }
  catch (e) { toast(errText(e), 'error'); }
};

/* ---------------- Форма версии ---------------- */
function versionForm(p, v) {
  const edit = !!v; const last = versionsOf(p.id)[0];
  const allowed = LOADERS_BY_TYPE[p.type];
  const loaders = v ? v.loaders : allowed.length === 1 ? allowed : (last ? last.loaders : []);
  const gvs = v ? v.gameVersions : (last ? last.gameVersions : []);
  const others = db.projects.filter((x) => x.id !== p.id && (isListed(x) || canEdit(x)));
  const deps = (v ? v.deps : last ? last.deps : []).map((d) => ({ ...d }));
  const pending = []; const removed = [];
  const m = openModal({
    title: edit ? `Изменить ${v.name}` : `Новая версия: ${p.title}`, wide: true,
    body: `<form id="vf" class="stack" style="gap:16px">
      <div class="field-row">
        <div class="field"><label for="vf-number">Номер версии</label><input class="input mono" id="vf-number" name="number" required maxlength="32" value="${esc(v ? v.number : '')}" placeholder="${esc(last ? last.number.replace(/(\d+)$/, (x) => +x + 1) : '1.0.0')}"></div>
        <div class="field"><label for="vf-name">Название</label><input class="input" id="vf-name" name="name" maxlength="80" value="${esc(v ? v.name : '')}" placeholder="${esc(p.title)} 1.0.0"></div>
        <div class="field"><label for="vf-channel">Канал</label><select class="select" id="vf-channel" name="channel">${Object.entries(CHANNELS).map(([k, l]) => `<option value="${k}" ${(v ? v.channel : 'release') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      ${allowed.length > 1 ? `<div class="field"><span class="field-label">${p.type === 'plugin' ? 'Платформы' : 'Загрузчики'}</span><div class="check-grid">${allowed.map((l) => `<label class="check"><input type="checkbox" name="loaders" value="${l}" ${loaders.includes(l) ? 'checked' : ''}>${esc(LOADERS[l].label)}</label>`).join('')}</div></div>` : `<input type="hidden" name="loaders" value="${allowed[0]}">`}
      <div class="field"><span class="field-label">Версии Minecraft</span><div class="check-grid">${GAME_VERSIONS.map((g) => `<label class="check"><input type="checkbox" name="gv" value="${g}" ${gvs.includes(g) ? 'checked' : ''}><span class="mono">${g}</span></label>`).join('')}</div></div>
      <div class="field"><label for="vf-changelog">Журнал изменений</label><textarea class="textarea code" id="vf-changelog" name="changelog" maxlength="${LIMITS.changelogChars}" placeholder="- Исправлен вылет при…&#10;- Добавлено…">${esc(v ? v.changelog : '')}</textarea><span class="hint">Markdown. Подписчики увидят его на странице версии.</span></div>
      <div class="field"><span class="field-label">Файлы</span>
        <div id="vf-files" class="stack" style="gap:6px"></div>
        <label class="dropzone" for="vf-file" id="vf-drop">${ic('upload')}<b>Перетащите файлы или нажмите, чтобы выбрать</b><span style="font-size:.86rem">Первый файл станет основным. До 100 МБ каждый.</span></label>
        <input type="file" id="vf-file" multiple hidden></div>
      <div class="field"><span class="field-label">Зависимости</span><div id="vf-deps" class="stack" style="gap:6px"></div>
        <div class="row"><select class="select" id="vf-dep-p" style="flex:2 1 200px" aria-label="Проект"><option value="">Выберите проект…</option>${others.sort((a, b) => a.title.localeCompare(b.title)).map((x) => `<option value="${x.id}">${esc(x.title)} (${TYPES[x.type].one.toLowerCase()})</option>`).join('')}</select>
        <select class="select" id="vf-dep-t" style="flex:1 1 140px" aria-label="Тип зависимости"><option value="required">Обязательная</option><option value="optional">Необязательная</option><option value="incompatible">Несовместима</option></select>
        <button type="button" class="btn" id="vf-dep-add">${ic('plus')}Добавить</button></div></div>
    </form>`,
    foot: `<button class="btn" data-close>Отмена</button><button class="btn btn-primary" type="submit" form="vf">${edit ? `${ic('check')}Сохранить` : `${ic('upload')}Опубликовать версию`}</button>`,
    onMount(root) {
      const drawFiles = () => {
        const existing = v ? v.files.filter((x) => !removed.includes(x.id)) : [];
        $('#vf-files', root).innerHTML = [
          ...existing.map((x) => `<div class="file-row">${ic('file').replace('<svg', '<svg width="16" height="16"')}<span class="fn">${esc(x.name)}</span><span class="faint num">${fmtSize(x.size)}</span>${x.primary ? '<span class="badge badge-release">Основной</span>' : ''}<button type="button" class="btn btn-sm btn-icon btn-danger" data-rm-existing="${x.id}" aria-label="Убрать файл">${ic('x')}</button></div>`),
          ...pending.map((x, i) => `<div class="file-row">${ic('file').replace('<svg', '<svg width="16" height="16"')}<span class="fn">${esc(x.name)}</span><span class="faint num">${fmtSize(x.size)}</span><span class="badge badge-unlisted">Новый</span><button type="button" class="btn btn-sm btn-icon btn-danger" data-rm-pending="${i}" aria-label="Убрать файл">${ic('x')}</button></div>`),
        ].join('');
      };
      const drawDeps = () => {
        $('#vf-deps', root).innerHTML = deps.map((d, i) => { const dp = projById(d.projectId); return dp ? `<div class="file-row"><img class="p-icon" src="${esc(projectIcon(dp))}" width="28" height="28" alt=""><span style="flex:1">${esc(dp.title)}</span><span class="chip">${{ required: 'Обязательная', optional: 'Необязательная', incompatible: 'Несовместима' }[d.type]}</span><button type="button" class="btn btn-sm btn-icon btn-danger" data-rm-dep="${i}" aria-label="Убрать зависимость">${ic('x')}</button></div>` : ''; }).join('');
      };
      const addFiles = (list) => {
        for (const file of list) {
          if (file.size > LIMITS.fileBytes) { toast(`Файл ${file.name} больше 100 МБ и не будет добавлен.`, 'error'); continue; }
          if (!file.size) { toast(`Файл ${file.name} пустой и не будет добавлен.`, 'error'); continue; }
          pending.push(file);
        }
        drawFiles();
      };
      $('#vf-file', root).addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
      const drop = $('#vf-drop', root);
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });
      root.addEventListener('click', (e) => {
        const a = e.target.closest('[data-rm-existing]'); if (a) { removed.push(a.dataset.rmExisting); drawFiles(); }
        const b = e.target.closest('[data-rm-pending]'); if (b) { pending.splice(+b.dataset.rmPending, 1); drawFiles(); }
        const c = e.target.closest('[data-rm-dep]'); if (c) { deps.splice(+c.dataset.rmDep, 1); drawDeps(); }
      });
      $('#vf-dep-add', root).addEventListener('click', () => {
        const pid = $('#vf-dep-p', root).value; if (!pid) return;
        const existing = deps.find((d) => d.projectId === pid);
        if (existing) existing.type = $('#vf-dep-t', root).value; else deps.push({ projectId: pid, type: $('#vf-dep-t', root).value });
        drawDeps();
      });
      $('#vf', root).addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.target; const d = formData(f);
        const lds = formList(f, 'loaders'); const gv = formList(f, 'gv');
        if (!d.number.trim()) return fieldError(f, 'Укажите номер версии, например 1.2.0.');
        if (!lds.length) return fieldError(f, `Отметьте хотя бы ${p.type === 'plugin' ? 'одну платформу' : 'один загрузчик'}.`);
        if (!gv.length) return fieldError(f, 'Отметьте хотя бы одну версию Minecraft.');
        const keepFiles = v ? v.files.filter((x) => !removed.includes(x.id)).map((x) => x.id) : [];
        if (!keepFiles.length && !pending.length) return fieldError(f, 'Добавьте файл версии.');
        const btn = $('button[type=submit]', m.el); btn.disabled = true;
        try {
          const ids = [];
          for (let i = 0; i < pending.length; i++) {
            const file = pending[i];
            const up = await uploadFile(file, file.name, 'file', (x) => { btn.textContent = `Файл ${i + 1} из ${pending.length}: ${Math.round(x * 100)}%`; });
            ids.push(up.id);
          }
          btn.textContent = 'Сохраняем…';
          const body = { number: d.number, name: d.name, channel: d.channel, loaders: lds, gameVersions: gv, changelog: d.changelog, deps };
          if (v) {
            await api('PATCH', `/api/versions/${v.id}`, { ...body, keepFiles, addFiles: ids });
            m.close(); toast('Версия обновлена.'); rerender();
          } else {
            const r = await api('POST', `/api/projects/${p.id}/versions`, { ...body, files: ids });
            m.close(); go(`/project/${p.slug}/version/${r.id}`);
            if (r.firstInDraft) offerPublish(p);
            else toast(p.status === 'draft' ? 'Версия загружена. Проект пока черновик.' : `Версия ${d.number.trim()} опубликована. Подписчики получили уведомление.`);
          }
        } catch (err) {
          fieldError(f, errText(err));
          btn.disabled = false; btn.innerHTML = edit ? `${ic('check')}Сохранить` : `${ic('upload')}Опубликовать версию`;
        }
      });
      drawFiles(); drawDeps();
    },
  });
}
async function offerPublish(p) {
  const target = p.visibility === 'unlisted' ? 'unlisted' : 'published';
  const yes = await confirmDialog({ title: 'Опубликовать проект?', text: `Первая версия загружена. Опубликовать «${p.title}» ${target === 'unlisted' ? 'с доступом по ссылке' : 'в каталоге'} прямо сейчас? Это можно сделать и позже в настройках проекта.`, confirm: 'Опубликовать' });
  if (!yes) { toast('Проект остался черновиком. Опубликовать его можно в разделе «Основное».'); return; }
  try { await api('PATCH', `/api/projects/${p.id}`, { status: target }); toast(target === 'unlisted' ? 'Проект доступен по ссылке.' : 'Проект опубликован и появился в каталоге.'); rerender(); }
  catch (e) { toast(errText(e), 'error'); }
}
A.newVersion = (el) => versionForm(projById(el.dataset.id));
A.editVersion = (el) => { const v = versionById(el.dataset.id); versionForm(projById(v.projectId), v); };
A.deleteVersion = async (el) => {
  const v = versionById(el.dataset.id); const p = projById(v.projectId);
  if (!(await confirmDialog({ title: 'Удалить версию?', text: `Версия ${v.name} и её файлы будут удалены. Загрузки сохранятся в статистике проекта.`, confirm: 'Удалить', danger: true }))) return;
  try {
    const r = await api('DELETE', `/api/versions/${v.id}`);
    toast(r.becameDraft ? 'Версия удалена. У проекта не осталось версий, он снова стал черновиком.' : 'Версия удалена.');
    go(`/project/${p.slug}/versions`);
  } catch (e) { toast(errText(e), 'error'); }
};

/* ---------------- Коллекции и жалобы ---------------- */
A.saveToCollection = (el) => {
  const u = me(); if (!u) { go(`/auth/signin?next=${encodeURIComponent(parseHash().path)}`); return; }
  const p = projById(el.dataset.id);
  const draw = () => {
    const mine = db.collections.filter((c) => c.ownerId === u.id);
    return mine.length ? mine.map((c) => `<label class="pick"><input type="checkbox" data-col="${c.id}" ${c.projects.includes(p.id) ? 'checked' : ''}><span style="flex:1"><b>${esc(c.name)}</b><br><small class="faint">${c.projects.length} ${plural(c.projects.length, 'проект', 'проекта', 'проектов')} · ${c.public ? 'публичная' : 'личная'}</small></span></label>`).join('') : '<p class="faint">У вас пока нет коллекций. Создайте первую ниже.</p>';
  };
  openModal({
    title: `Сохранить ${p.title}`,
    body: `<div class="pick-list" id="col-list">${draw()}</div>
      <form class="row" id="col-new" style="flex-wrap:nowrap"><input class="input" name="name" maxlength="60" placeholder="Название новой коллекции" aria-label="Название новой коллекции" required><button class="btn" type="submit">${ic('plus')}Создать</button></form>`,
    foot: '<button class="btn btn-primary" data-close>Готово</button>',
    onMount(root) {
      root.addEventListener('change', async (e) => {
        const cb = e.target.closest('[data-col]'); if (!cb) return;
        const c = db.collections.find((x) => x.id === cb.dataset.col); cb.disabled = true;
        try {
          await api(cb.checked ? 'PUT' : 'DELETE', `/api/collections/${c.id}/items/${p.id}`);
          toast(cb.checked ? `Добавлено в «${c.name}».` : `Убрано из «${c.name}».`);
          $('#col-list', root).innerHTML = draw();
        } catch (err) { cb.checked = !cb.checked; cb.disabled = false; toast(errText(err), 'error'); }
      });
      $('#col-new', root).addEventListener('submit', async (e) => {
        e.preventDefault(); const name = e.target.name.value.trim(); if (!name) return;
        try { await api('POST', '/api/collections', { name, projectId: p.id }); e.target.reset(); $('#col-list', root).innerHTML = draw(); toast(`Коллекция «${name}» создана.`); }
        catch (err) { toast(errText(err), 'error'); }
      });
    },
  });
};
A.report = (el) => {
  const u = me(); if (!u) { go(`/auth/signin?next=${encodeURIComponent(parseHash().path)}`); return; }
  const p = projById(el.dataset.id);
  const m = openModal({
    title: `Жалоба на ${p.title}`,
    body: `<form id="rep" class="stack" style="gap:14px"><div class="field"><label for="rep-reason">Причина</label><select class="select" id="rep-reason" name="reason">${Object.entries(REPORT_REASONS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="field"><label for="rep-body">Что случилось</label><textarea class="textarea" id="rep-body" name="body" maxlength="2000" required placeholder="Опишите проблему: какая версия, что именно не так, ссылки на доказательства."></textarea></div></form>`,
    foot: '<button class="btn" data-close>Отмена</button><button class="btn btn-danger" type="submit" form="rep">Отправить жалобу</button>',
    onMount(root) {
      $('#rep', root).addEventListener('submit', async (e) => {
        e.preventDefault(); const d = formData(e.target);
        if (d.body.trim().length < 10) return fieldError(e.target, 'Опишите проблему подробнее, хотя бы одним предложением.');
        try { await busy($('button[type=submit]', m.el), () => api('POST', `/api/projects/${p.id}/reports`, d), 'Отправляем…'); m.close(); toast('Жалоба отправлена модераторам. Мы сообщим о решении.'); }
        catch (err) { fieldError(e.target, errText(err)); }
      });
    },
  });
};

/* =====================================================================
   Профиль, коллекции, панель автора, настройки, вход
   ===================================================================== */
route(/^\/user\/([^/]+)(?:\/([a-z]+))?$/, (name, tab = 'all') => {
  const u = userByName(name); if (!u) return pageNotFound('Пользователь не найден');
  const self = me()?.id === u.id;
  const projects = db.projects.filter((p) => p.members.some((m) => m.userId === u.id) && (isListed(p) || canEdit(p))).sort((a, b) => b.downloads - a.downloads);
  const cols = db.collections.filter((c) => c.ownerId === u.id && (c.public || self));
  const dl = projects.filter(isListed).reduce((a, p) => a + p.downloads, 0);
  const fol = projects.filter(isListed).reduce((a, p) => a + p.followers, 0);
  const types = Object.keys(TYPES).filter((t) => projects.some((p) => p.type === t));
  const base = `#/user/${esc(u.username)}`;
  const shown = tab === 'all' ? projects : projects.filter((p) => p.type === tab);
  const body = tab === 'collections'
    ? (cols.length ? `<div class="p-grid">${cols.map(collectionCard).join('')}</div>` : emptyState('bookmark', 'Коллекций нет'))
    : (shown.length ? `<div class="p-list">${shown.map((p) => projectRow(p)).join('')}</div>` : emptyState('box', self ? 'У вас пока нет проектов' : 'Проектов пока нет', self ? 'Опубликуйте первый проект: это займёт несколько минут.' : '', self ? `<button class="btn btn-primary" data-action="createProject">${ic('plus')}Создать проект</button>` : ''));
  return {
    title: u.displayName,
    html: `<div class="container">
      <header class="profile-head"><img class="avatar" src="${esc(userAvatar(u))}" width="104" height="104" alt="">
        <div style="flex:1;min-width:0"><h1>${esc(u.displayName)} ${u.role === 'admin' ? '<span class="role-tag">Модератор</span>' : ''}</h1><div class="faint">@${esc(u.username)}</div>
          ${u.bio ? `<p class="bio">${esc(u.bio)}</p>` : ''}
          <div class="meta"><span><b class="num">${projects.filter(isListed).length}</b> ${plural(projects.filter(isListed).length, 'проект', 'проекта', 'проектов')}</span><span><b class="num">${fmtNum(dl)}</b> загрузок</span><span><b class="num">${fmtNum(fol)}</b> подписчиков</span><span>${ic('calendar').replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')} С нами с ${esc(fmtDate(u.created))}</span></div></div>
        ${self ? `<a class="btn" href="#/settings">${ic('edit')}Редактировать профиль</a>` : ''}</header>
      <nav class="tabs"><a href="${base}" class="${tab === 'all' ? 'active' : ''}">Все проекты<span class="n">${projects.length}</span></a>
        ${types.map((t) => `<a href="${base}/${t}" class="${tab === t ? 'active' : ''}">${TYPES[t].label}<span class="n">${projects.filter((p) => p.type === t).length}</span></a>`).join('')}
        <a href="${base}/collections" class="${tab === 'collections' ? 'active' : ''}">Коллекции<span class="n">${cols.length}</span></a></nav>
      ${body}</div>`,
  };
});
function collectionCard(c) {
  const ps = c.projects.map(projById).filter((p) => p && canView(p));
  const owner = userById(c.ownerId);
  return `<a class="panel" href="#/collection/${c.id}" style="color:var(--fg);display:flex;flex-direction:column;gap:10px">
    <div class="row" style="gap:6px">${ps.slice(0, 5).map((p) => `<img class="p-icon" src="${esc(projectIcon(p))}" width="40" height="40" alt="">`).join('') || `<span class="faint">${ic('bookmark').replace('<svg', '<svg width="40" height="40"')}</span>`}</div>
    <div><b style="font-size:1.05rem">${esc(c.name)}</b> ${c.public ? '' : '<span class="badge badge-draft">Личная</span>'}</div>
    ${c.description ? `<p class="muted" style="font-size:.9rem">${esc(c.description)}</p>` : ''}
    <small class="faint">${ps.length} ${plural(ps.length, 'проект', 'проекта', 'проектов')} · ${esc(owner?.displayName || '')}</small></a>`;
}
route(/^\/collection\/([^/]+)$/, (id) => {
  const c = db.collections.find((x) => x.id === id); const u = me();
  if (!c || (!c.public && c.ownerId !== u?.id)) return pageNotFound('Коллекция не найдена', 'Возможно, она личная или её удалили.');
  const own = c.ownerId === u?.id; const owner = userById(c.ownerId);
  const ps = c.projects.map(projById).filter((p) => p && canView(p));
  return {
    title: c.name,
    html: `<div class="container">
      <div class="page-head"><div><span class="eyebrow">Коллекция ${c.public ? '' : '· личная'}</span><h1 style="margin-top:6px">${esc(c.name)}</h1>
        ${c.description ? `<p class="muted">${esc(c.description)}</p>` : ''}<p class="faint" style="font-size:.9rem">Собрал(а) <a href="#/user/${esc(owner?.username)}">${esc(owner?.displayName)}</a> · ${ps.length} ${plural(ps.length, 'проект', 'проекта', 'проектов')} · создана ${esc(fmtDate(c.created))}</p></div>
        <div class="row">${c.public ? `<button class="btn" data-action="copyLink" data-text="${esc(`${location.href.split('#')[0]}#/collection/${c.id}`)}">${ic('link')}Ссылка</button>` : ''}
        ${own ? `<button class="btn" data-action="editCollection" data-id="${c.id}">${ic('edit')}Изменить</button><button class="btn btn-danger" data-action="deleteCollection" data-id="${c.id}">${ic('trash')}Удалить</button>` : ''}</div></div>
      ${ps.length ? `<div class="p-list">${ps.map((p) => projectRow(p, { extra: own ? `<button class="btn btn-sm" data-action="uncollect" data-id="${c.id}" data-p="${p.id}">${ic('x')}Убрать</button>` : '' })).join('')}</div>`
        : emptyState('bookmark', 'В коллекции пусто', own ? 'Нажмите на закладку на странице любого проекта, чтобы добавить его сюда.' : '', own ? '<a class="btn" href="#/mods">Открыть каталог</a>' : '')}
    </div>`,
  };
});
A.uncollect = async (el) => {
  try { await busy(el, () => api('DELETE', `/api/collections/${el.dataset.id}/items/${el.dataset.p}`), '…'); rerender(); } catch (e) { toast(errText(e), 'error'); }
};
A.editCollection = (el) => {
  const c = el.dataset.id ? db.collections.find((x) => x.id === el.dataset.id) : null;
  const m = openModal({
    title: c ? 'Изменить коллекцию' : 'Новая коллекция',
    body: `<form id="colf" class="stack" style="gap:14px"><div class="field"><label for="colf-name">Название</label><input class="input" id="colf-name" name="name" maxlength="60" required value="${esc(c?.name || '')}"></div>
      <div class="field"><label for="colf-desc">Описание</label><textarea class="textarea" id="colf-desc" name="description" maxlength="300" style="min-height:90px">${esc(c?.description || '')}</textarea></div>
      <label class="check"><input type="checkbox" name="public" value="1" ${!c || c.public ? 'checked' : ''}>Публичная: видна в профиле и по ссылке</label></form>`,
    foot: `<button class="btn" data-close>Отмена</button><button class="btn btn-primary" type="submit" form="colf">${c ? 'Сохранить' : 'Создать'}</button>`,
    onMount(root) {
      $('#colf', root).addEventListener('submit', async (e) => {
        e.preventDefault(); const d = formData(e.target);
        const body = { name: d.name, description: d.description, public: !!d.public };
        try {
          await busy($('button[type=submit]', m.el), () => (c ? api('PATCH', `/api/collections/${c.id}`, body) : api('POST', '/api/collections', body)));
          m.close(); toast(c ? 'Коллекция сохранена.' : 'Коллекция создана.'); rerender();
        } catch (err) { fieldError(e.target, errText(err)); }
      });
    },
  });
};
A.deleteCollection = async (el) => {
  const c = db.collections.find((x) => x.id === el.dataset.id);
  if (!(await confirmDialog({ title: 'Удалить коллекцию?', text: `Коллекция «${c.name}» будет удалена. Сами проекты останутся в каталоге.`, confirm: 'Удалить', danger: true }))) return;
  try { await api('DELETE', `/api/collections/${c.id}`); toast('Коллекция удалена.'); go('/dashboard/collections'); } catch (e) { toast(errText(e), 'error'); }
};

/* ---------------- Панель автора ---------------- */
const DASH = [['overview', 'Обзор', 'dashboard'], ['projects', 'Проекты', 'box'], ['notifications', 'Уведомления', 'bell'], ['following', 'Подписки', 'heart'], ['collections', 'Коллекции', 'bookmark'], ['analytics', 'Аналитика', 'chart']];
route(/^\/dashboard(?:\/([a-z]+))?$/, (section = 'overview', query) => {
  const u = me(); if (!u) return requireLogin();
  const mine = db.projects.filter((p) => p.members.some((m) => m.userId === u.id));
  const unread = unreadCount(u);
  let body = ''; let after = null;
  if (section === 'overview') {
    const dl = mine.reduce((a, p) => a + p.downloads, 0), fol = mine.reduce((a, p) => a + p.followers, 0);
    const s30 = seriesFor(mine.map((p) => p.id), 30); const sum30 = s30.reduce((a, x) => a + x.v, 0);
    const notifs = db.notifications.filter((n) => n.userId === u.id).sort((a, b) => b.created - a.created).slice(0, 4);
    body = `<h1 style="margin-bottom:18px">Здравствуйте, ${esc(u.displayName)}</h1>
      <div class="stat-grid">
        <div class="stat"><span class="eyebrow">Загрузки</span><div class="v">${fmtNum(dl)}</div><div class="d">всего по ${mine.length} ${plural(mine.length, 'проекту', 'проектам', 'проектам')}</div></div>
        <div class="stat"><span class="eyebrow">За 30 дней</span><div class="v">${fmtNum(sum30)}</div><div class="d">загрузок</div></div>
        <div class="stat"><span class="eyebrow">Подписчики</span><div class="v">${fmtNum(fol)}</div><div class="d">на ваши проекты</div></div>
        <div class="stat"><span class="eyebrow">Уведомления</span><div class="v">${unread}</div><div class="d">непрочитанных</div></div>
      </div>
      ${mine.length ? `<div class="panel" style="margin-bottom:18px"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3>Загрузки за 30 дней</h3><a href="#/dashboard/analytics">Подробнее</a></div>${chartSVG(s30)}</div>`
        : `<div class="panel" style="margin-bottom:18px">${emptyState('box', 'Пока нет проектов', 'Создайте первый проект, и здесь появится статистика загрузок.', `<button class="btn btn-primary" data-action="createProject">${ic('plus')}Создать проект</button>`)}</div>`}
      <div class="panel" style="padding:0"><div class="row" style="justify-content:space-between;padding:16px 16px 6px"><h3>Последние уведомления</h3><a href="#/dashboard/notifications">Все</a></div>${notifs.length ? notifs.map(notifRow).join('') : `<div style="padding:16px" class="faint">Уведомлений нет.</div>`}</div>`;
  } else if (section === 'projects') {
    body = `<div class="page-head"><div><h1>Проекты</h1><p class="muted">Проекты, в которых вы владелец или участник.</p></div><button class="btn btn-primary" data-action="createProject">${ic('plus')}Создать проект</button></div>
      ${mine.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Проект</th><th>Тип</th><th>Статус</th><th>Загрузки</th><th>Подписчики</th><th>Обновлён</th><th></th></tr></thead><tbody>
      ${mine.sort((a, b) => b.updated - a.updated).map((p) => `<tr><td><a class="row" style="flex-wrap:nowrap;color:var(--fg)" href="#/project/${esc(p.slug)}"><img class="p-icon" src="${esc(projectIcon(p))}" width="36" height="36" alt=""><span class="t-name">${esc(p.title)}</span></a></td>
        <td>${TYPES[p.type].one}</td><td><span class="badge badge-${p.status}">${STATUSES[p.status]}</span></td><td class="num">${fmtInt(p.downloads)}</td><td class="num">${fmtInt(p.followers)}</td><td class="num" style="white-space:nowrap">${esc(timeAgo(p.updated))}</td>
        <td style="text-align:right;white-space:nowrap"><a class="btn btn-sm" href="#/project/${esc(p.slug)}/settings">${ic('settings')}Настройки</a></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="panel">${emptyState('box', 'Проектов пока нет', 'Мод, сборка, шейдер, ресурспак, плагин или датапак: выберите тип и загрузите файл.', `<button class="btn btn-primary" data-action="createProject">${ic('plus')}Создать проект</button>`)}</div>`}`;
  } else if (section === 'notifications') {
    const list = db.notifications.filter((n) => n.userId === u.id).sort((a, b) => b.created - a.created);
    body = `<div class="page-head"><div><h1>Уведомления</h1><p class="muted">Новые версии проектов, на которые вы подписаны, новые подписчики и решения модераторов.</p></div>
      <div class="row">${unread ? `<button class="btn" data-action="readAll">${ic('check')}Прочитать все</button>` : ''}${list.some((n) => n.read) ? `<button class="btn btn-ghost" data-action="clearRead">${ic('trash')}Удалить прочитанные</button>` : ''}</div></div>
      <div class="panel" style="padding:0">${list.length ? list.map(notifRow).join('') : emptyState('bell', 'Уведомлений нет', 'Подпишитесь на проекты, чтобы узнавать о новых версиях.')}</div>`;
  } else if (section === 'following') {
    const ps = db.follows.filter((f) => f.userId === u.id).map((f) => projById(f.projectId)).filter((p) => p && canView(p));
    body = `<div class="page-head"><div><h1>Подписки</h1><p class="muted">О новых версиях этих проектов мы пришлём уведомление.</p></div></div>
      ${ps.length ? `<div class="p-list">${ps.map((p) => projectRow(p, { extra: `<button class="btn btn-sm" data-action="follow" data-id="${p.id}">${ic('x')}Отписаться</button>` })).join('')}</div>` : emptyState('heart', 'Вы ни на что не подписаны', 'Нажмите на сердечко на странице проекта.', '<a class="btn" href="#/mods">Открыть каталог</a>')}`;
  } else if (section === 'collections') {
    const cols = db.collections.filter((c) => c.ownerId === u.id);
    body = `<div class="page-head"><div><h1>Коллекции</h1><p class="muted">Подборки проектов для себя или для друзей.</p></div><button class="btn btn-primary" data-action="editCollection">${ic('plus')}Новая коллекция</button></div>
      ${cols.length ? `<div class="p-grid">${cols.map(collectionCard).join('')}</div>` : emptyState('bookmark', 'Коллекций пока нет')}`;
  } else if (section === 'analytics') {
    const days = [7, 30, 90].includes(+query.days) ? +query.days : 30;
    const sel = mine.find((p) => p.id === query.p);
    const ids = sel ? [sel.id] : mine.map((p) => p.id);
    const series = seriesFor(ids, days); const total = series.reduce((a, x) => a + x.v, 0);
    const prev = seriesFor(ids, days * 2).slice(0, days).reduce((a, x) => a + x.v, 0);
    const delta = prev ? Math.round(((total - prev) / prev) * 100) : null;
    const best = series.reduce((a, x) => (x.v > a.v ? x : a), series[0]);
    const per = mine.map((p) => ({ p, v: seriesFor([p.id], days).reduce((a, x) => a + x.v, 0) })).sort((a, b) => b.v - a.v);
    body = `<div class="page-head"><div><h1>Аналитика</h1><p class="muted">Загрузки ваших проектов по дням.</p></div>
      <div class="row"><select class="select" id="an-p" style="width:auto" aria-label="Проект"><option value="">Все проекты</option>${mine.map((p) => `<option value="${p.id}" ${sel?.id === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select>
      <select class="select" id="an-d" style="width:auto" aria-label="Период">${[7, 30, 90].map((d) => `<option value="${d}" ${d === days ? 'selected' : ''}>${d} дней</option>`).join('')}</select></div></div>
      ${mine.length ? `<div class="stat-grid">
        <div class="stat"><span class="eyebrow">Загрузки за ${days} дн.</span><div class="v">${fmtInt(total)}</div><div class="d" style="color:${delta == null ? 'var(--fg-faint)' : delta >= 0 ? 'var(--ok)' : 'var(--danger)'}">${delta == null ? 'нет данных для сравнения' : `${delta >= 0 ? '+' : ''}${delta}% к прошлому периоду`}</div></div>
        <div class="stat"><span class="eyebrow">В среднем в день</span><div class="v">${fmtInt(Math.round(total / days))}</div></div>
        <div class="stat"><span class="eyebrow">Лучший день</span><div class="v">${fmtInt(best.v)}</div><div class="d">${esc(fmtDate(best.t))}</div></div>
      </div>
      <div class="panel" style="margin-bottom:18px">${chartSVG(series, `Загрузки за ${days} дней`)}</div>
      ${!sel ? `<div class="table-wrap"><table class="table"><thead><tr><th>Проект</th><th>За ${days} дн.</th><th>Доля</th><th>Всего</th></tr></thead><tbody>${per.map(({ p, v }) => `<tr><td><a class="t-name" href="#/project/${esc(p.slug)}">${esc(p.title)}</a></td><td class="num">${fmtInt(v)}</td><td class="num">${total ? Math.round((v / total) * 100) : 0}%</td><td class="num">${fmtInt(p.downloads)}</td></tr>`).join('')}</tbody></table></div>` : ''}`
        : `<div class="panel">${emptyState('chart', 'Здесь появится статистика', 'Опубликуйте проект, и мы начнём считать загрузки.')}</div>`}`;
    after = (root) => {
      const upd = () => { setQuery('/dashboard/analytics', { p: $('#an-p', root).value, days: $('#an-d', root).value === '30' ? '' : $('#an-d', root).value }); rerender(); };
      $('#an-p', root)?.addEventListener('change', upd); $('#an-d', root)?.addEventListener('change', upd);
    };
  } else if (section === 'moderation' && isAdmin(u)) {
    const open = db.reports.filter((r) => r.status === 'open').sort((a, b) => b.created - a.created);
    const closed = db.reports.filter((r) => r.status !== 'open').sort((a, b) => b.created - a.created).slice(0, 10);
    const withheld = db.projects.filter((p) => p.status === 'withheld');
    const repRow = (r) => { const p = projById(r.projectId), by = userById(r.reporterId); return `<article class="panel" style="display:flex;flex-direction:column;gap:10px">
      <div class="row" style="justify-content:space-between"><div class="row"><span class="badge badge-${r.status === 'open' ? 'beta' : r.status === 'resolved' ? 'release' : 'draft'}">${{ open: 'Открыта', resolved: 'Решена', dismissed: 'Отклонена' }[r.status]}</span><b>${esc(REPORT_REASONS[r.reason])}</b></div><span class="faint" style="font-size:.86rem">${esc(timeAgo(r.created))}</span></div>
      <div class="row">${p ? miniProject(p) : '<span class="faint">Проект удалён</span>'}</div>
      <p style="overflow-wrap:anywhere">${esc(r.body)}</p><small class="faint">Отправил(а): ${by ? `<a href="#/user/${esc(by.username)}">${esc(by.displayName)}</a>` : '—'}</small>
      ${r.status === 'open' ? `<div class="row"><button class="btn btn-sm btn-primary" data-action="resolveReport" data-id="${r.id}" data-s="resolved">${ic('check')}Решено</button><button class="btn btn-sm" data-action="resolveReport" data-id="${r.id}" data-s="dismissed">Отклонить</button>${p && p.status !== 'withheld' ? `<button class="btn btn-sm btn-danger" data-action="withhold" data-id="${p.id}" data-r="${r.id}">${ic('eye')}Скрыть проект</button>` : ''}</div>` : ''}</article>`; };
    body = `<div class="page-head"><div><h1>Модерация</h1><p class="muted">Жалобы пользователей и скрытые проекты.</p></div></div>
      <h2 style="margin-bottom:12px">Открытые жалобы <span class="faint num">${open.length}</span></h2>
      <div class="stack" style="margin-bottom:28px">${open.length ? open.map(repRow).join('') : `<div class="panel">${emptyState('check', 'Открытых жалоб нет')}</div>`}</div>
      <h2 style="margin-bottom:12px">Скрытые проекты</h2>
      <div class="stack" style="margin-bottom:28px">${withheld.length ? withheld.map((p) => projectRow(p, { extra: `<button class="btn btn-sm" data-action="restoreProject" data-id="${p.id}">Вернуть в каталог</button>` })).join('') : '<p class="faint">Нет скрытых проектов.</p>'}</div>
      ${closed.length ? `<h2 style="margin-bottom:12px">Недавно закрытые</h2><div class="stack">${closed.map(repRow).join('')}</div>` : ''}`;
  } else return pageNotFound();
  const nav = [...DASH, ...(isAdmin(u) ? [['moderation', 'Модерация', 'shield']] : [])];
  const openReports = isAdmin(u) ? db.reports.filter((r) => r.status === 'open').length : 0;
  return {
    title: 'Панель автора',
    html: `<div class="container"><div class="side-layout"><nav class="side-nav" aria-label="Панель автора">${nav.map(([k, l, i]) => `<a href="#/dashboard${k === 'overview' ? '' : `/${k}`}" class="${k === section ? 'active' : ''}">${ic(i)}${l}${k === 'notifications' && unread ? `<span class="n">${unread}</span>` : ''}${k === 'moderation' && openReports ? `<span class="n">${openReports}</span>` : ''}</a>`).join('')}</nav><div style="min-width:0">${body}</div></div></div>`,
    after,
  };
});
const NOTIF_ICON = { version: 'download', follow: 'heart', member: 'users', report: 'flag', moderation: 'shield', info: 'info' };
function notifRow(n) {
  return `<div class="notif ${n.read ? '' : 'unread'}"><span class="ic">${ic(NOTIF_ICON[n.type] || 'info')}</span><div class="tx"><a href="#" data-action="openNotif" data-id="${n.id}" style="color:var(--fg)">${esc(n.text)}</a><small>${esc(timeAgo(n.created))}</small></div>
    ${n.read ? '' : `<button class="btn btn-sm btn-ghost btn-icon" data-action="readNotif" data-id="${n.id}" title="Отметить прочитанным" aria-label="Отметить прочитанным">${ic('check')}</button>`}</div>`;
}
const act = (fn) => async (el) => { try { await fn(el); } catch (e) { toast(errText(e), 'error'); } };
A.openNotif = act(async (el) => {
  const n = db.notifications.find((x) => x.id === el.dataset.id);
  if (!n.read) api('POST', '/api/notifications/read', { id: n.id }).then(() => renderHeader()).catch(() => {});
  go(n.link || '/dashboard/notifications');
});
A.readNotif = act(async (el) => { await api('POST', '/api/notifications/read', { id: el.dataset.id }); rerender(); });
A.readAll = act(async () => { await api('POST', '/api/notifications/read', {}); rerender(); });
A.clearRead = act(async () => { await api('DELETE', '/api/notifications/read'); rerender(); });
A.resolveReport = act(async (el) => { await api('PATCH', `/api/reports/${el.dataset.id}`, { status: el.dataset.s }); toast('Жалоба закрыта. Автор жалобы получил уведомление.'); rerender(); });
A.withhold = act(async (el) => {
  const p = projById(el.dataset.id);
  if (!(await confirmDialog({ title: `Скрыть ${p.title}?`, text: 'Проект пропадёт из каталога. Автор получит уведомление и сможет исправить нарушения.', confirm: 'Скрыть', danger: true }))) return;
  await api('PATCH', `/api/projects/${p.id}/moderation`, { status: 'withheld', reportId: el.dataset.r || null });
  toast('Проект скрыт.'); rerender();
});
A.restoreProject = act(async (el) => { await api('PATCH', `/api/projects/${el.dataset.id}/moderation`, { status: 'published' }); toast('Проект возвращён в каталог.'); rerender(); });

/* ---------------- Настройки аккаунта ---------------- */
const SET = [['profile', 'Профиль', 'user'], ['account', 'Аккаунт', 'shield'], ['appearance', 'Оформление', 'palette'], ['data', 'Данные', 'database']];
route(/^\/settings(?:\/([a-z]+))?$/, (section = 'profile') => {
  const u = me();
  if (!u && section !== 'appearance' && section !== 'data') return requireLogin();
  let body = ''; let after = null;
  if (section === 'profile') {
    body = `<div class="panel"><h2>Профиль</h2>
      <div class="icon-edit" style="margin:18px 0"><img class="avatar" src="${esc(userAvatar(u))}" width="96" height="96" alt="Аватар">
        <div class="stack" style="gap:8px"><label class="btn" for="av-file">${ic('upload')}Загрузить аватар</label><input type="file" id="av-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>${u.avatar ? '<button class="btn btn-ghost btn-sm" data-action="removeAvatar">Вернуть сгенерированный</button>' : ''}</div></div>
      <form data-form="profile" class="stack" style="gap:14px">
        <div class="field"><label for="pf-name">Отображаемое имя</label><input class="input" id="pf-name" name="displayName" maxlength="40" required value="${esc(u.displayName)}"></div>
        <div class="field"><label for="pf-bio">О себе</label><textarea class="textarea" id="pf-bio" name="bio" maxlength="300" style="min-height:100px">${esc(u.bio || '')}</textarea><span class="hint">До 300 символов. Видно в профиле.</span></div>
        <div class="form-actions"><a class="btn" href="#/user/${esc(u.username)}">Открыть профиль</a><button class="btn btn-primary" type="submit">${ic('check')}Сохранить</button></div></form></div>`;
    after = (root) => $('#av-file', root).addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const up = await uploadFile(await imageToSquareBlob(file, 256), file.name, 'image');
        await api('PATCH', '/api/me', { avatar: up.id }); toast('Аватар обновлён.'); rerender();
      } catch (err) { toast(errText(err), 'error'); }
    });
  } else if (section === 'account') {
    body = `<div class="panel"><h2>Аккаунт</h2><form data-form="account" class="stack" style="gap:14px;margin-top:16px">
        <div class="field"><label for="ac-user">Имя пользователя</label><input class="input" id="ac-user" name="username" required maxlength="24" pattern="[A-Za-z0-9_]{3,24}" value="${esc(u.username)}"><span class="hint">Латиница, цифры и подчёркивание, от 3 до 24 символов. Меняет адрес профиля.</span></div>
        <div class="field"><label for="ac-email">Эл. почта</label><input class="input" id="ac-email" name="email" type="email" required value="${esc(u.email)}"></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${ic('check')}Сохранить</button></div></form></div>
      <div class="panel" style="margin-top:16px"><h2>Пароль</h2><form data-form="password" class="stack" style="gap:14px;margin-top:16px">
        <div class="field"><label for="pw-old">Текущий пароль</label><input class="input" id="pw-old" name="old" type="password" required autocomplete="current-password"></div>
        <div class="field-row"><div class="field"><label for="pw-new">Новый пароль</label><input class="input" id="pw-new" name="pass" type="password" required minlength="8" autocomplete="new-password"></div>
        <div class="field"><label for="pw-new2">Повторите пароль</label><input class="input" id="pw-new2" name="pass2" type="password" required minlength="8" autocomplete="new-password"></div></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Сменить пароль</button></div></form></div>
      <div class="panel danger-zone" style="margin-top:16px"><h2>Удаление аккаунта</h2><p class="muted" style="margin:8px 0 14px">Вместе с аккаунтом удалятся проекты, где вы владелец, коллекции и уведомления.</p><button class="btn btn-danger" data-action="deleteAccount">${ic('trash')}Удалить аккаунт</button></div>`;
  } else if (section === 'appearance') {
    body = `<div class="panel"><h2>Оформление</h2><p class="muted" style="margin:6px 0 16px">Тему можно быстро переключить и кнопкой в шапке.</p>
      <div class="stack" style="gap:8px">${[['system', 'Как в системе', 'monitor'], ['dark', 'Тёмная', 'moon'], ['light', 'Светлая', 'sun']].map(([k, l, i]) => `<label class="pick"><input type="radio" name="theme" value="${k}" ${prefs.theme === k ? 'checked' : ''}>${ic(i).replace('<svg', '<svg width="18" height="18"')}${l}</label>`).join('')}</div></div>`;
    after = (root) => root.addEventListener('change', (e) => { if (e.target.name === 'theme') { prefs.theme = e.target.value; savePrefs(); applyTheme(); renderHeader(); toast('Тема изменена.'); } });
  } else if (section === 'data') {
    body = `<div class="panel"><h2>Данные и приватность</h2>
      <p class="muted" style="margin:8px 0">Аккаунты, проекты, файлы и статистика хранятся на сервере Craftory. Пароли хранятся только в виде хэша scrypt, вход защищён cookie, недоступной скриптам страницы.</p>
      <p class="muted">Вы можете скачать всё, что связано с вашим аккаунтом, в формате JSON, или удалить аккаунт в разделе «Аккаунт».</p>
      <div class="row" style="margin-top:16px">${u ? `<button class="btn" data-action="exportData">${ic('download')}Скачать мои данные (JSON)</button>` : '<a class="btn" href="#/auth/signin">Войдите, чтобы скачать свои данные</a>'}</div></div>
      ${isAdmin(u) ? `<div class="panel danger-zone" style="margin-top:16px"><h2>Сброс сайта</h2><p class="muted" style="margin:8px 0 14px">Доступно только модераторам. Удаляет все данные на сервере и заново создаёт демо-каталог.</p><button class="btn btn-danger" data-action="resetData">${ic('trash')}Сбросить к демо-данным</button></div>` : ''}`;
  } else return pageNotFound();
  const nav = u ? SET : SET.filter(([k]) => k === 'appearance' || k === 'data');
  return {
    title: 'Настройки',
    html: `<div class="container"><div class="side-layout"><nav class="side-nav" aria-label="Настройки">${nav.map(([k, l, i]) => `<a href="#/settings/${k}" class="${k === section ? 'active' : ''}">${ic(i)}${l}</a>`).join('')}</nav><div style="min-width:0">${body}</div></div></div>`,
    after,
  };
});
F.profile = async (f) => {
  const d = formData(f);
  try { await busy(submitBtn(f), () => api('PATCH', '/api/me', { displayName: d.displayName, bio: d.bio })); toast('Профиль сохранён.'); rerender(); }
  catch (e) { fieldError(f, errText(e)); }
};
A.removeAvatar = act(async () => { await api('PATCH', '/api/me', { avatar: null }); rerender(); });
F.account = async (f) => {
  const d = formData(f);
  try { await busy(submitBtn(f), () => api('PATCH', '/api/me/account', { username: d.username, email: d.email })); fieldError(f, ''); toast('Данные аккаунта сохранены.'); renderHeader(); }
  catch (e) { fieldError(f, errText(e)); }
};
F.password = async (f) => {
  const d = formData(f);
  if (d.pass.length < 8) return fieldError(f, 'Новый пароль должен быть не короче 8 символов.');
  if (d.pass !== d.pass2) return fieldError(f, 'Пароли не совпадают.');
  try { await busy(submitBtn(f), () => api('POST', '/api/me/password', { old: d.old, pass: d.pass })); f.reset(); fieldError(f, ''); toast('Пароль изменён. На других устройствах нужно будет войти заново.'); }
  catch (e) { fieldError(f, errText(e)); }
};
A.deleteAccount = act(async () => {
  const u = me();
  if (!(await confirmDialog({ title: 'Удалить аккаунт?', text: 'Проекты, где вы владелец, коллекции, подписки и уведомления будут удалены навсегда.', confirm: 'Удалить аккаунт', danger: true, typeToConfirm: u.username }))) return;
  await api('DELETE', '/api/me', { confirm: u.username }); toast('Аккаунт удалён.'); go('/');
});
A.exportData = () => {
  const a = document.createElement('a'); a.href = '/api/me/export'; a.download = '';
  document.body.append(a); a.click(); a.remove(); toast('Готовим файл с вашими данными.');
};
A.resetData = act(async () => {
  if (!(await confirmDialog({ title: 'Сбросить сайт?', text: 'Все аккаунты, проекты, загруженные файлы и статистика на сервере будут удалены и заменены демо-данными. Все пользователи выйдут из аккаунтов.', confirm: 'Сбросить всё', danger: true, typeToConfirm: 'сбросить' }))) return;
  await api('POST', '/api/admin/reset'); toast('Сайт сброшен к демо-данным.'); go('/');
});

/* ---------------- Вход и регистрация ---------------- */
route(/^\/auth\/(signin|signup)$/, (mode, query) => {
  if (me()) return { redirect: query.next || '/dashboard' };
  const up = mode === 'signup';
  return {
    title: up ? 'Регистрация' : 'Вход',
    html: `<div class="container auth-wrap"><div class="panel stack" style="gap:18px">
      <div><h1>${up ? 'Создать аккаунт' : 'Вход в Craftory'}</h1><p class="muted" style="margin-top:6px">${up ? 'Аккаунт нужен, чтобы публиковать проекты, подписываться и собирать коллекции.' : 'С возвращением! Войдите, чтобы управлять проектами и подписками.'}</p></div>
      <form data-form="${mode}" data-next="${esc(query.next || '')}" class="stack" style="gap:14px">
        ${up ? `<div class="field"><label for="au-user">Имя пользователя</label><input class="input" id="au-user" name="username" required maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocomplete="username"><span class="hint">Латиница, цифры и подчёркивание, от 3 до 24 символов.</span></div>
          <div class="field"><label for="au-email">Эл. почта</label><input class="input" id="au-email" name="email" type="email" required autocomplete="email"></div>`
        : '<div class="field"><label for="au-login">Имя пользователя или почта</label><input class="input" id="au-login" name="login" required autocomplete="username"></div>'}
        <div class="field"><label for="au-pass">Пароль</label><input class="input" id="au-pass" name="pass" type="password" required ${up ? 'minlength="8" autocomplete="new-password"' : 'autocomplete="current-password"'}>${up ? '<span class="hint">Не короче 8 символов.</span>' : ''}</div>
        ${up ? '<div class="field"><label for="au-pass2">Повторите пароль</label><input class="input" id="au-pass2" name="pass2" type="password" required minlength="8" autocomplete="new-password"></div>' : ''}
        <button class="btn btn-primary btn-lg" type="submit">${up ? 'Зарегистрироваться' : 'Войти'}</button>
      </form>
      ${up ? '' : '<div class="demo-hint">Демо-аккаунты: <code>demo</code> / <code>demo1234</code> (игрок с подписками и коллекциями) и <code>admin</code> / <code>admin1234</code> (модератор).</div>'}
      <p class="muted" style="text-align:center">${up ? 'Уже есть аккаунт? <a href="#/auth/signin">Войти</a>' : 'Нет аккаунта? <a href="#/auth/signup">Зарегистрироваться</a>'}</p>
    </div></div>`,
  };
});
F.signin = async (f) => {
  const d = formData(f);
  try { await busy(submitBtn(f), () => api('POST', '/api/auth/signin', { login: d.login, pass: d.pass }), 'Входим…'); toast(`Здравствуйте, ${me().displayName}!`); go(f.dataset.next || '/dashboard'); }
  catch (e) { fieldError(f, errText(e)); }
};
F.signup = async (f) => {
  const d = formData(f);
  if (!/^[A-Za-z0-9_]{3,24}$/.test(d.username.trim())) return fieldError(f, 'Имя пользователя: латиница, цифры и подчёркивание, от 3 до 24 символов.');
  if (d.pass.length < 8) return fieldError(f, 'Пароль должен быть не короче 8 символов.');
  if (d.pass !== d.pass2) return fieldError(f, 'Пароли не совпадают.');
  try { await busy(submitBtn(f), () => api('POST', '/api/auth/signup', { username: d.username, email: d.email, pass: d.pass }), 'Создаём аккаунт…'); toast('Аккаунт создан.'); go(f.dataset.next || '/dashboard'); }
  catch (e) { fieldError(f, errText(e)); }
};

/* ---------------- О проекте и 404 ---------------- */
route(/^\/about$/, () => ({
  title: 'О проекте',
  html: `<div class="container"><div class="proj-layout"><article class="panel"><div class="md">${md(`# О Craftory
Craftory — каталог контента для Minecraft: Java Edition. Здесь шесть типов проектов: моды, сборки, ресурспаки, шейдеры, серверные плагины и датапаки.

## Для игроков
- Ищите по названию и описанию, фильтруйте по категориям, версии игры, загрузчику и лицензии.
- Окно «Скачать» само подбирает подходящий файл под выбранную версию Minecraft и загрузчик.
- Подписывайтесь на проекты: о новых версиях придёт уведомление.
- Собирайте коллекции и делитесь ссылкой на них.

## Правила публикации
1. Публикуйте только то, что сделали сами или на что у вас есть права.
2. Укажите честную совместимость: версии игры, загрузчики и окружение (клиент или сервер).
3. Никакого вредоносного кода, обфускации ради сокрытия поведения и скрытого сбора данных.
4. Описание должно объяснять, что делает проект. Одной ссылки на сторонний сайт недостаточно.
5. Модераторы могут скрыть проект после жалобы. Автор получит уведомление и сможет всё исправить.

## Как это устроено
Сайт состоит из сервера на Node.js с базой SQLite и одностраничного интерфейса. Файлы версий и изображения хранятся на сервере, скачивания считаются там же. Подробнее о хранении данных: [Данные и приватность](#/settings/data).

> Craftory не связан с Mojang Studios и Microsoft. Minecraft — товарный знак Mojang Synergies AB.`)}</div></article>
  <aside class="side"><div class="panel"><h3>Попробуйте</h3><div class="stack" style="gap:8px"><a class="btn" href="#/auth/signin">Войти в демо-аккаунт</a><button class="btn btn-primary" data-action="createProject">${ic('plus')}Создать проект</button></div></div></aside></div></div>`,
}));
function pageNotFound(title = 'Страница не найдена', text = 'Проверьте адрес или вернитесь на главную.') {
  return { title, html: `<div class="container">${emptyState('alert', title, text, '<div class="row" style="justify-content:center"><a class="btn btn-primary" href="#/">На главную</a><a class="btn" href="#/mods">Каталог модов</a></div>')}</div>` };
}

/* ---------------- Запуск ---------------- */
(async function boot() {
  loadPrefs(); applyTheme(); renderFooter();
  try { db = await api('GET', '/api/state'); }
  catch (e) {
    $('#app').innerHTML = `<div class="container">${emptyState('alert', 'Не удалось загрузить каталог', e.message, '<button class="btn btn-primary" id="retry">Попробовать снова</button>')}</div>`;
    $('#retry').addEventListener('click', () => location.reload());
    return;
  }
  render();
  // Раз в минуту обновляем данные, чтобы появлялись новые уведомления
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    const before = unreadCount();
    await refreshState(); renderHeader();
    const after = unreadCount();
    if (after > before) toast(after - before === 1 ? 'Новое уведомление.' : `Новых уведомлений: ${after - before}.`);
  }, 60e3);
})();
