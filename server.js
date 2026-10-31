#!/usr/bin/env node
'use strict';
/* Запуск: npm start (или node server.js). Настройки через переменные окружения, см. README. */
const path = require('node:path');
const { createApp, pickDataDir } = require('./server/app.js');

const env = process.env;
const dataDir = path.resolve(env.DATA_DIR || path.join(__dirname, 'data'));
// Если DATA_DIR задан, но недоступен (диск не подключён), сайт не падает, а пишет в ./data
const fallbackDataDir = env.DATA_DIR ? path.join(__dirname, 'data') : null;

async function main() {
  let persistence = null;
  if (env.DATABASE_URL) {
    // Хранилище в Postgres (например, бесплатный Neon): данные переживают перезапуски без постоянного диска
    const { createPgPersistence } = require('./server/persist.js');
    persistence = await createPgPersistence(env.DATABASE_URL);
    await persistence.restore(pickDataDir(dataDir, fallbackDataDir).dataDir);
  }
  const app = createApp({
    dataDir, fallbackDataDir, persistence,
    seed: env.SEED_DEMO !== '0',
    adminUser: env.ADMIN_USERNAME || 'admin',
    adminPassword: env.ADMIN_PASSWORD || 'admin1234',
    demoPassword: env.DEMO_PASSWORD || 'demo1234',
    cookieSecure: env.COOKIE_SECURE === '1' ? true : env.COOKIE_SECURE === '0' ? false : 'auto',
    trustProxy: env.TRUST_PROXY === '1',
    log: env.LOG !== '0',
  });
  const port = Number(env.PORT || 3000);
  const host = env.HOST || '0.0.0.0';
  app.server.listen(port, host, () => console.log(`Craftory запущен: http://localhost:${port}`));
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    console.log('Останавливаем сервер и сохраняем данные…');
    setTimeout(() => process.exit(1), 25000).unref(); // хостинг ждёт около 30 секунд
    app.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main().catch((e) => { console.error('Не удалось запустить сервер:', e.message); process.exit(1); });
