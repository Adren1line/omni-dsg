'use strict';
/** Проверки рабочих данных: начальное состояние по ролям, задачи, заявки, бот, деньги. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, seed } = require('../src/app');
const { seedDemo, PASSWORD } = require('../src/demo');

let app, base, dir;
const quiet = { log() {}, error() {} };

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-w-'));
  app = createApp({ dataDir: dir, log: quiet });
  await seed(app.db, { adminLogin: 'admin', adminPassword: 'Admin12345', log: quiet });
  await seedDemo(app.db, quiet);
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + app.server.address().port;
});
test.after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

async function as(login, password) {
  let cookie = '';
  async function call(method, url, body) {
    const h = { 'X-Omni-Request': '1' }; if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  }
  const r = await call('POST', '/api/auth/login', { login, password: password || PASSWORD });
  assert.equal(r.status, 200, 'вход ' + login);
  return call;
}

test('демо-база не перезаписывается повторно', async () => {
  assert.equal(await seedDemo(app.db, quiet), false);
});

test('состояние для директора: всё, кроме настроек бота; деньги видны', async () => {
  const d = await as('director');
  const s = (await d('GET', '/api/state')).data;
  assert.equal(s.projects.length, 4);
  assert.ok(s.projects.every((p) => typeof p.budget === 'number'));
  assert.ok(s.projects[0].plan && s.projects[0].plan.length === 6, 'план рассчитан от срока');
  assert.equal(s.leads.length, 5);
  assert.ok(s.bot.log.length >= 5);
  assert.equal(s.bot.cfg, undefined);
  assert.ok(s.bot.updates.length >= 1, 'график доступен директору');
  assert.ok(s.users.every((u) => !('pass_hash' in u)));
});

test('состояние для прораба: только свои объекты, без денег, заявок и бота', async () => {
  const e = await as('erlan');
  const s = (await e('GET', '/api/state')).data;
  assert.equal(s.projects.length, 3);
  assert.ok(s.projects.every((p) => p.budget === undefined));
  assert.equal(s.leads.length, 0);
  assert.equal(s.bot.log, undefined);
  assert.ok(s.users.every((u) => u.login === undefined), 'логины видит только «Команда»');
  const pids = s.projects.map((p) => p.id);
  assert.ok(s.tasks.every((t) => pids.includes(t.projectId)));
});

test('состояние для заказчика: свой объект, открытая лента, без задач', async () => {
  const c = await as('aigerim');
  const s = (await c('GET', '/api/state')).data;
  assert.equal(s.projects.length, 1);
  assert.equal(s.tasks.length, 0);
  assert.ok(s.feed.length === 3 && s.feed.every((f) => f.public));
  assert.equal(s.positions.length, 0);
  assert.ok(s.users.length <= 6);
  assert.ok(!s.users.some((u) => u.name === 'Алия Сарсенова'), 'заказчик не видит всех сотрудников');
});

test('задачи: ставит право tasks, отмечает исполнитель', async () => {
  const d = await as('director'); const e = await as('erlan'); const s = await as('sergey');
  const st = (await d('GET', '/api/state')).data;
  const p1 = st.projects.find((p) => p.name.includes('Esentai'));
  const erlan = st.users.find((u) => u.name.startsWith('Ерлан'));
  const dana = st.users.find((u) => u.name.startsWith('Дана'));
  const t = await e('POST', `/api/projects/${p1.id}/tasks`, { text: 'Снять фото стяжки', assigneeId: erlan.id, due: '2026-12-01' });
  assert.equal(t.status, 200);
  // комплектатор не ставит задачи
  assert.equal((await s('POST', `/api/projects/${p1.id}/tasks`, { text: 'x' })).status, 403);
  // исполнитель вне команды
  const p4 = st.projects.find((p) => p.name.includes('Офис'));
  assert.equal((await d('POST', `/api/projects/${p4.id}/tasks`, { text: 'x', assigneeId: erlan.id })).status, 400);
  // чужую задачу комплектатор не отмечает, свою — прораб отмечает
  const danaTask = st.tasks.find((x) => x.assigneeId === dana.id && x.projectId === p1.id);
  assert.equal((await s('PATCH', `/api/tasks/${danaTask.id}`, { done: true })).status, 403);
  assert.equal((await e('PATCH', `/api/tasks/${t.data.task.id}`, { done: true })).data.task.done, true);
  assert.equal((await d('POST', `/api/projects/${p1.id}/tasks`, { text: 'Срок', due: '01.12.2026' })).status, 400);
});

test('заявки и деньги', async () => {
  const d = await as('director'); const e = await as('erlan');
  const l = await d('POST', '/api/leads', { name: 'Тест Лид', obj: 'Квартира 50 м²', src: 'Сайт' });
  assert.equal(l.data.lead.status, 'cold');
  assert.equal((await d('PATCH', '/api/leads/' + l.data.lead.id, { status: 'hot' })).data.lead.status, 'hot');
  assert.equal((await d('PATCH', '/api/leads/' + l.data.lead.id, { status: 'lost' })).status, 400);
  assert.equal((await e('POST', '/api/leads', { name: 'x' })).status, 403);
  const p = (await d('GET', '/api/state')).data.projects.find((x) => x.name.includes('Esentai'));
  assert.equal((await d('PATCH', '/api/projects/' + p.id, { paid: 1000 })).data.project.paid, 1000);
  assert.equal((await e('PATCH', '/api/projects/' + p.id, { paid: 5 })).status, 403);
});

test('бот: настройки и обучение — только с правом «Бот»', async () => {
  const a = await as('admin', 'Admin12345'); const d = await as('director'); const c = await as('aigerim');
  assert.equal((await d('PUT', '/api/bot/config', { wa: true })).status, 403);
  const cfg = await a('PUT', '/api/bot/config', { wa: true, pollAt: '19:30', remindH: 999 });
  assert.equal(cfg.data.cfg.wa, true); assert.equal(cfg.data.cfg.remindH, 72);
  assert.equal((await a('PUT', '/api/bot/config', { pollAt: '25:00' })).status, 400);
  // вопрос заказчика попадает боту
  const pid = (await c('GET', '/api/state')).data.projects[0].id;
  assert.equal((await c('POST', `/api/projects/${pid}/question`, { text: 'Когда привезут шторы?' })).status, 200);
  const log = (await a('GET', '/api/state')).data.bot.log;
  const q = log.find((x) => x.text.includes('шторы'));
  assert.ok(q && q.lvl === 'q');
  assert.equal((await a('POST', `/api/bot/log/${q.id}/teach`, { answer: 'Смотрю дату поставки у комплектатора и отвечаю' })).status, 200);
  const s2 = (await a('GET', '/api/state')).data;
  assert.ok(s2.bot.log.find((x) => x.id === q.id).done);
  assert.ok(s2.bot.train.some((t) => t.ans.startsWith('Смотрю дату')));
});

test('статус «на объекте» и отчёт в график', async () => {
  const e = await as('erlan'); const d = await as('director');
  assert.equal((await e('PATCH', '/api/me', { away: true })).data.user.away, true);
  const s = (await d('GET', '/api/state')).data;
  assert.ok(s.users.find((u) => u.name.startsWith('Ерлан')).away);
  const p1 = s.projects.find((p) => p.name.includes('Esentai'));
  assert.ok(p1.members.find((m) => m.name.startsWith('Ерлан')).away);
  assert.equal((await d('PATCH', '/api/me', { away: true })).status, 400);
  const u = await e('POST', `/api/projects/${p1.id}/updates`, { pct: 60, text: 'Покраска закончена' });
  assert.equal(u.status, 200); assert.equal(u.data.update.stage, p1.stage);
});
