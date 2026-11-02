'use strict';
/**
 * Рабочие данные студии: задачи, заявки, лента объекта, бот, график
 * и /api/state — всё, что нужно интерфейсу при загрузке, одним запросом с учётом прав.
 */
const { HttpError, readJson } = require('./http');
const { tx } = require('./db');
const P = require('./perms');

const LEAD_ST = ['cold', 'warm', 'hot', 'deal'];
const LEAD_NAMES = { cold: 'Холодные', warm: 'Тёплые', hot: 'Горячие', deal: 'Договор' };
const BOT_LVL = ['info', 'warn', 'bad', 'acc', 'q'];
const BOT_DEFAULTS = { tg: true, wa: false, answer: true, leads: true, poll: true, draw: true, remind: true, pollAt: '18:00', remindH: 4, escH: 24 };
const BOT_BOOL = ['tg', 'wa', 'answer', 'leads', 'poll', 'draw', 'remind'];

function today() { return new Date().toISOString().slice(0, 10); }

function register(r, h) {
  const { db, audit, need, needStaffOrUp, needPerm, getProject, str, dateStr, projectView, fileView } = h;
  const isMgr = (u) => u.role === 'admin' || u.role === 'director';
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);

  /* ---------- виды ---------- */
  const taskView = (t) => ({ id: t.id, projectId: t.project_id, text: t.text, assigneeId: t.assignee_id, due: t.due, done: !!t.done, createdBy: t.created_by, createdAt: t.created_at });
  const leadView = (l) => ({ id: l.id, name: l.name, obj: l.obj, area: l.area, src: l.src, status: l.status, next: l.next, note: l.note, createdAt: l.created_at });
  const feedView = (f) => ({ id: f.id, projectId: f.project_id, date: f.date, text: f.text, public: !!f.public });
  const botLogView = (b) => ({ id: b.id, date: b.date, lvl: b.lvl, projectId: b.project_id, text: b.text, done: !!b.done });
  const updView = (u) => ({ id: u.id, date: u.date, projectId: u.project_id, userId: u.user_id, stage: u.stage, pct: u.pct, src: u.src, text: u.text });
  function botCfg() { const row = one("SELECT value FROM kv WHERE key = 'botcfg'"); let c = {}; try { c = row ? JSON.parse(row.value) : {}; } catch { c = {}; } return Object.assign({}, BOT_DEFAULTS, c); }
  function inList(ids) { return ids.length ? `(${ids.map(() => '?').join(',')})` : '(NULL)'; }

  /* ---------- начальное состояние ---------- */
  r.get('/api/state', (ctx) => {
    const u = need(ctx);
    const pids = P.visibleProjectIds(db, u);
    const projects = pids.length ? all(`SELECT * FROM projects WHERE id IN ${inList(pids)} ORDER BY created_at DESC, id DESC`, ...pids) : [];
    const client = u.role === 'client';
    const team = P.can(db, u, 'team');
    const me = Object.assign(P.publicUser(db, u), { away: !!u.away });

    // Люди: сотрудникам — все активные (имена, должности, статус «на объекте»); заказчику — только команда его объектов.
    let userRows;
    if (client) {
      const ids = new Set([u.id]);
      projects.forEach((p) => { if (p.lead_id) ids.add(p.lead_id); all('SELECT user_id FROM project_members WHERE project_id = ?', p.id).forEach((m) => ids.add(m.user_id)); });
      const list = [...ids];
      userRows = all(`SELECT * FROM users WHERE id IN ${inList(list)}`, ...list);
    } else {
      userRows = all(team ? 'SELECT * FROM users ORDER BY name' : 'SELECT * FROM users WHERE active = 1 ORDER BY name');
    }
    const users = userRows.map((x) => {
      const pos = P.positionOf(db, x);
      const v = { id: x.id, name: x.name, role: x.role, position: pos ? { id: pos.id, name: pos.name } : null, stages: x.role === 'staff' && pos ? pos.stages : [], away: !!x.away };
      if (team) {
        v.login = x.login; v.active = !!x.active; v.phone = x.phone || null;
        v.allProjects = x.role === 'admin' || x.role === 'director' || (x.role === 'staff' && P.can(db, x, 'projAll'));
        v.projects = all('SELECT project_id FROM project_members WHERE user_id = ? UNION SELECT id FROM projects WHERE client_id = ?', x.id, x.id).map((m) => m.project_id);
      }
      return v;
    });

    const out = {
      today: today(), me, users,
      projects: projects.map((p) => projectView(p, u)),
      positions: client ? [] : all('SELECT * FROM positions ORDER BY id').map(P.parsePosition),
      tasks: client ? [] : all(`SELECT * FROM tasks WHERE project_id IN ${inList(pids)} ORDER BY due IS NULL, due, id`, ...pids).map(taskView),
      feed: all(`SELECT * FROM feed WHERE project_id IN ${inList(pids)} ${client ? 'AND public = 1' : ''} ORDER BY date DESC, id DESC LIMIT 500`, ...pids).map(feedView),
      files: (client || P.can(db, u, 'storage')) ? all(`SELECT * FROM files WHERE project_id IN ${inList(pids)} ${client ? 'AND public = 1' : ''} ORDER BY created_at DESC, id DESC`, ...pids).map(fileView) : [],
      leads: P.can(db, u, 'crm') ? all('SELECT * FROM leads ORDER BY created_at DESC, id DESC').map(leadView) : [],
      bot: {}
    };
    if (isMgr(u) || P.can(db, u, 'bot')) out.bot.log = all('SELECT * FROM bot_log ORDER BY done, date DESC, id DESC LIMIT 300').map(botLogView);
    if (P.can(db, u, 'bot')) { out.bot.cfg = botCfg(); out.bot.train = all('SELECT * FROM bot_train ORDER BY id').map((t) => ({ id: t.id, sit: t.sit, ans: t.ans })); }
    if (P.can(db, u, 'gantt')) out.bot.updates = all(`SELECT * FROM bot_updates WHERE project_id IN ${inList(pids)} ORDER BY date DESC, id DESC LIMIT 500`, ...pids).map(updView);
    return out;
  });

  /* ---------- мой статус ---------- */
  r.patch('/api/me', async (ctx) => {
    const u = need(ctx); const b = await readJson(ctx.req);
    if (b.away !== undefined) {
      if (u.role !== 'staff') throw new HttpError(400, 'Статус «на объекте» — для сотрудников', 'validation');
      db.prepare('UPDATE users SET away = ? WHERE id = ?').run(b.away ? 1 : 0, u.id); u.away = b.away ? 1 : 0;
      audit(ctx, 'Статус', b.away ? 'Уехал на объект' : 'Вернулся в офис');
    }
    return { user: Object.assign(P.publicUser(db, u), { away: !!u.away }) };
  });

  /* ---------- задачи ---------- */
  function isMember(pid, uid) { return !!one('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? UNION SELECT 1 FROM projects WHERE id = ? AND lead_id = ?', pid, uid, pid, uid); }
  function taskFor(ctx, id) {
    const t = one('SELECT * FROM tasks WHERE id = ?', Number(id));
    if (!t || ctx.user.role === 'client' || !P.canSeeProject(db, ctx.user, t.project_id)) throw new HttpError(404, 'Задача не найдена', 'not_found');
    return t;
  }
  r.post('/api/projects/:id/tasks', async (ctx) => {
    const u = needPerm(ctx, 'tasks'); const p = getProject(ctx, ctx.params.id); const b = await readJson(ctx.req);
    const text = str(b.text, 500, 'Что сделать', true);
    const who = b.assigneeId ? Number(b.assigneeId) : null;
    if (who && !isMember(p.id, who)) throw new HttpError(400, 'Исполнитель должен быть в команде проекта', 'validation');
    const id = db.prepare('INSERT INTO tasks(project_id,text,assignee_id,due,created_by) VALUES(?,?,?,?,?)').run(p.id, text, who, dateStr(b.due, 'Срок'), u.id).lastInsertRowid;
    const wn = who && one('SELECT name FROM users WHERE id = ?', who);
    audit(ctx, 'Задачи', `«${text}» → ${wn ? wn.name : 'без исполнителя'} · ${p.name}`);
    return { task: taskView(one('SELECT * FROM tasks WHERE id = ?', id)) };
  });
  r.patch('/api/tasks/:id', async (ctx) => {
    const u = need(ctx); const t = taskFor(ctx, ctx.params.id); const b = await readJson(ctx.req);
    const manage = P.can(db, u, 'tasks'); const set = {};
    if (b.done !== undefined) { if (!(manage || t.assignee_id === u.id)) throw new HttpError(403, 'Отметить задачу может исполнитель или тот, кто ставит задачи', 'forbidden'); set.done = b.done ? 1 : 0; }
    if (b.text !== undefined || b.due !== undefined || b.assigneeId !== undefined) {
      if (!manage) throw new HttpError(403, 'Недостаточно прав: Ставит задачи', 'forbidden');
      if (b.text !== undefined) set.text = str(b.text, 500, 'Что сделать', true);
      if (b.due !== undefined) set.due = dateStr(b.due, 'Срок');
      if (b.assigneeId !== undefined) { const w = b.assigneeId ? Number(b.assigneeId) : null; if (w && !isMember(t.project_id, w)) throw new HttpError(400, 'Исполнитель должен быть в команде проекта', 'validation'); set.assignee_id = w; }
    }
    const keys = Object.keys(set);
    if (keys.length) {
      db.prepare(`UPDATE tasks SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map((k) => set[k]), t.id);
      audit(ctx, 'Задачи', set.done !== undefined ? (set.done ? 'Выполнено: ' : 'Снова открыто: ') + t.text : `Изменена задача «${t.text}»`);
    }
    return { task: taskView(one('SELECT * FROM tasks WHERE id = ?', t.id)) };
  });
  r.delete('/api/tasks/:id', (ctx) => {
    needPerm(ctx, 'tasks'); const t = taskFor(ctx, ctx.params.id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(t.id); audit(ctx, 'Задачи', `Удалена задача «${t.text}»`);
    return { ok: true };
  });

  /* ---------- заявки ---------- */
  function leadFields(b, partial) {
    const v = {};
    if (!partial || b.name !== undefined) v.name = str(b.name, 120, 'Имя', true);
    if (b.obj !== undefined) v.obj = str(b.obj, 300, 'Объект');
    if (b.area !== undefined) v.area = b.area ? Number(b.area) || null : null;
    if (b.src !== undefined) v.src = str(b.src, 60, 'Источник');
    if (b.note !== undefined) v.note = str(b.note, 1000, 'Заметка');
    if (b.next !== undefined) v.next = dateStr(b.next, 'Следующий контакт');
    if (b.status !== undefined) { if (!LEAD_ST.includes(b.status)) throw new HttpError(400, 'Неизвестная колонка воронки', 'validation'); v.status = b.status; }
    return v;
  }
  r.post('/api/leads', async (ctx) => {
    needPerm(ctx, 'crm'); const v = leadFields(await readJson(ctx.req), false);
    if (!v.status) v.status = 'cold'; if (v.next === undefined) v.next = today();
    const keys = Object.keys(v);
    const id = db.prepare(`INSERT INTO leads(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map((k) => v[k])).lastInsertRowid;
    audit(ctx, 'Заявки', `Новая заявка: ${v.name}`);
    return { lead: leadView(one('SELECT * FROM leads WHERE id = ?', id)) };
  });
  r.patch('/api/leads/:id', async (ctx) => {
    needPerm(ctx, 'crm'); const l = one('SELECT * FROM leads WHERE id = ?', Number(ctx.params.id)); if (!l) throw new HttpError(404, 'Заявка не найдена', 'not_found');
    const v = leadFields(await readJson(ctx.req), true); const keys = Object.keys(v);
    if (keys.length) {
      db.prepare(`UPDATE leads SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map((k) => v[k]), l.id);
      audit(ctx, 'Заявки', v.status && v.status !== l.status ? `${l.name} → ${LEAD_NAMES[v.status]}` : `Изменена заявка ${l.name}`);
    }
    return { lead: leadView(one('SELECT * FROM leads WHERE id = ?', l.id)) };
  });
  r.delete('/api/leads/:id', (ctx) => {
    needPerm(ctx, 'crm'); const l = one('SELECT * FROM leads WHERE id = ?', Number(ctx.params.id)); if (!l) throw new HttpError(404, 'Заявка не найдена', 'not_found');
    db.prepare('DELETE FROM leads WHERE id = ?').run(l.id); audit(ctx, 'Заявки', `Удалена заявка ${l.name}`);
    return { ok: true };
  });

  /* ---------- лента объекта и вопросы заказчика ---------- */
  r.post('/api/projects/:id/feed', async (ctx) => {
    const u = need(ctx); const p = getProject(ctx, ctx.params.id);
    if (!(isMgr(u) || P.can(db, u, 'stage'))) throw new HttpError(403, 'Недостаточно прав: Ведёт стадии', 'forbidden');
    const b = await readJson(ctx.req); const text = str(b.text, 1000, 'Что сделано', true);
    const pub = b.public && (isMgr(u) || P.can(db, u, 'pub')) ? 1 : 0;
    const id = db.prepare('INSERT INTO feed(project_id,date,text,public,created_by) VALUES(?,?,?,?,?)').run(p.id, dateStr(b.date, 'Дата') || today(), text, pub, u.id).lastInsertRowid;
    audit(ctx, 'Проекты', `«${p.name}»: в ленту — ${text}`);
    return { item: feedView(one('SELECT * FROM feed WHERE id = ?', id)) };
  });
  r.post('/api/projects/:id/question', async (ctx) => {
    const u = need(ctx); const p = getProject(ctx, ctx.params.id); const b = await readJson(ctx.req);
    const text = str(b.text, 1000, 'Вопрос', true);
    db.prepare("INSERT INTO bot_log(date,lvl,project_id,text) VALUES(?,'q',?,?)").run(today(), p.id, `${u.role === 'client' ? 'Заказчик' : 'Сотрудник'} ${u.name} спрашивает: «${text}»`);
    audit(ctx, 'Вопросы', `«${p.name}»: ${text}`);
    return { ok: true };
  });

  /* ---------- бот ---------- */
  r.put('/api/bot/config', async (ctx) => {
    needPerm(ctx, 'bot'); const b = await readJson(ctx.req); const c = botCfg();
    BOT_BOOL.forEach((k) => { if (b[k] !== undefined) c[k] = !!b[k]; });
    if (b.pollAt !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.pollAt))) throw new HttpError(400, 'Время опроса — ЧЧ:ММ', 'validation'); c.pollAt = String(b.pollAt); }
    if (b.remindH !== undefined) c.remindH = Math.max(1, Math.min(72, Math.round(Number(b.remindH)) || 1));
    if (b.escH !== undefined) c.escH = Math.max(1, Math.min(168, Math.round(Number(b.escH)) || 1));
    db.prepare("INSERT INTO kv(key,value) VALUES('botcfg',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(c));
    audit(ctx, 'Бот', 'Изменены настройки бота');
    return { cfg: c };
  });
  r.post('/api/bot/train', async (ctx) => {
    needPerm(ctx, 'bot'); const b = await readJson(ctx.req);
    const id = db.prepare('INSERT INTO bot_train(sit,ans) VALUES(?,?)').run(str(b.sit, 500, 'Ситуация', true), str(b.ans, 1000, 'Как поступать', true)).lastInsertRowid;
    audit(ctx, 'Бот', 'Добавлен пример для обучения');
    return { item: one('SELECT * FROM bot_train WHERE id = ?', id) };
  });
  r.delete('/api/bot/train/:id', (ctx) => {
    needPerm(ctx, 'bot'); db.prepare('DELETE FROM bot_train WHERE id = ?').run(Number(ctx.params.id)); audit(ctx, 'Бот', 'Удалён пример обучения');
    return { ok: true };
  });
  function logFor(id) { const b = one('SELECT * FROM bot_log WHERE id = ?', Number(id)); if (!b) throw new HttpError(404, 'Запись бота не найдена', 'not_found'); return b; }
  r.patch('/api/bot/log/:id', async (ctx) => {
    needPerm(ctx, 'bot'); const it = logFor(ctx.params.id); const b = await readJson(ctx.req);
    if (b.done !== undefined) db.prepare('UPDATE bot_log SET done = ? WHERE id = ?').run(b.done ? 1 : 0, it.id);
    return { item: botLogView(one('SELECT * FROM bot_log WHERE id = ?', it.id)) };
  });
  r.post('/api/bot/log/:id/teach', async (ctx) => {
    needPerm(ctx, 'bot'); const it = logFor(ctx.params.id); const b = await readJson(ctx.req);
    const ans = str(b.answer, 1000, 'Как поступать', true);
    tx(db, () => { db.prepare('INSERT INTO bot_train(sit,ans) VALUES(?,?)').run(it.text.slice(0, 500), ans); db.prepare('UPDATE bot_log SET done = 1 WHERE id = ?').run(it.id); });
    audit(ctx, 'Бот', 'Бот научен на вопросе: ' + it.text.slice(0, 120));
    return { ok: true };
  });
  r.post('/api/bot/log', async (ctx) => {
    // запись от имени бота (пока — администратор вручную или будущий служебный ключ)
    needPerm(ctx, 'bot'); const b = await readJson(ctx.req);
    if (!BOT_LVL.includes(b.lvl)) throw new HttpError(400, 'Неизвестный тип записи', 'validation');
    const pid = b.projectId ? Number(b.projectId) : null; if (pid) getProject(ctx, pid);
    const id = db.prepare('INSERT INTO bot_log(date,lvl,project_id,text) VALUES(?,?,?,?)').run(today(), b.lvl, pid, str(b.text, 1000, 'Текст', true)).lastInsertRowid;
    return { item: botLogView(one('SELECT * FROM bot_log WHERE id = ?', id)) };
  });

  /* ---------- отчёты в график ---------- */
  // Сейчас отчёт отправляет сам сотрудник; когда подключим бота, он будет присылать ответы сюда же.
  r.post('/api/projects/:id/updates', async (ctx) => {
    const u = needStaffOrUp(ctx); const p = getProject(ctx, ctx.params.id); const b = await readJson(ctx.req);
    const stage = b.stage === undefined ? p.stage : Number(b.stage); const pct = Math.round(Number(b.pct));
    if (!Number.isInteger(stage) || stage < 0 || stage > 5) throw new HttpError(400, 'Стадия — от 0 до 5', 'validation');
    if (!(pct >= 0 && pct <= 100)) throw new HttpError(400, 'Готовность — от 0 до 100', 'validation');
    const id = db.prepare('INSERT INTO bot_updates(date,project_id,user_id,stage,pct,src,text) VALUES(?,?,?,?,?,?,?)')
      .run(today(), p.id, u.id, stage, pct, str(b.src, 30, 'Источник') || 'Кабинет', str(b.text, 1000, 'Что сделано', true)).lastInsertRowid;
    audit(ctx, 'График', `«${p.name}»: отчёт ${P.STAGES[stage]} ${pct}%`);
    return { update: updView(one('SELECT * FROM bot_updates WHERE id = ?', id)) };
  });
}

module.exports = { register, BOT_DEFAULTS };
