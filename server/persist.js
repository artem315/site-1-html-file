'use strict';
/* Сохранение данных во внешний Postgres (например, бесплатный Neon).
   Сайт работает на локальном SQLite, а этот модуль:
   - при запуске восстанавливает базу и загруженные файлы из Postgres;
   - после изменений (не чаще раза в несколько секунд) сохраняет копию базы;
   - сразу сохраняет каждый загруженный файл и удаляет ненужные;
   - при остановке сервера сохраняет последнее состояние.
   Так данные переживают перезапуски и выкладки на хостингах без постоянного диска. */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS craftory_snapshot (
  id INTEGER PRIMARY KEY,
  data BYTEA NOT NULL,
  size INTEGER NOT NULL,
  saved_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS craftory_blobs (
  id TEXT PRIMARY KEY,
  data BYTEA NOT NULL,
  size INTEGER NOT NULL,
  created BIGINT NOT NULL
);`;

async function createPgPersistence(url, { log = console, delayMs = 4000 } = {}) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 20000 });
  pool.on('error', (e) => log.error('Postgres:', e.message));
  await pool.query(SCHEMA);

  let db = null; let dbFile = null; let timer = null; let saving = null; let dirty = false; let lastSaved = 0; let lastError = null;

  /* Восстановление: вызывается до открытия SQLite */
  async function restore(dataDir) {
    const uploadsDir = path.join(dataDir, 'uploads');
    await fsp.mkdir(uploadsDir, { recursive: true });
    dbFile = path.join(dataDir, 'craftory.db');
    const snap = await pool.query('SELECT data, saved_at FROM craftory_snapshot WHERE id = 1');
    let restored = false;
    if (snap.rows.length) {
      for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) await fsp.rm(f, { force: true });
      await fsp.writeFile(dbFile, snap.rows[0].data);
      lastSaved = Number(snap.rows[0].saved_at); restored = true;
    }
    const ids = (await pool.query('SELECT id FROM craftory_blobs')).rows.map((r) => r.id);
    let files = 0;
    for (const id of ids) {
      const target = path.join(uploadsDir, id);
      if (fs.existsSync(target)) continue;
      const r = await pool.query('SELECT data FROM craftory_blobs WHERE id = $1', [id]);
      if (r.rows.length) { await fsp.writeFile(target, r.rows[0].data); files++; }
    }
    log.log(restored ? `Postgres: база восстановлена (сохранена ${new Date(lastSaved).toISOString()}), файлов: ${files}` : 'Postgres: сохранённых данных нет, начинаем с чистой базы');
    return { restored, files };
  }

  /* Снимок базы: VACUUM INTO даёт согласованную копию без остановки сервера */
  async function saveNow() {
    if (!db) return;
    dirty = false;
    const tmp = `${dbFile}.snapshot`;
    await fsp.rm(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const data = await fsp.readFile(tmp);
    await fsp.rm(tmp, { force: true });
    const t = Date.now();
    await pool.query(`INSERT INTO craftory_snapshot (id, data, size, saved_at) VALUES (1, $1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, size = EXCLUDED.size, saved_at = EXCLUDED.saved_at`, [data, data.length, t]);
    lastSaved = t; lastError = null;
  }
  function runSave() {
    timer = null;
    if (saving) { saving.finally(() => { if (dirty && !timer) timer = setTimeout(runSave, delayMs); }); return saving; }
    saving = saveNow().catch((e) => { lastError = e.message; dirty = true; log.error('Postgres: не удалось сохранить базу:', e.message); if (!timer) timer = setTimeout(runSave, delayMs * 4); })
      .finally(() => { saving = null; });
    return saving;
  }
  function markDirty() { dirty = true; if (!timer && db) timer = setTimeout(runSave, delayMs); }
  async function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (saving) await saving;
    if (dirty) await runSave();
  }

  async function putBlob(id, file) {
    const data = await fsp.readFile(file);
    await pool.query('INSERT INTO craftory_blobs (id, data, size, created) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING', [id, data, data.length, Date.now()]);
  }
  async function delBlob(id) { await pool.query('DELETE FROM craftory_blobs WHERE id = $1', [id]); }
  async function clearBlobs() { await pool.query('DELETE FROM craftory_blobs'); }
  function attach(sqliteDb) { db = sqliteDb; }
  function status() { return { kind: 'postgres', lastSaved, pending: dirty || !!timer || !!saving, lastError }; }
  async function close() { await flush(); await pool.end(); }

  return { restore, attach, markDirty, flush, putBlob, delBlob, clearBlobs, status, close };
}

module.exports = { createPgPersistence };
