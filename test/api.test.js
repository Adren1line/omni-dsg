'use strict';
/** Сквозные проверки API: вход, права по должностям, файлы. Запуск: npm test */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, seed } = require('../src/app');

let app, base, dir;
const quiet = { log() {}, error() {} };

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-'));
  app = createApp({ dataDir: dir, log: quiet, maxUploadMb: 1 });
  await seed(app.db, { adminLogin: 'admin', adminPassword: 'Admin12345', log: quiet });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + app.server.address().port;
});
test.after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

/** Клиент с cookie-сессией. */
function client() {
  let cookie = '';
  async function call(method, url, body, headers) {
    const h = Object.assign({ 'X-Omni-Request': '1' }, headers || {});
    if (cookie) h.Cookie = cookie;
    let payload = body;
    if (body !== undefined && !(body instanceof Buffer)) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers: h, body: payload });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') && !res.headers.get('content-disposition') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  return { call, login: (l, p) => call('POST', '/api/auth/login', { login: l, password: p }) };
}

test('вход, неверный пароль, защита от подделки запроса', async () => {
  const c = client();
  assert.equal((await c.call('GET', '/api/me')).status, 401);
  assert.equal((await c.login('admin', 'wrong')).status, 401);
  const noHeader = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  const ok = await c.login('admin', 'Admin12345');
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'admin');
  assert.ok(!('pass_hash' in ok.data.user));
  assert.equal((await c.call('GET', '/api/me')).data.user.login, 'admin');
});

test('пароли хранятся только хешем scrypt', () => {
  const row = app.db.prepare("SELECT pass_hash FROM users WHERE login='admin'").get();
  assert.match(row.pass_hash, /^scrypt\$/);
  assert.ok(!row.pass_hash.includes('Admin12345'));
});

test('лимит попыток входа', async () => {
  const c = client();
  for (let i = 0; i < 5; i++) await c.login('nobody', 'x');
  assert.equal((await c.login('nobody', 'x')).status, 429);
});

let ids = {};
test('должности и сотрудники: права задаёт должность', async () => {
  const a = client(); await a.login('admin', 'Admin12345');
  const pos = (await a.call('GET', '/api/positions')).data.positions;
  assert.equal(pos.length, 6);
  const prorab = pos.find((p) => p.name === 'Прораб');
  const created = await a.call('POST', '/api/users', { login: 'erlan', name: 'Ерлан Жумабеков', role: 'staff', positionId: prorab.id });
  assert.equal(created.status, 200);
  assert.ok(created.data.tempPassword, 'выдан временный пароль');
  ids.erlanPw = created.data.tempPassword; ids.erlan = created.data.user.id;
  assert.deepEqual(created.data.user.stages, [0, 4, 5]);
  assert.equal(created.data.user.kontur, 'notes');
  assert.ok(!created.data.user.perms.includes('pub'));
  const cl = await a.call('POST', '/api/users', { login: 'aigerim', name: 'Айгерим Нурланова', role: 'client', password: 'Client12345' });
  ids.client = cl.data.user.id;
  const other = await a.call('POST', '/api/users', { login: 'timur', name: 'Тимур Ахметов', role: 'staff', positionId: pos.find((p) => p.name === 'Архитектор').id, password: 'Timur12345' });
  ids.timur = other.data.user.id;
  assert.equal((await a.call('POST', '/api/users', { login: 'erlan', name: 'Дубль', role: 'staff' })).status, 409);
  // сотрудник без права «Команда» не видит список пользователей
  const e = client(); await e.login('erlan', ids.erlanPw);
  assert.equal((await e.call('GET', '/api/users')).status, 403);
  // админ даёт прорабу «Команду» — доступ появляется
  await a.call('PATCH', '/api/positions/' + prorab.id, { perms: ['stage', 'tasks', 'storage', 'team'] });
  assert.equal((await e.call('GET', '/api/users')).status, 200);
  await a.call('PATCH', '/api/positions/' + prorab.id, { perms: ['stage', 'tasks', 'storage'] });
  // нельзя удалить должность, на которой есть люди
  assert.equal((await a.call('DELETE', '/api/positions/' + prorab.id)).status, 409);
});

test('нельзя убрать последнего администратора', async () => {
  const a = client(); await a.login('admin', 'Admin12345');
  const me = (await a.call('GET', '/api/me')).data.user;
  assert.equal((await a.call('PATCH', '/api/users/' + me.id, { active: false })).status, 400);
});

test('проекты видны только участникам', async () => {
  const a = client(); await a.login('admin', 'Admin12345');
  const p = await a.call('POST', '/api/projects', { name: 'Квартира в ЖК «Esentai City»', area: 112, leadId: ids.timur, clientId: ids.client, members: [ids.erlan] });
  assert.equal(p.status, 200); ids.p1 = p.data.project.id;
  const p2 = await a.call('POST', '/api/projects', { name: 'Дом в Таусамалы', area: 240 }); ids.p2 = p2.data.project.id;
  const e = client(); await e.login('erlan', ids.erlanPw);
  const list = (await e.call('GET', '/api/projects')).data.projects.map((x) => x.id);
  assert.deepEqual(list, [ids.p1]);
  assert.equal((await e.call('GET', '/api/projects/' + ids.p2)).status, 404);
  // прораб ведёт стадии, но не меняет название
  assert.equal((await e.call('PATCH', '/api/projects/' + ids.p1, { stage: 4, stagePct: 55 })).status, 200);
  assert.equal((await e.call('PATCH', '/api/projects/' + ids.p1, { name: 'Другое' })).status, 403);
});

test('файлы: загрузка, видимость для заказчика, скачивание, лимит размера', async () => {
  const e = client(); await e.login('erlan', ids.erlanPw);
  const body = Buffer.from('Рабочий проект, альбом — тестовые байты');
  const up = await e.call('POST', `/api/projects/${ids.p1}/files`, body, { 'X-File-Name': encodeURIComponent('Альбом РП.pdf'), 'Content-Type': 'application/pdf' });
  assert.equal(up.status, 200); const fid = up.data.file.id;
  assert.equal(up.data.file.public, false);
  // в чужой проект загрузить нельзя
  assert.equal((await e.call('POST', `/api/projects/${ids.p2}/files`, body, { 'X-File-Name': 'x.pdf' })).status, 404);
  // слишком большой файл
  assert.equal((await e.call('POST', `/api/projects/${ids.p1}/files`, Buffer.alloc(1048576 + 10), { 'X-File-Name': 'big.bin' })).status, 413);
  // заказчик не видит внутренний файл
  const c = client(); await c.login('aigerim', 'Client12345');
  assert.equal((await c.call('GET', `/api/projects/${ids.p1}/files`)).data.files.length, 0);
  assert.equal((await c.call('GET', `/api/files/${fid}/download`)).status, 404);
  // прораб не может открыть файл заказчику (нет права), архитектор — может
  assert.equal((await e.call('PATCH', `/api/files/${fid}`, { public: true })).status, 403);
  const t = client(); await t.login('timur', 'Timur12345');
  assert.equal((await t.call('PATCH', `/api/files/${fid}`, { public: true })).status, 200);
  const files = (await c.call('GET', `/api/projects/${ids.p1}/files`)).data.files;
  assert.equal(files.length, 1);
  const dl = await c.call('GET', `/api/files/${fid}/download`);
  assert.equal(dl.status, 200);
  assert.equal(Buffer.compare(dl.data, body), 0);
  assert.match(dl.headers.get('content-disposition'), /filename\*=UTF-8''/);
  // заказчик не загружает и не удаляет
  assert.equal((await c.call('POST', `/api/projects/${ids.p1}/files`, body, { 'X-File-Name': 'c.pdf' })).status, 403);
  assert.equal((await c.call('DELETE', `/api/files/${fid}`)).status, 403);
  // на диске файл лежит под случайным ключом, не под именем пользователя
  const key = app.db.prepare('SELECT storage_key FROM files WHERE id = ?').get(fid).storage_key;
  assert.match(key, /^[a-f0-9]{2}\/[a-f0-9]{32}$/);
});

test('сброс пароля завершает сессии сотрудника', async () => {
  const e = client(); await e.login('erlan', ids.erlanPw);
  const a = client(); await a.login('admin', 'Admin12345');
  const r = await a.call('POST', `/api/users/${ids.erlan}/reset-password`);
  assert.equal(r.status, 200);
  assert.equal((await e.call('GET', '/api/me')).status, 401);
  const e2 = client(); assert.equal((await e2.login('erlan', r.data.tempPassword)).status, 200);
  assert.equal((await e2.call('GET', '/api/me')).data.user.mustChangePassword, true);
  assert.equal((await e2.call('POST', '/api/me/password', { current: r.data.tempPassword, next: 'короткий' })).status, 400);
  assert.equal((await e2.call('POST', '/api/me/password', { current: r.data.tempPassword, next: 'Erlan2026pass' })).status, 200);
  assert.equal((await e2.call('GET', '/api/me')).data.user.mustChangePassword, false);
});

test('журнал и выгрузка: без хешей по умолчанию, только админ', async () => {
  const a = client(); await a.login('admin', 'Admin12345');
  const log = (await a.call('GET', '/api/audit?q=' + encodeURIComponent('Альбом'))).data.audit;
  assert.ok(log.length >= 1);
  const ex = await a.call('GET', '/api/admin/export');
  const dump = JSON.parse(ex.data.toString('utf8'));
  assert.ok(dump.users.every((u) => !('pass_hash' in u)));
  const ex2 = JSON.parse((await a.call('GET', '/api/admin/export?hashes=1')).data.toString('utf8'));
  assert.ok(ex2.users.every((u) => /^scrypt\$/.test(u.pass_hash)));
  const e = client(); await e.login('timur', 'Timur12345');
  assert.equal((await e.call('GET', '/api/admin/export')).status, 403);
  assert.equal((await e.call('GET', '/api/audit')).status, 403);
});
