'use strict';
/* Тест сохранения в Postgres. Запускается, только если задан TEST_DATABASE_URL:
   TEST_DATABASE_URL=postgres://user@localhost:5432/db npm test
   Внимание: тест удаляет таблицы craftory_snapshot и craftory_blobs в этой базе. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/app.js');

const URL_ = process.env.TEST_DATABASE_URL;
const quiet = { log() {}, error() {} };

async function start(dir) {
  const { createPgPersistence } = require('../server/persist.js');
  const persistence = await createPgPersistence(URL_, { log: quiet, delayMs: 50 });
  const restored = await persistence.restore(dir);
  const app = createApp({ dataDir: dir, persistence, log: false, authLimit: 1000 });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  return { app, persistence, restored, base: `http://127.0.0.1:${app.server.address().port}` };
}
async function call(base, method, url, body, cookie, raw) {
  const headers = { 'x-craftory': '1' }; if (cookie) headers.cookie = cookie;
  let payload; if (raw) { payload = raw; headers['content-type'] = 'application/octet-stream'; headers['x-filename'] = 'mod.jar'; } else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers, body: payload });
  const set = res.headers.get('set-cookie');
  const type = res.headers.get('content-type') || '';
  return { status: res.status, data: type.includes('json') ? await res.json() : await res.text(), cookie: set ? set.split(';')[0] : cookie };
}

test('данные и файлы переживают перезапуск с пустой папкой', { skip: !URL_ && 'TEST_DATABASE_URL не задан' }, async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: URL_ });
  await pool.query('DROP TABLE IF EXISTS craftory_snapshot, craftory_blobs');

  // Первый запуск: пустая база, сайт заполняет демо-каталог
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'craftory-pa-'));
  const A = await start(dirA);
  assert.equal(A.restored.restored, false);
  let r = await call(A.base, 'POST', '/api/auth/signup', { username: 'keeper', email: 'keeper@test.dev', pass: 'password123' });
  assert.equal(r.status, 200); const cookie = r.cookie;
  r = await call(A.base, 'POST', '/api/projects', { type: 'mod', title: 'Persistent Mod', summary: 'Должен сохраниться' }, cookie);
  const pid = r.data.id;
  const up = await call(A.base, 'POST', '/api/uploads?kind=file', null, cookie, Buffer.from('persisted-bytes'));
  assert.equal(up.status, 200);
  r = await call(A.base, 'POST', `/api/projects/${pid}/versions`, { number: '1.0.0', loaders: ['fabric'], gameVersions: ['1.21.1'], files: [up.data.id] }, cookie);
  assert.equal(r.status, 200);
  await call(A.base, 'PATCH', `/api/projects/${pid}`, { status: 'published' }, cookie);
  await A.app.close(); // сохраняет последнее состояние
  fs.rmSync(dirA, { recursive: true, force: true });

  // Второй запуск: новая пустая папка, всё восстанавливается из Postgres
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'craftory-pb-'));
  const B = await start(dirB);
  assert.equal(B.restored.restored, true);
  assert.equal(B.restored.files, 1);
  const st = (await call(B.base, 'GET', '/api/state', null, cookie)).data;
  assert.ok(st.me, 'сессия сохранилась');
  assert.ok(st.users.find((u) => u.username === 'keeper'));
  const proj = st.projects.find((p) => p.id === pid);
  assert.equal(proj.status, 'published');
  assert.equal(st.projects.length, 35, 'демо-каталог не создан повторно');
  const file = st.versions.find((v) => v.projectId === pid).files[0];
  assert.equal((await call(B.base, 'GET', `/download/${file.id}`)).data, 'persisted-bytes');

  // Удаление проекта убирает и копию файла в Postgres
  await call(B.base, 'DELETE', `/api/projects/${pid}`, null, cookie);
  await B.app.close();
  fs.rmSync(dirB, { recursive: true, force: true });
  const blobs = (await pool.query('SELECT COUNT(*)::int n FROM craftory_blobs')).rows[0].n;
  assert.equal(blobs, 0);
  const snap = (await pool.query('SELECT size FROM craftory_snapshot WHERE id = 1')).rows[0];
  assert.ok(snap.size > 10000);
  await pool.end();
});
