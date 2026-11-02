'use strict';
/** Точка входа: node server.js. Настройки — переменные окружения (см. .env.example). */
const { createApp, seed } = require('./src/app');

const env = process.env;
const app = createApp({
  dataDir: env.DATA_DIR || './data',
  cookieSecure: env.COOKIE_SECURE === '1',
  trustProxy: env.TRUST_PROXY === '1',
  maxUploadMb: Number(env.MAX_UPLOAD_MB) || 200
});

seed(app.db, { adminLogin: env.ADMIN_LOGIN, adminPassword: env.ADMIN_PASSWORD, adminName: env.ADMIN_NAME })
  .then(() => (env.DEMO === '1' ? require('./src/demo').seedDemo(app.db) : null))
  .then(() => {
    const port = Number(env.PORT) || 3000;
    app.server.listen(port, env.HOST || '0.0.0.0', () => console.log(`[omni] Omni DSG API слушает порт ${port}`));
  })
  .catch((e) => { console.error(e); process.exit(1); });

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.close().then(() => process.exit(0)));
