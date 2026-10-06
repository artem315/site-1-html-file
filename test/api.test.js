'use strict';
/* Тесты API: node --test test/ (или npm test). Каждый запуск поднимает сервер на свободном порту с временной базой. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/app.js');

let app; let base; let dataDir;
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftory-test-'));
  app = createApp({ dataDir, log: false, authLimit: 10000 });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => { await app.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

/* Мини-клиент с cookie */
function client() {
  let cookie = '';
  async function call(method, url, body, { raw, headers = {}, csrf = true } = {}) {
    const h = { ...headers }; if (cookie) h.cookie = cookie; if (csrf) h['x-craftory'] = '1';
    let payload;
    if (raw) payload = raw; else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers: h, body: payload, redirect: 'manual' });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  return { call, get: (u) => call('GET', u), post: (u, b) => call('POST', u, b), patch: (u, b) => call('PATCH', u, b), del: (u, b) => call('DELETE', u, b) };
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let n = 0;
async function newUser() {
  const c = client(); n++;
  const r = await c.post('/api/auth/signup', { username: `user_${n}_${Date.now() % 1e6}`, email: `u${n}_${Date.now()}@test.dev`, pass: 'password123' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  c.id = r.data.state.me; return c;
}
async function login(name, pass) { const c = client(); const r = await c.post('/api/auth/signin', { login: name, pass }); assert.equal(r.status, 200); c.id = r.data.state.me; return c; }
async function uploadFile(c, content, name = 'mod.jar', kind = 'file', type = 'application/java-archive') {
  return c.call('POST', `/api/uploads?kind=${kind}`, undefined, { raw: content, headers: { 'content-type': type, 'x-filename': encodeURIComponent(name) } });
}
async function projectWithVersion(c, extra = {}) {
  const r = await c.post('/api/projects', { type: 'mod', title: `Test ${Math.random().toString(36).slice(2, 8)}`, summary: 'Тестовый мод', ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const up = await uploadFile(c, Buffer.from('jar-bytes'));
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const v = await c.post(`/api/projects/${r.data.id}/versions`, { number: '1.0.0', channel: 'release', loaders: ['fabric'], gameVersions: ['1.21.1'], changelog: '- init', files: [up.data.id] });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return { id: r.data.id, slug: r.data.slug, versionId: v.data.id, state: v.data.state };
}

test('демо-каталог доступен без входа и не раскрывает почту', async () => {
  const r = await client().get('/api/state');
  assert.equal(r.status, 200);
  assert.equal(r.data.me, null);
  assert.equal(r.data.projects.length, 34);
  assert.ok(r.data.projects.every((p) => p.status === 'published'));
  assert.ok(r.data.users.every((u) => !('email' in u)));
  assert.deepEqual(r.data.notifications, []);
});

test('регистрация, вход и выход', async () => {
  const c = await newUser();
  const me = await c.get('/api/state');
  assert.equal(me.data.me, c.id);
  assert.ok(me.data.users.find((u) => u.id === c.id).email, 'свою почту пользователь видит');
  const out = await c.post('/api/auth/signout');
  assert.equal(out.data.state.me, null);
  assert.equal((await c.get('/api/state')).data.me, null);
});

test('неверный пароль и занятое имя отклоняются', async () => {
  const bad = await client().post('/api/auth/signin', { login: 'demo', pass: 'nope' });
  assert.equal(bad.status, 401);
  const dup = await client().post('/api/auth/signup', { username: 'demo', email: 'x@y.zz', pass: 'password123' });
  assert.equal(dup.status, 409);
  const short = await client().post('/api/auth/signup', { username: 'okname', email: 'ok@y.zz', pass: '123' });
  assert.equal(short.status, 400);
});

test('запрос без заголовка X-Craftory или с чужого сайта отклоняется', async () => {
  const c = await newUser();
  const r1 = await c.call('POST', '/api/projects', { type: 'mod', title: 'X', summary: 'Y' }, { csrf: false });
  assert.equal(r1.status, 403);
  const r2 = await c.call('POST', '/api/projects', { type: 'mod', title: 'X', summary: 'Y' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(r2.status, 403);
});

test('черновик виден только участникам, публикация требует версию', async () => {
  const owner = await newUser(); const other = await newUser();
  const r = await owner.post('/api/projects', { type: 'shader', title: 'Draft Shader', summary: 'Черновик' });
  const id = r.data.id;
  assert.ok(r.data.state.projects.find((p) => p.id === id));
  assert.ok(!(await other.get('/api/state')).data.projects.find((p) => p.id === id));
  assert.equal((await other.get(`/api/projects/${r.data.slug}`)).status, 404);
  const pub = await owner.patch(`/api/projects/${id}`, { status: 'published' });
  assert.equal(pub.status, 400);
  assert.match(pub.data.error, /без версий/);
});

test('чужой проект нельзя изменить или удалить', async () => {
  const owner = await newUser(); const other = await newUser();
  const p = await projectWithVersion(owner);
  assert.equal((await other.patch(`/api/projects/${p.id}`, { title: 'Взлом' })).status, 403);
  assert.equal((await other.del(`/api/projects/${p.id}`)).status, 403);
  assert.equal((await other.del(`/api/versions/${p.versionId}`)).status, 403);
  assert.equal((await client().patch(`/api/projects/${p.id}`, { title: 'Аноним' })).status, 401);
});

test('загрузка версии, публикация, скачивание настоящего файла и учёт загрузок', async () => {
  const owner = await newUser();
  const p = await projectWithVersion(owner);
  const pub = await owner.patch(`/api/projects/${p.id}`, { status: 'published' });
  assert.equal(pub.status, 200);
  const visitor = client();
  const st = (await visitor.get('/api/state')).data;
  const proj = st.projects.find((x) => x.id === p.id);
  assert.ok(proj, 'опубликованный проект виден всем');
  assert.deepEqual(proj.loaders, ['fabric']);
  const file = st.versions.find((v) => v.id === p.versionId).files[0];
  assert.equal(file.hasFile, true);
  const dl = await visitor.get(`/download/${file.id}`);
  assert.equal(dl.status, 200);
  assert.equal(dl.data, 'jar-bytes');
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  await visitor.get(`/download/${file.id}`); // повтор с того же адреса не считается
  const after = (await visitor.get('/api/state')).data.projects.find((x) => x.id === p.id);
  assert.equal(after.downloads, 1);
  const stats = (await owner.get('/api/state')).data.stats[p.id];
  assert.equal(Object.values(stats).reduce((a, b) => a + b, 0), 1);
});

test('повторный номер версии и версия без файла отклоняются', async () => {
  const owner = await newUser(); const p = await projectWithVersion(owner);
  const up = await uploadFile(owner, Buffer.from('x'));
  const dup = await owner.post(`/api/projects/${p.id}/versions`, { number: '1.0.0', loaders: ['fabric'], gameVersions: ['1.21.1'], files: [up.data.id] });
  assert.equal(dup.status, 409);
  const nofile = await owner.post(`/api/projects/${p.id}/versions`, { number: '1.0.1', loaders: ['fabric'], gameVersions: ['1.21.1'], files: [] });
  assert.equal(nofile.status, 400);
  const badLoader = await owner.post(`/api/projects/${p.id}/versions`, { number: '1.0.2', loaders: ['paper'], gameVersions: ['1.21.1'], files: [up.data.id] });
  assert.equal(badLoader.status, 400);
});

test('картинки проверяются по содержимому, чужие загрузки использовать нельзя', async () => {
  const a = await newUser(); const b = await newUser();
  const fake = await uploadFile(a, Buffer.from('<svg onload=alert(1)>'), 'x.png', 'image', 'image/png');
  assert.equal(fake.status, 400);
  const img = await uploadFile(a, PNG, 'icon.png', 'image', 'image/png');
  assert.equal(img.status, 200);
  const media = await fetch(`${base}/media/${img.data.id}`);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'image/png');
  assert.equal(media.headers.get('x-content-type-options'), 'nosniff');
  const p = await projectWithVersion(b);
  assert.equal((await b.patch(`/api/projects/${p.id}`, { icon: img.data.id })).status, 403);
});

test('проект по ссылке не виден в каталоге, но открывается по адресу', async () => {
  const owner = await newUser(); const p = await projectWithVersion(owner);
  await owner.patch(`/api/projects/${p.id}`, { status: 'unlisted' });
  const anon = client();
  assert.ok(!(await anon.get('/api/state')).data.projects.find((x) => x.id === p.id));
  const one = await anon.get(`/api/projects/${p.slug}`);
  assert.equal(one.status, 200);
  assert.equal(one.data.projects[0].id, p.id);
  assert.equal(one.data.versions.length, 1);
});

test('подписка уведомляет автора, новая версия уведомляет подписчиков', async () => {
  const owner = await newUser(); const fan = await newUser();
  const p = await projectWithVersion(owner);
  await owner.patch(`/api/projects/${p.id}`, { status: 'published' });
  const f = await fan.post(`/api/projects/${p.id}/follow`);
  assert.equal(f.data.state.follows.length, 1);
  assert.ok((await owner.get('/api/state')).data.notifications.some((x) => x.type === 'follow'));
  const up = await uploadFile(owner, Buffer.from('v2'));
  await owner.post(`/api/projects/${p.id}/versions`, { number: '1.1.0', loaders: ['fabric'], gameVersions: ['1.21.4'], files: [up.data.id] });
  const notes = (await fan.get('/api/state')).data.notifications;
  assert.ok(notes.some((x) => x.type === 'version' && x.text.includes('1.1.0')));
  const twice = await fan.post(`/api/projects/${p.id}/follow`);
  assert.equal(twice.data.state.projects.find((x) => x.id === p.id).followers, 1, 'повторная подписка не считается');
});

test('жалоба и модерация: скрытый проект пропадает из каталога', async () => {
  const owner = await newUser(); const reporter = await newUser();
  const p = await projectWithVersion(owner);
  await owner.patch(`/api/projects/${p.id}`, { status: 'published' });
  const rep = await reporter.post(`/api/projects/${p.id}/reports`, { reason: 'spam', body: 'Это спам, а не мод.' });
  assert.equal(rep.status, 200);
  assert.equal((await reporter.patch(`/api/projects/${p.id}/moderation`, { status: 'withheld' })).status, 403);
  const admin = await login('admin', 'admin1234');
  const report = (await admin.get('/api/state')).data.reports.find((r) => r.projectId === p.id);
  assert.ok(report);
  const mod = await admin.patch(`/api/projects/${p.id}/moderation`, { status: 'withheld', reportId: report.id });
  assert.equal(mod.status, 200);
  assert.ok(!(await client().get('/api/state')).data.projects.find((x) => x.id === p.id));
  assert.equal((await owner.patch(`/api/projects/${p.id}`, { status: 'published' })).status, 403);
  assert.ok((await reporter.get('/api/state')).data.notifications.some((x) => x.type === 'moderation'));
});

test('коллекции: личная видна только владельцу', async () => {
  const a = await newUser(); const b = await newUser();
  const st = (await a.get('/api/state')).data; const pid = st.projects[0].id;
  const c = await a.post('/api/collections', { name: 'Секрет', public: false, projectId: pid });
  assert.equal(c.status, 200);
  assert.ok(c.data.state.collections.find((x) => x.id === c.data.id).projects.includes(pid));
  assert.ok(!(await b.get('/api/state')).data.collections.find((x) => x.id === c.data.id));
  assert.equal((await b.del(`/api/collections/${c.data.id}`)).status, 403);
});

test('смена пароля и удаление аккаунта', async () => {
  const c = await newUser();
  const name = (await c.get('/api/state')).data.users.find((u) => u.id === c.id).username;
  assert.equal((await c.post('/api/me/password', { old: 'wrong-pass', pass: 'newpassword1' })).status, 400);
  assert.equal((await c.post('/api/me/password', { old: 'password123', pass: 'newpassword1' })).status, 200);
  await login(name, 'newpassword1');
  const p = await projectWithVersion(c);
  assert.equal((await c.del('/api/me', { confirm: 'wrong' })).status, 400);
  assert.equal((await c.del('/api/me', { confirm: name })).status, 200);
  const st = (await client().get('/api/state')).data;
  assert.ok(!st.users.find((u) => u.id === c.id));
  assert.ok(!st.projects.find((x) => x.id === p.id));
});

test('частые попытки входа ограничиваются', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftory-rl-'));
  const small = createApp({ dataDir: dir, log: false, authLimit: 3 });
  await new Promise((r) => small.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${small.server.address().port}/api/auth/signin`;
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await fetch(url, { method: 'POST', headers: { 'x-craftory': '1', 'content-type': 'application/json' }, body: JSON.stringify({ login: 'demo', pass: 'bad' }) })).status);
  await small.close(); fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
});

test('статика и защита от выхода за пределы папки', async () => {
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-security-policy'), /script-src 'self'/);
  const shared = await fetch(`${base}/shared.js`);
  assert.equal(shared.status, 200);
  const trav = await fetch(`${base}/%2e%2e/server/app.js`);
  assert.equal(trav.status, 404);
  const missing = await fetch(`${base}/nope.js`);
  assert.equal(missing.status, 404);
});
