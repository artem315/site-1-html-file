'use strict';
/* HTTP-сервер Craftory: API, загрузка и раздача файлов, статика. Без внешних зависимостей. */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const S = require('../public/shared.js');
const { openDb, tx, wipe, json: parseJson } = require('./db.js');
const Auth = require('./auth.js');
const { seedDemo, ensureAdmin } = require('./seed.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com', "img-src 'self' data: blob: https:", "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
].join('; ');
const IMAGE_MIME = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/gif': [0x47, 0x49, 0x46], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
const DAY = 864e5;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (msg) => new HttpError(400, msg);
const notFound = (msg = 'Не найдено.') => new HttpError(404, msg);
const forbidden = (msg = 'Недостаточно прав.') => new HttpError(403, msg);

/* ---------- Проверка входных данных ---------- */
function str(v, name, { min = 0, max = 200, trim = true } = {}) {
  if (v == null) v = '';
  if (typeof v !== 'string') throw bad(`Поле «${name}» должно быть текстом.`);
  const s = trim ? v.trim() : v;
  if (s.length < min) throw bad(min === 1 ? `Заполните поле «${name}».` : `Поле «${name}» должно быть не короче ${min} символов.`);
  if (s.length > max) throw bad(`Поле «${name}» должно быть не длиннее ${max} символов.`);
  return s;
}
function oneOf(v, allowed, name) { if (!allowed.includes(v)) throw bad(`Недопустимое значение поля «${name}».`); return v; }
function listOf(v, allowed, name, { min = 0, max = 50 } = {}) {
  if (!Array.isArray(v)) throw bad(`Поле «${name}» должно быть списком.`);
  const out = [...new Set(v)];
  for (const x of out) if (!allowed.includes(x)) throw bad(`Недопустимое значение «${String(x).slice(0, 40)}» в поле «${name}».`);
  if (out.length < min) throw bad(`Выберите хотя бы одно значение в поле «${name}».`);
  if (out.length > max) throw bad(`В поле «${name}» можно выбрать не больше ${max} значений.`);
  return out;
}
const isUrl = (s) => /^https?:\/\/[^\s<>"]+$/i.test(s);
const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,100}\.[^\s@]{2,}$/;
const LINK_KEYS = ['source', 'issues', 'wiki', 'discord', 'donate'];

function createApp(opts = {}) {
  const {
    dataDir = path.join(__dirname, '..', 'data'), seed = true, adminUser = 'admin', adminPassword = 'admin1234',
    demoPassword = 'demo1234', cookieSecure = 'auto', log = true, trustProxy = false, authLimit = 30,
  } = opts;
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const db = openDb(path.join(dataDir, 'craftory.db'));
  if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    if (seed) seedDemo(db, { adminPassword, demoPassword });
    else ensureAdmin(db, adminUser, adminPassword);
  }
  const limitAuth = Auth.rateLimiter(authLimit, 10 * 60e3);
  const limitUpload = Auth.rateLimiter(120, 10 * 60e3);
  const limitReport = Auth.rateLimiter(10, 60 * 60e3);
  const recentDownloads = new Map();

  /* ---------- Выборки ---------- */
  const q = (sql) => db.prepare(sql);
  const getUser = (id) => q('SELECT * FROM users WHERE id = ?').get(id);
  const getProject = (id) => q('SELECT * FROM projects WHERE id = ?').get(id);
  const isMember = (pid, uid) => !!q('SELECT 1 FROM members WHERE project_id = ? AND user_id = ?').get(pid, uid);
  const canView = (p, u) => p.status === 'published' || p.status === 'unlisted' || (!!u && (u.role === 'admin' || isMember(p.id, u.id)));
  const versionCount = (pid) => q('SELECT COUNT(*) n FROM versions WHERE project_id = ?').get(pid).n;
  function editable(id, u) {
    const p = getProject(id); if (!p) throw notFound('Проект не найден.');
    if (u.role !== 'admin' && !isMember(p.id, u.id)) throw forbidden('Изменять проект могут только его участники.');
    return p;
  }
  function notify(userId, type, text, link) {
    if (!userId) return;
    q('INSERT INTO notifications (id, user_id, type, text, link, read, created) VALUES (?, ?, ?, ?, ?, 0, ?)').run(Auth.newId('n_'), userId, type, text, link || null, Date.now());
  }
  function ownedUpload(id, user, kind) {
    if (typeof id !== 'string') throw bad('Не указан загруженный файл.');
    const up = q('SELECT * FROM uploads WHERE id = ?').get(id);
    if (!up || up.kind !== kind) throw bad('Загруженный файл не найден. Загрузите его ещё раз.');
    if (up.owner_id !== user.id && user.role !== 'admin') throw forbidden('Этот файл загрузил другой пользователь.');
    return up;
  }

  /* ---------- Преобразование строк базы в данные для клиента ---------- */
  const group = (rows, key) => { const m = new Map(); for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  function userDTO(u, self) {
    const d = { id: u.id, username: u.username, displayName: u.display_name, bio: u.bio, role: u.role, avatar: u.avatar, created: u.created };
    if (self) d.email = u.email;
    return d;
  }
  function bundle(projectRows) {
    if (!projectRows.length) return { projects: [], versions: [] };
    const ids = projectRows.map((p) => p.id); const marks = ids.map(() => '?').join(',');
    const members = group(q(`SELECT * FROM members WHERE project_id IN (${marks}) ORDER BY ord`).all(...ids), 'project_id');
    const gallery = group(q(`SELECT * FROM gallery WHERE project_id IN (${marks}) ORDER BY ord`).all(...ids), 'project_id');
    const versionRows = q(`SELECT * FROM versions WHERE project_id IN (${marks}) ORDER BY published DESC`).all(...ids);
    const vids = versionRows.map((v) => v.id);
    let files = new Map(); let deps = new Map();
    for (let i = 0; i < vids.length; i += 500) {
      const chunk = vids.slice(i, i + 500); const m = chunk.map(() => '?').join(',');
      for (const [k, v] of group(q(`SELECT * FROM files WHERE version_id IN (${m}) ORDER BY ord`).all(...chunk), 'version_id')) files.set(k, v);
      for (const [k, v] of group(q(`SELECT * FROM deps WHERE version_id IN (${m})`).all(...chunk), 'version_id')) deps.set(k, v);
    }
    const versions = versionRows.map((v) => ({
      id: v.id, projectId: v.project_id, number: v.number, name: v.name, channel: v.channel,
      loaders: parseJson(v.loaders, []), gameVersions: parseJson(v.game_versions, []), changelog: v.changelog,
      published: v.published, authorId: v.author_id, downloads: v.downloads,
      files: (files.get(v.id) || []).map((f) => ({ id: f.id, name: f.name, size: f.size, primary: !!f.is_primary, hasFile: !!f.upload_id })),
      deps: (deps.get(v.id) || []).map((d) => ({ projectId: d.project_id, type: d.type })),
    }));
    const byProject = group(versions, 'projectId');
    const projects = projectRows.map((p) => {
      const vs = byProject.get(p.id) || [];
      return {
        id: p.id, slug: p.slug, type: p.type, title: p.title, summary: p.summary, description: p.description, icon: p.icon,
        categories: parseJson(p.categories, []), clientSide: p.client_side, serverSide: p.server_side, license: p.license,
        links: parseJson(p.links, {}), ownerId: p.owner_id, status: p.status, visibility: p.visibility, featured: !!p.featured,
        created: p.created, updated: p.updated, downloads: p.downloads, followers: p.followers,
        members: (members.get(p.id) || []).map((m) => ({ userId: m.user_id, role: m.role })),
        loaders: [...new Set(vs.flatMap((v) => v.loaders))],
        gameVersions: [...new Set(vs.flatMap((v) => v.gameVersions))].sort(S.cmpGV),
        gallery: (gallery.get(p.id) || []).map((g) => ({ id: g.id, gen: g.gen, upload: g.upload_id, title: g.title, desc: g.description, featured: !!g.featured })),
      };
    });
    return { projects, versions };
  }
  function buildState(viewer) {
    const admin = viewer?.role === 'admin';
    const mine = new Set(viewer ? q('SELECT project_id FROM members WHERE user_id = ?').all(viewer.id).map((r) => r.project_id) : []);
    const rows = q('SELECT * FROM projects ORDER BY downloads DESC').all().filter((p) => p.status === 'published' || admin || mine.has(p.id));
    const { projects, versions } = bundle(rows);
    const cols = q('SELECT * FROM collections WHERE public = 1 OR owner_id = ? ORDER BY created DESC').all(viewer?.id || '');
    const items = group(q('SELECT * FROM collection_items ORDER BY added').all(), 'collection_id');
    const stats = {};
    const statIds = admin ? rows.map((p) => p.id) : [...mine];
    const since = S.dateKey(Date.now() - 200 * DAY);
    if (statIds.length) {
      for (const s of q(`SELECT * FROM stats WHERE day >= ? AND project_id IN (${statIds.map(() => '?').join(',')})`).all(since, ...statIds)) {
        (stats[s.project_id] ||= {})[s.day] = s.n;
      }
    }
    return {
      me: viewer?.id || null,
      users: q('SELECT * FROM users ORDER BY created').all().map((u) => userDTO(u, viewer && u.id === viewer.id)),
      projects, versions,
      follows: viewer ? q('SELECT user_id AS userId, project_id AS projectId, created FROM follows WHERE user_id = ?').all(viewer.id).map((r) => ({ ...r })) : [],
      collections: cols.map((c) => ({ id: c.id, ownerId: c.owner_id, name: c.name, description: c.description, public: !!c.public, created: c.created, projects: (items.get(c.id) || []).map((i) => i.project_id) })),
      notifications: viewer ? q('SELECT * FROM notifications WHERE user_id = ? ORDER BY created DESC LIMIT 200').all(viewer.id).map((n) => ({ id: n.id, userId: n.user_id, type: n.type, text: n.text, link: n.link, read: !!n.read, created: n.created })) : [],
      reports: admin ? q('SELECT * FROM reports ORDER BY created DESC').all().map((r) => ({ id: r.id, reporterId: r.reporter_id, projectId: r.project_id, reason: r.reason, body: r.body, status: r.status, created: r.created })) : [],
      stats,
    };
  }

  /* ---------- Файлы ---------- */
  const uploadPath = (id) => path.join(uploadsDir, id);
  async function gcUploads(minAgeMs = 3600e3) {
    const rows = q(`SELECT id FROM uploads u WHERE created < ?
      AND NOT EXISTS (SELECT 1 FROM files f WHERE f.upload_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM gallery g WHERE g.upload_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.icon = u.id)
      AND NOT EXISTS (SELECT 1 FROM users s WHERE s.avatar = u.id)`).all(Date.now() - minAgeMs);
    for (const r of rows) { q('DELETE FROM uploads WHERE id = ?').run(r.id); await fsp.rm(uploadPath(r.id), { force: true }); }
    return rows.length;
  }
  async function receiveUpload(ctx) {
    const { req, user, url } = ctx;
    if (!limitUpload(user.id)) throw new HttpError(429, 'Слишком много загрузок. Подождите несколько минут.');
    const kind = oneOf(url.searchParams.get('kind') || 'file', ['image', 'file'], 'тип загрузки');
    const max = kind === 'image' ? S.LIMITS.imageBytes : S.LIMITS.fileBytes;
    let name = 'file';
    try { name = decodeURIComponent(String(req.headers['x-filename'] || 'file')); } catch { /* оставляем имя по умолчанию */ }
    name = name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 120) || 'file';
    let mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > max) throw new HttpError(413, `Файл больше ${Math.round(max / 1048576)} МБ.`);
    const id = Auth.newId('up_'); const tmp = `${uploadPath(id)}.part`;
    const hash = crypto.createHash('sha256'); let size = 0; let head = Buffer.alloc(0);
    const out = fs.createWriteStream(tmp);
    try {
      await pipeline(req, async function* (source) {
        for await (const chunk of source) {
          size += chunk.length;
          if (size > max) throw new HttpError(413, `Файл больше ${Math.round(max / 1048576)} МБ.`);
          if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16);
          hash.update(chunk); yield chunk;
        }
      }, out);
    } catch (e) { await fsp.rm(tmp, { force: true }); throw e instanceof HttpError ? e : bad('Загрузка прервалась. Попробуйте ещё раз.'); }
    if (!size) { await fsp.rm(tmp, { force: true }); throw bad('Файл пустой.'); }
    if (kind === 'image') {
      const sig = Object.entries(IMAGE_MIME).find(([, b]) => b.every((x, i) => head[i] === x));
      if (!sig || (sig[0] === 'image/webp' && head.subarray(8, 12).toString('latin1') !== 'WEBP')) { await fsp.rm(tmp, { force: true }); throw bad('Поддерживаются только изображения PNG, JPEG, GIF и WebP.'); }
      mime = sig[0];
    } else if (!/^[\w.+-]+\/[\w.+-]+$/.test(mime)) mime = 'application/octet-stream';
    await fsp.rename(tmp, uploadPath(id));
    q('INSERT INTO uploads (id, owner_id, kind, name, mime, size, sha256, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, user.id, kind, name, mime, size, hash.digest('hex'), Date.now());
    return { id, name, size, mime };
  }
  function contentDisposition(name) {
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  }
  async function sendFile(req, res, file, headers) {
    const st = await fsp.stat(file).catch(() => null);
    if (!st) throw notFound('Файл не найден на сервере.');
    res.writeHead(200, { 'Content-Length': st.size, ...headers });
    if (req.method === 'HEAD') return res.end();
    await pipeline(fs.createReadStream(file), res);
  }

  /* ---------- Маршруты API ---------- */
  const routes = [];
  const on = (method, pattern, handler, flags = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, handler, ...flags });
  };
  const ok = (ctx, extra = {}) => ({ ...extra, state: buildState(ctx.user ? getUser(ctx.user.id) : null) });

  on('GET', '/api/health', () => ({ ok: true }));
  on('GET', '/api/state', (ctx) => buildState(ctx.user));
  on('GET', '/api/projects/:slug', (ctx) => {
    const p = q('SELECT * FROM projects WHERE slug = ? OR id = ?').get(ctx.params.slug, ctx.params.slug);
    if (!p || !canView(p, ctx.user)) throw notFound('Проект не найден.');
    return bundle([p]);
  });

  /* Аккаунт */
  on('POST', '/api/auth/signup', (ctx, b) => {
    if (!limitAuth(`ip:${ctx.ip}`)) throw new HttpError(429, 'Слишком много попыток. Подождите 10 минут.');
    const username = str(b.username, 'Имя пользователя', { min: 3, max: 24 });
    if (!USERNAME_RE.test(username)) throw bad('Имя пользователя: латиница, цифры и подчёркивание, от 3 до 24 символов.');
    const email = str(b.email, 'Эл. почта', { min: 3, max: 160 });
    if (!EMAIL_RE.test(email)) throw bad('Проверьте адрес почты: он должен выглядеть как name@example.com.');
    const pass = str(b.pass, 'Пароль', { min: 8, max: 200, trim: false });
    if (q('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, `Имя «${username}» уже занято. Попробуйте другое.`);
    if (q('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Аккаунт с такой почтой уже есть. Войдите или используйте другую почту.');
    const id = Auth.newId('u_');
    q("INSERT INTO users (id, username, display_name, email, bio, role, avatar, pass_hash, created) VALUES (?, ?, ?, ?, '', 'user', NULL, ?, ?)").run(id, username, username, email, Auth.hashPassword(pass), Date.now());
    notify(id, 'info', 'Добро пожаловать в Craftory! Подпишитесь на любимые проекты или опубликуйте свой.', '/mods');
    ctx.setCookie(Auth.createSession(db, id)); ctx.user = getUser(id);
    return ok(ctx);
  });
  on('POST', '/api/auth/signin', (ctx, b) => {
    const login = str(b.login, 'Имя пользователя или почта', { min: 1, max: 160 });
    if (!limitAuth(`ip:${ctx.ip}`) || !limitAuth(`login:${login.toLowerCase()}`)) throw new HttpError(429, 'Слишком много попыток входа. Подождите 10 минут.');
    const u = q('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
    if (!u || !Auth.verifyPassword(String(b.pass || ''), u.pass_hash)) throw new HttpError(401, 'Неверное имя пользователя или пароль.');
    ctx.setCookie(Auth.createSession(db, u.id)); ctx.user = u;
    return ok(ctx);
  });
  on('POST', '/api/auth/signout', (ctx) => { Auth.destroySession(db, ctx.tokenHash); ctx.clearCookie(); ctx.user = null; return ok(ctx); });

  /* Загрузки */
  on('POST', '/api/uploads', (ctx) => receiveUpload(ctx), { auth: true, raw: true });

  /* Проекты */
  on('POST', '/api/projects', (ctx, b) => {
    const type = oneOf(b.type, Object.keys(S.TYPES), 'Тип');
    const title = str(b.title, 'Название', { min: 1, max: 64 });
    const slug = S.slugify(b.slug || title);
    if (!slug) throw bad('Адрес должен содержать хотя бы одну латинскую букву или цифру.');
    if (q('SELECT 1 FROM projects WHERE slug = ?').get(slug)) throw new HttpError(409, `Адрес «${slug}» уже занят. Придумайте другой.`);
    const summary = str(b.summary, 'Кратко о проекте', { min: 1, max: 140 });
    const visibility = oneOf(b.visibility || 'published', ['published', 'unlisted'], 'Видимость');
    const id = Auth.newId('p_'); const t = Date.now();
    tx(db, () => {
      q(`INSERT INTO projects (id, slug, type, title, summary, description, icon, categories, client_side, server_side, license, links, owner_id, status, visibility, featured, created, updated, downloads, followers)
        VALUES (?, ?, ?, ?, ?, '', NULL, '[]', ?, ?, 'MIT', '{}', ?, 'draft', ?, 0, ?, ?, 0, 0)`)
        .run(id, slug, type, title, summary, type === 'plugin' ? 'unsupported' : 'required', ['plugin', 'datapack'].includes(type) ? 'required' : 'optional', ctx.user.id, visibility, t, t);
      q("INSERT INTO members (project_id, user_id, role, ord) VALUES (?, ?, 'Владелец', 0)").run(id, ctx.user.id);
    });
    return ok(ctx, { id, slug });
  }, { auth: true });
  on('PATCH', '/api/projects/:id', (ctx, b) => {
    const p = editable(ctx.params.id, ctx.user); const admin = ctx.user.role === 'admin';
    const set = {};
    if ('title' in b) set.title = str(b.title, 'Название', { min: 1, max: 64 });
    if ('slug' in b) {
      const slug = S.slugify(b.slug); if (!slug) throw bad('Адрес должен содержать латинские буквы или цифры.');
      const other = q('SELECT id FROM projects WHERE slug = ?').get(slug); if (other && other.id !== p.id) throw new HttpError(409, `Адрес «${slug}» уже занят другим проектом.`);
      set.slug = slug;
    }
    if ('summary' in b) set.summary = str(b.summary, 'Кратко о проекте', { min: 1, max: 140 });
    if ('description' in b) set.description = str(b.description, 'Описание', { max: S.LIMITS.descriptionChars, trim: false });
    if ('categories' in b) set.categories = JSON.stringify(listOf(b.categories, Object.keys(S.CATEGORIES[p.type]), 'Категории', { max: 5 }));
    if ('clientSide' in b) set.client_side = oneOf(b.clientSide, Object.keys(S.SIDES), 'Клиент');
    if ('serverSide' in b) set.server_side = oneOf(b.serverSide, Object.keys(S.SIDES), 'Сервер');
    if ((set.client_side || p.client_side) === 'unsupported' && (set.server_side || p.server_side) === 'unsupported') throw bad('Проект должен работать хотя бы на клиенте или на сервере.');
    if ('license' in b) set.license = oneOf(b.license, Object.keys(S.LICENSES), 'Лицензия');
    if ('links' in b) {
      if (!b.links || typeof b.links !== 'object') throw bad('Ссылки переданы в неверном формате.');
      const links = {};
      for (const k of LINK_KEYS) { const v = str(b.links[k], 'Ссылка', { max: 300 }); if (!v) continue; if (!isUrl(v)) throw bad(`Ссылка «${v}» должна начинаться с https:// или http://.`); links[k] = v; }
      set.links = JSON.stringify(links);
    }
    if ('icon' in b) set.icon = b.icon === null ? null : ownedUpload(b.icon, ctx.user, 'image').id;
    if ('status' in b) {
      const status = oneOf(b.status, Object.keys(S.STATUSES), 'Статус');
      if (status !== p.status) {
        if ((status === 'withheld' || p.status === 'withheld') && !admin) throw forbidden('Скрыть проект или вернуть его в каталог может только модератор.');
        if ((status === 'published' || status === 'unlisted') && !versionCount(p.id)) throw bad('Нельзя опубликовать проект без версий. Загрузите файл в разделе «Версии».');
        set.status = status;
      }
    }
    const keys = Object.keys(set);
    if (keys.length) {
      set.updated = Date.now();
      q(`UPDATE projects SET ${Object.keys(set).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(set), p.id);
    }
    if ('icon' in b) gcUploads();
    return ok(ctx, { slug: set.slug || p.slug, published: set.status === 'published' && p.status === 'draft' });
  }, { auth: true });
  on('DELETE', '/api/projects/:id', async (ctx) => {
    const p = editable(ctx.params.id, ctx.user);
    if (p.owner_id !== ctx.user.id && ctx.user.role !== 'admin') throw forbidden('Удалить проект может только владелец.');
    q('DELETE FROM projects WHERE id = ?').run(p.id);
    await gcUploads(0);
    return ok(ctx);
  }, { auth: true });

  /* Галерея */
  on('POST', '/api/projects/:id/gallery', (ctx, b) => {
    const p = editable(ctx.params.id, ctx.user);
    const up = ownedUpload(b.upload, ctx.user, 'image');
    const count = q('SELECT COUNT(*) n FROM gallery WHERE project_id = ?').get(p.id).n;
    if (count >= 64) throw bad('В галерее может быть не больше 64 изображений.');
    const title = str(b.title, 'Подпись', { max: 80 }) || up.name.replace(/\.[^.]+$/, '');
    const featured = !!b.featured || count === 0;
    tx(db, () => {
      if (featured) q('UPDATE gallery SET featured = 0 WHERE project_id = ?').run(p.id);
      q('INSERT INTO gallery (id, project_id, gen, upload_id, title, description, featured, ord) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)').run(Auth.newId('g_'), p.id, up.id, title, str(b.desc, 'Описание', { max: 200 }), featured ? 1 : 0, count);
    });
    return ok(ctx);
  }, { auth: true });
  on('PATCH', '/api/projects/:id/gallery/:gid', (ctx) => {
    const p = editable(ctx.params.id, ctx.user);
    if (!q('SELECT 1 FROM gallery WHERE id = ? AND project_id = ?').get(ctx.params.gid, p.id)) throw notFound('Изображение не найдено.');
    tx(db, () => { q('UPDATE gallery SET featured = (id = ?) WHERE project_id = ?').run(ctx.params.gid, p.id); });
    return ok(ctx);
  }, { auth: true });
  on('DELETE', '/api/projects/:id/gallery/:gid', async (ctx) => {
    const p = editable(ctx.params.id, ctx.user);
    const g = q('SELECT * FROM gallery WHERE id = ? AND project_id = ?').get(ctx.params.gid, p.id); if (!g) throw notFound('Изображение не найдено.');
    tx(db, () => {
      q('DELETE FROM gallery WHERE id = ?').run(g.id);
      if (g.featured) q('UPDATE gallery SET featured = 1 WHERE id = (SELECT id FROM gallery WHERE project_id = ? ORDER BY ord LIMIT 1)').run(p.id);
    });
    await gcUploads(0);
    return ok(ctx);
  }, { auth: true });

  /* Участники */
  on('POST', '/api/projects/:id/members', (ctx, b) => {
    const p = editable(ctx.params.id, ctx.user);
    if (p.owner_id !== ctx.user.id && ctx.user.role !== 'admin') throw forbidden('Приглашать участников может только владелец.');
    const name = str(b.username, 'Имя пользователя', { min: 1, max: 40 }).replace(/^@/, '');
    const u = q('SELECT * FROM users WHERE username = ?').get(name); if (!u) throw notFound(`Пользователь «${name}» не найден. Проверьте написание имени.`);
    if (isMember(p.id, u.id)) throw new HttpError(409, `${u.display_name} уже участник проекта.`);
    const role = oneOf(b.role, S.MEMBER_ROLES.slice(1), 'Роль');
    const ord = q('SELECT COALESCE(MAX(ord), 0) + 1 n FROM members WHERE project_id = ?').get(p.id).n;
    q('INSERT INTO members (project_id, user_id, role, ord) VALUES (?, ?, ?, ?)').run(p.id, u.id, role, ord);
    notify(u.id, 'member', `Вас добавили в проект ${p.title} с ролью «${role}»`, `/project/${p.slug}`);
    return ok(ctx);
  }, { auth: true });
  on('DELETE', '/api/projects/:id/members/:uid', (ctx) => {
    const p = editable(ctx.params.id, ctx.user);
    const self = ctx.params.uid === ctx.user.id;
    if (!self && p.owner_id !== ctx.user.id && ctx.user.role !== 'admin') throw forbidden('Убирать участников может только владелец.');
    if (ctx.params.uid === p.owner_id) throw bad('Владельца нельзя убрать из проекта.');
    q('DELETE FROM members WHERE project_id = ? AND user_id = ?').run(p.id, ctx.params.uid);
    return ok(ctx);
  }, { auth: true });

  /* Версии */
  function versionFields(p, b, current) {
    const number = str(b.number, 'Номер версии', { min: 1, max: 32 });
    const dup = q('SELECT id FROM versions WHERE project_id = ? AND number = ?').get(p.id, number);
    if (dup && (!current || dup.id !== current.id)) throw new HttpError(409, `Версия ${number} уже есть. Номера версий не должны повторяться.`);
    const loaders = listOf(b.loaders, S.LOADERS_BY_TYPE[p.type], p.type === 'plugin' ? 'Платформы' : 'Загрузчики', { min: 1 });
    const gameVersions = listOf(b.gameVersions, S.GAME_VERSIONS, 'Версии Minecraft', { min: 1 }).sort(S.cmpGV);
    const deps = Array.isArray(b.deps) ? b.deps.slice(0, 50).map((d) => {
      const dp = getProject(d && d.projectId); if (!dp || dp.id === p.id) throw bad('Зависимость указывает на несуществующий проект.');
      return { projectId: dp.id, type: oneOf(d.type, ['required', 'optional', 'incompatible'], 'Тип зависимости') };
    }) : [];
    return {
      number, name: str(b.name, 'Название', { max: 80 }) || `${p.title} ${number}`, channel: oneOf(b.channel || 'release', Object.keys(S.CHANNELS), 'Канал'),
      loaders, gameVersions, changelog: str(b.changelog, 'Журнал изменений', { max: S.LIMITS.changelogChars, trim: false }), deps,
    };
  }
  const insertFile = (vid, up, i) => q('INSERT INTO files (id, version_id, name, size, is_primary, upload_id, ord) VALUES (?, ?, ?, ?, 0, ?, ?)').run(Auth.newId('f_'), vid, up.name, up.size, up.id, i);
  const fixPrimary = (vid) => { if (!q('SELECT 1 FROM files WHERE version_id = ? AND is_primary = 1').get(vid)) q('UPDATE files SET is_primary = 1 WHERE id = (SELECT id FROM files WHERE version_id = ? ORDER BY ord LIMIT 1)').run(vid); };
  const writeDeps = (vid, deps) => { q('DELETE FROM deps WHERE version_id = ?').run(vid); for (const d of deps) q('INSERT OR REPLACE INTO deps (version_id, project_id, type) VALUES (?, ?, ?)').run(vid, d.projectId, d.type); };
  on('POST', '/api/projects/:id/versions', (ctx, b) => {
    const p = editable(ctx.params.id, ctx.user);
    const f = versionFields(p, b);
    const ups = (Array.isArray(b.files) ? b.files : []).slice(0, 10).map((id) => ownedUpload(id, ctx.user, 'file'));
    if (!ups.length) throw bad('Добавьте файл версии.');
    const vid = Auth.newId('v_'); const t = Date.now();
    tx(db, () => {
      q('INSERT INTO versions (id, project_id, number, name, channel, loaders, game_versions, changelog, published, author_id, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
        .run(vid, p.id, f.number, f.name, f.channel, JSON.stringify(f.loaders), JSON.stringify(f.gameVersions), f.changelog, t, ctx.user.id);
      ups.forEach((up, i) => insertFile(vid, up, i)); fixPrimary(vid); writeDeps(vid, f.deps);
      q('UPDATE projects SET updated = ? WHERE id = ?').run(t, p.id);
      if (p.status === 'published' || p.status === 'unlisted') {
        for (const r of q('SELECT user_id FROM follows WHERE project_id = ? AND user_id != ?').all(p.id, ctx.user.id)) notify(r.user_id, 'version', `Вышла версия ${f.number} проекта ${p.title}`, `/project/${p.slug}/version/${vid}`);
      }
    });
    return ok(ctx, { id: vid, firstInDraft: p.status === 'draft' && versionCount(p.id) === 1 });
  }, { auth: true });
  on('PATCH', '/api/versions/:id', async (ctx, b) => {
    const v = q('SELECT * FROM versions WHERE id = ?').get(ctx.params.id); if (!v) throw notFound('Версия не найдена.');
    const p = editable(v.project_id, ctx.user);
    const f = versionFields(p, b, v);
    const keep = new Set(Array.isArray(b.keepFiles) ? b.keepFiles : []);
    const ups = (Array.isArray(b.addFiles) ? b.addFiles : []).slice(0, 10).map((id) => ownedUpload(id, ctx.user, 'file'));
    const existing = q('SELECT * FROM files WHERE version_id = ?').all(v.id);
    if (!existing.some((x) => keep.has(x.id)) && !ups.length) throw bad('У версии должен остаться хотя бы один файл.');
    tx(db, () => {
      q('UPDATE versions SET number = ?, name = ?, channel = ?, loaders = ?, game_versions = ?, changelog = ? WHERE id = ?')
        .run(f.number, f.name, f.channel, JSON.stringify(f.loaders), JSON.stringify(f.gameVersions), f.changelog, v.id);
      for (const x of existing) if (!keep.has(x.id)) q('DELETE FROM files WHERE id = ?').run(x.id);
      const base = existing.length;
      ups.forEach((up, i) => insertFile(v.id, up, base + i)); fixPrimary(v.id); writeDeps(v.id, f.deps);
    });
    await gcUploads(0);
    return ok(ctx);
  }, { auth: true });
  on('DELETE', '/api/versions/:id', async (ctx) => {
    const v = q('SELECT * FROM versions WHERE id = ?').get(ctx.params.id); if (!v) throw notFound('Версия не найдена.');
    const p = editable(v.project_id, ctx.user);
    let becameDraft = false;
    tx(db, () => {
      q('DELETE FROM versions WHERE id = ?').run(v.id);
      if (!versionCount(p.id) && p.status !== 'withheld' && p.status !== 'draft') { q("UPDATE projects SET status = 'draft' WHERE id = ?").run(p.id); becameDraft = true; }
    });
    await gcUploads(0);
    return ok(ctx, { becameDraft });
  }, { auth: true });

  /* Подписки и жалобы */
  on('POST', '/api/projects/:id/follow', (ctx) => {
    const p = getProject(ctx.params.id); if (!p || !canView(p, ctx.user)) throw notFound('Проект не найден.');
    tx(db, () => {
      const r = q('INSERT OR IGNORE INTO follows (user_id, project_id, created) VALUES (?, ?, ?)').run(ctx.user.id, p.id, Date.now());
      if (r.changes) {
        q('UPDATE projects SET followers = followers + 1 WHERE id = ?').run(p.id);
        if (p.owner_id !== ctx.user.id) notify(p.owner_id, 'follow', `${ctx.user.display_name} подписался на ${p.title}`, `/user/${ctx.user.username}`);
      }
    });
    return ok(ctx);
  }, { auth: true });
  on('DELETE', '/api/projects/:id/follow', (ctx) => {
    tx(db, () => {
      const r = q('DELETE FROM follows WHERE user_id = ? AND project_id = ?').run(ctx.user.id, ctx.params.id);
      if (r.changes) q('UPDATE projects SET followers = MAX(0, followers - 1) WHERE id = ?').run(ctx.params.id);
    });
    return ok(ctx);
  }, { auth: true });
  on('POST', '/api/projects/:id/reports', (ctx, b) => {
    const p = getProject(ctx.params.id); if (!p || !canView(p, ctx.user)) throw notFound('Проект не найден.');
    if (!limitReport(ctx.user.id)) throw new HttpError(429, 'Вы отправили много жалоб подряд. Попробуйте позже.');
    const reason = oneOf(b.reason, Object.keys(S.REPORT_REASONS), 'Причина');
    const body = str(b.body, 'Описание проблемы', { min: 10, max: 2000 });
    q("INSERT INTO reports (id, reporter_id, project_id, reason, body, status, created) VALUES (?, ?, ?, ?, ?, 'open', ?)").run(Auth.newId('r_'), ctx.user.id, p.id, reason, body, Date.now());
    for (const a of q("SELECT id FROM users WHERE role = 'admin'").all()) notify(a.id, 'report', `Новая жалоба на ${p.title}: ${S.REPORT_REASONS[reason]}`, '/dashboard/moderation');
    return ok(ctx);
  }, { auth: true });

  /* Модерация */
  on('PATCH', '/api/reports/:id', (ctx, b) => {
    const r = q('SELECT * FROM reports WHERE id = ?').get(ctx.params.id); if (!r) throw notFound('Жалоба не найдена.');
    const status = oneOf(b.status, ['resolved', 'dismissed'], 'Статус');
    const p = getProject(r.project_id);
    q('UPDATE reports SET status = ? WHERE id = ?').run(status, r.id);
    notify(r.reporter_id, 'moderation', `Жалоба на ${p ? p.title : 'проект'} ${status === 'resolved' ? 'рассмотрена: меры приняты' : 'отклонена: нарушений не нашли'}`, p ? `/project/${p.slug}` : '/');
    return ok(ctx);
  }, { auth: true, admin: true });
  on('PATCH', '/api/projects/:id/moderation', (ctx, b) => {
    const p = getProject(ctx.params.id); if (!p) throw notFound('Проект не найден.');
    const status = oneOf(b.status, ['withheld', 'published'], 'Статус');
    if (status === 'published' && !versionCount(p.id)) throw bad('У проекта нет версий, вернуть его в каталог нельзя.');
    tx(db, () => {
      q('UPDATE projects SET status = ? WHERE id = ?').run(status, p.id);
      notify(p.owner_id, 'moderation', status === 'withheld' ? `Проект ${p.title} скрыт модерацией после жалобы` : `Проект ${p.title} снова доступен в каталоге`, `/project/${p.slug}`);
      if (b.reportId) {
        const r = q("SELECT * FROM reports WHERE id = ? AND status = 'open'").get(b.reportId);
        if (r) { q("UPDATE reports SET status = 'resolved' WHERE id = ?").run(r.id); notify(r.reporter_id, 'moderation', `Жалоба на ${p.title} рассмотрена: проект скрыт`, '/'); }
      }
    });
    return ok(ctx);
  }, { auth: true, admin: true });
  on('POST', '/api/admin/reset', async (ctx) => {
    wipe(db);
    for (const f of await fsp.readdir(uploadsDir)) await fsp.rm(path.join(uploadsDir, f), { force: true });
    seedDemo(db, { adminPassword, demoPassword });
    ctx.clearCookie(); ctx.user = null;
    return ok(ctx);
  }, { auth: true, admin: true });

  /* Коллекции */
  function ownCollection(id, u) {
    const c = q('SELECT * FROM collections WHERE id = ?').get(id); if (!c) throw notFound('Коллекция не найдена.');
    if (c.owner_id !== u.id) throw forbidden('Это чужая коллекция.');
    return c;
  }
  on('POST', '/api/collections', (ctx, b) => {
    if (q('SELECT COUNT(*) n FROM collections WHERE owner_id = ?').get(ctx.user.id).n >= 200) throw bad('Можно создать не больше 200 коллекций.');
    const id = Auth.newId('c_'); const t = Date.now();
    tx(db, () => {
      q('INSERT INTO collections (id, owner_id, name, description, public, created) VALUES (?, ?, ?, ?, ?, ?)').run(id, ctx.user.id, str(b.name, 'Название', { min: 1, max: 60 }), str(b.description, 'Описание', { max: 300 }), b.public === false ? 0 : 1, t);
      if (b.projectId) { const p = getProject(b.projectId); if (p && canView(p, ctx.user)) q('INSERT INTO collection_items (collection_id, project_id, added) VALUES (?, ?, ?)').run(id, p.id, t); }
    });
    return ok(ctx, { id });
  }, { auth: true });
  on('PATCH', '/api/collections/:id', (ctx, b) => {
    const c = ownCollection(ctx.params.id, ctx.user);
    q('UPDATE collections SET name = ?, description = ?, public = ? WHERE id = ?').run(str(b.name, 'Название', { min: 1, max: 60 }), str(b.description, 'Описание', { max: 300 }), b.public ? 1 : 0, c.id);
    return ok(ctx);
  }, { auth: true });
  on('DELETE', '/api/collections/:id', (ctx) => { const c = ownCollection(ctx.params.id, ctx.user); q('DELETE FROM collections WHERE id = ?').run(c.id); return ok(ctx); }, { auth: true });
  on('PUT', '/api/collections/:id/items/:pid', (ctx) => {
    const c = ownCollection(ctx.params.id, ctx.user);
    const p = getProject(ctx.params.pid); if (!p || !canView(p, ctx.user)) throw notFound('Проект не найден.');
    q('INSERT OR IGNORE INTO collection_items (collection_id, project_id, added) VALUES (?, ?, ?)').run(c.id, p.id, Date.now());
    return ok(ctx);
  }, { auth: true });
  on('DELETE', '/api/collections/:id/items/:pid', (ctx) => {
    const c = ownCollection(ctx.params.id, ctx.user);
    q('DELETE FROM collection_items WHERE collection_id = ? AND project_id = ?').run(c.id, ctx.params.pid);
    return ok(ctx);
  }, { auth: true });

  /* Уведомления */
  on('POST', '/api/notifications/read', (ctx, b) => {
    if (b.id) q('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(b.id, ctx.user.id);
    else q('UPDATE notifications SET read = 1 WHERE user_id = ?').run(ctx.user.id);
    return ok(ctx);
  }, { auth: true });
  on('DELETE', '/api/notifications/read', (ctx) => { q('DELETE FROM notifications WHERE user_id = ? AND read = 1').run(ctx.user.id); return ok(ctx); }, { auth: true });

  /* Профиль и аккаунт */
  on('PATCH', '/api/me', async (ctx, b) => {
    const set = {};
    if ('displayName' in b) set.display_name = str(b.displayName, 'Отображаемое имя', { min: 1, max: 40 });
    if ('bio' in b) set.bio = str(b.bio, 'О себе', { max: 300 });
    if ('avatar' in b) set.avatar = b.avatar === null ? null : ownedUpload(b.avatar, ctx.user, 'image').id;
    if (Object.keys(set).length) q(`UPDATE users SET ${Object.keys(set).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(set), ctx.user.id);
    if ('avatar' in b) await gcUploads();
    return ok(ctx);
  }, { auth: true });
  on('PATCH', '/api/me/account', (ctx, b) => {
    const username = str(b.username, 'Имя пользователя', { min: 3, max: 24 });
    if (!USERNAME_RE.test(username)) throw bad('Имя пользователя: латиница, цифры и подчёркивание, от 3 до 24 символов.');
    const email = str(b.email, 'Эл. почта', { min: 3, max: 160 }); if (!EMAIL_RE.test(email)) throw bad('Проверьте адрес почты.');
    const u1 = q('SELECT id FROM users WHERE username = ?').get(username); if (u1 && u1.id !== ctx.user.id) throw new HttpError(409, `Имя «${username}» уже занято.`);
    const u2 = q('SELECT id FROM users WHERE email = ?').get(email); if (u2 && u2.id !== ctx.user.id) throw new HttpError(409, 'Эта почта уже привязана к другому аккаунту.');
    q('UPDATE users SET username = ?, email = ? WHERE id = ?').run(username, email, ctx.user.id);
    return ok(ctx);
  }, { auth: true });
  on('POST', '/api/me/password', (ctx, b) => {
    if (!limitAuth(`pw:${ctx.user.id}`)) throw new HttpError(429, 'Слишком много попыток. Подождите 10 минут.');
    if (!Auth.verifyPassword(String(b.old || ''), ctx.user.pass_hash)) throw bad('Текущий пароль введён неверно.');
    const pass = str(b.pass, 'Новый пароль', { min: 8, max: 200, trim: false });
    tx(db, () => {
      q('UPDATE users SET pass_hash = ? WHERE id = ?').run(Auth.hashPassword(pass), ctx.user.id);
      q('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(ctx.user.id, ctx.tokenHash); // выходим на других устройствах
    });
    return ok(ctx);
  }, { auth: true });
  on('DELETE', '/api/me', async (ctx, b) => {
    if (b.confirm !== ctx.user.username) throw bad('Для подтверждения введите своё имя пользователя.');
    q('DELETE FROM users WHERE id = ?').run(ctx.user.id);
    await gcUploads(0);
    ctx.clearCookie(); ctx.user = null;
    return ok(ctx);
  }, { auth: true });
  on('GET', '/api/me/export', (ctx) => {
    const st = buildState(ctx.user);
    const mineIds = new Set(st.projects.filter((p) => p.members.some((m) => m.userId === ctx.user.id)).map((p) => p.id));
    const data = {
      exported: new Date().toISOString(), user: st.users.find((u) => u.id === ctx.user.id),
      projects: st.projects.filter((p) => mineIds.has(p.id)).map((p) => ({ ...p, versions: st.versions.filter((v) => v.projectId === p.id) })),
      collections: st.collections.filter((c) => c.ownerId === ctx.user.id), follows: st.follows, notifications: st.notifications,
    };
    const body = JSON.stringify(data, null, 2);
    ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': contentDisposition(`craftory-${ctx.user.username}.json`), 'Cache-Control': 'no-store' });
    ctx.res.end(body);
  }, { auth: true });

  /* ---------- Скачивание версий и картинки ---------- */
  async function handleDownload(req, res, fileId, user, ip) {
    const f = q('SELECT f.*, v.project_id, v.name AS vname, v.number, v.loaders, v.game_versions FROM files f JOIN versions v ON v.id = f.version_id WHERE f.id = ?').get(fileId);
    const p = f && getProject(f.project_id);
    if (!f || !p || !canView(p, user)) throw notFound('Файл не найден.');
    // Одно скачивание одного файла с одного адреса считаем раз в 10 минут
    const key = `${ip}|${f.id}`; const t = Date.now();
    if (req.method === 'GET' && !(recentDownloads.get(key) > t - 600e3)) {
      recentDownloads.set(key, t);
      if (recentDownloads.size > 50000) for (const [k, v] of recentDownloads) if (v < t - 600e3) recentDownloads.delete(k);
      tx(db, () => {
        q('UPDATE versions SET downloads = downloads + 1 WHERE id = ?').run(f.version_id);
        q('UPDATE projects SET downloads = downloads + 1 WHERE id = ?').run(p.id);
        q('INSERT INTO stats (project_id, day, n) VALUES (?, ?, 1) ON CONFLICT (project_id, day) DO UPDATE SET n = n + 1').run(p.id, S.dateKey(t));
      });
    }
    const up = f.upload_id && q('SELECT * FROM uploads WHERE id = ?').get(f.upload_id);
    if (up) return sendFile(req, res, uploadPath(up.id), { 'Content-Type': up.mime, 'Content-Disposition': contentDisposition(f.name), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    const text = `Craftory — демонстрационный файл\n\nПроект: ${p.title}\nВерсия: ${f.vname} (${f.number})\nФайл: ${f.name}\nЗагрузчики: ${parseJson(f.loaders, []).join(', ')}\nВерсии игры: ${parseJson(f.game_versions, []).join(', ')}\n\nУ демо-проектов нет настоящих файлов. Загрузите свою версию с файлом, и скачиваться будет именно он.\n`;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': contentDisposition(`${f.name}.txt`), 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : text);
  }
  async function handleMedia(req, res, id) {
    const up = q("SELECT * FROM uploads WHERE id = ? AND kind = 'image'").get(id);
    if (!up) throw notFound('Изображение не найдено.');
    if (req.headers['if-none-match'] === `"${up.sha256}"`) { res.writeHead(304); return res.end(); }
    return sendFile(req, res, uploadPath(up.id), {
      'Content-Type': up.mime, 'Cache-Control': 'public, max-age=31536000, immutable', ETag: `"${up.sha256}"`,
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    });
  }

  /* ---------- Статика ---------- */
  async function serveStatic(req, res, pathname) {
    let rel = pathname === '/' ? '/index.html' : pathname;
    let file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) throw notFound();
    let st = await fsp.stat(file).catch(() => null);
    if (!st || !st.isFile()) {
      if (path.extname(rel)) throw notFound('Файл не найден.');
      file = path.join(PUBLIC_DIR, 'index.html'); rel = '/index.html'; st = await fsp.stat(file);
    }
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag };
    if (rel.endsWith('.html')) headers['Content-Security-Policy'] = CSP;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    return sendFile(req, res, file, headers);
  }

  /* ---------- Обработка запроса ---------- */
  async function readJson(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 1.5 * 1048576) throw new HttpError(413, 'Слишком большой запрос.'); chunks.push(c); }
    if (!size) return {};
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Ожидался JSON.');
    try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); return v && typeof v === 'object' ? v : {}; } catch { throw bad('Не удалось разобрать JSON.'); }
  }
  function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const ip = (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
    const secure = cookieSecure === 'auto' ? (trustProxy && req.headers['x-forwarded-proto'] === 'https') || !!req.socket.encrypted : !!cookieSecure;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    const { user, tokenHash } = Auth.userFromRequest(db, req);

    if (pathname.startsWith('/download/') && (req.method === 'GET' || req.method === 'HEAD')) return handleDownload(req, res, pathname.slice(10), user, ip);
    if (pathname.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) return handleMedia(req, res, pathname.slice(7));
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Метод не поддерживается.');
      return serveStatic(req, res, pathname);
    }
    const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
    if (!r) throw notFound('Такого метода API нет.');
    if (req.method !== 'GET') {
      // Защита от CSRF: свой заголовок нельзя отправить с чужого сайта без разрешения CORS
      if (req.headers['x-craftory'] !== '1') throw forbidden('Запрос отклонён: нет заголовка X-Craftory.');
      const origin = req.headers.origin;
      if (origin) { let host = ''; try { host = new URL(origin).host; } catch { /* неверный Origin */ } if (host !== req.headers.host) throw forbidden('Запрос с другого сайта отклонён.'); }
    }
    if (r.auth && !user) throw new HttpError(401, 'Войдите в аккаунт, чтобы продолжить.');
    if (r.admin && user.role !== 'admin') throw forbidden('Действие доступно только модераторам.');
    const m = pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const ctx = {
      req, res, url, params, user, tokenHash, ip,
      setCookie: (token) => res.setHeader('Set-Cookie', Auth.sessionCookie(token, { secure })),
      clearCookie: () => res.setHeader('Set-Cookie', Auth.sessionCookie('', { secure, clear: true })),
    };
    const body = r.raw || req.method === 'GET' ? {} : await readJson(req);
    const result = await r.handler(ctx, body);
    if (result !== undefined && !res.headersSent) sendJson(res, 200, result);
  }

  const server = http.createServer((req, res) => {
    const t = Date.now();
    handle(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) { res.destroy(); return; }
      if (String(req.url).startsWith('/api/')) sendJson(res, status, { error: status === 500 ? 'Внутренняя ошибка сервера. Попробуйте ещё раз позже.' : err.message });
      else { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(err.message); }
    }).finally(() => { if (log) console.log(`${req.method} ${req.url.split('?')[0]} ${res.statusCode} ${Date.now() - t}ms`); });
  });
  server.requestTimeout = 30 * 60e3; // большие загрузки на медленном канале
  const timer = setInterval(() => { Auth.purgeExpiredSessions(db); gcUploads().catch(() => {}); }, 3600e3);
  timer.unref();
  return { server, db, gcUploads, close: () => new Promise((res) => { clearInterval(timer); server.close(() => { db.close(); res(); }); server.closeAllConnections?.(); }) };
}

module.exports = { createApp };
