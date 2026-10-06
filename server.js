#!/usr/bin/env node
'use strict';
/* Запуск: npm start (или node server.js). Настройки через переменные окружения, см. README. */
const path = require('node:path');
const { createApp } = require('./server/app.js');

const env = process.env;
const app = createApp({
  dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, 'data')),
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
const stop = () => { console.log('Останавливаем сервер…'); app.close().then(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
