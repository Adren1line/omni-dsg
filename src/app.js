'use strict';
/**
 * Omni DSG — API платформы студии. Этап 1: вход, роли, должности, проекты, файлы, журнал.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { open, tx } = require('./db');
const { HttpError, createRouter, send, readJson, parseCookies, clientIp } = require('./http');
const A = require('./auth');
const P = require('./perms');
const { createDiskStorage } = require('./storage');

function createApp(cfg) {
  const config = Object.assign({ dataDir: './data', cookieSecure: false, trustProxy: false, maxUploadMb: 200, publicDir: path.join(__dirname, '..', 'public'), log: console }, cfg);
  const db = open(config.dataDir);
  const storage = createDiskStorage(path.join(config.dataDir, 'files'));
  const limiter = A.createLimiter(5, 15 * 60e3);
  const r = createRouter();

  /* ---------- помощники ---------- */
  function audit(ctx, kind, text) {
    db.prepare('INSERT INTO audit(user_id,kind,text,ip) VALUES(?,?,?,?)').run(ctx.user ? ctx.user.id : null, kind, String(text).slice(0, 1000), ctx.ip || null);
  }
  function need(ctx) { if (!ctx.user) throw new HttpError(401, 'Войдите в систему', 'unauthorized'); return ctx.user; }
  function needStaffOrUp(ctx) { const u = need(ctx); if (u.role === 'client') throw new HttpError(403, 'Недостаточно прав', 'forbidden'); return u; }
  function needPerm(ctx, perm) { const u = need(ctx); if (!P.can(db, u, perm)) throw new HttpError(403, 'Недостаточно прав: ' + (P.PERMS[perm] || perm), 'forbidden'); return u; }
  function needManager(ctx) { const u = need(ctx); if (u.role !== 'admin' && u.role !== 'director') throw new HttpError(403, 'Только администратор или директор', 'forbidden'); return u; }
  function needAdmin(ctx) { const u = need(ctx); if (u.role !== 'admin') throw new HttpError(403, 'Только администратор', 'forbidden'); return u; }
  function getProject(ctx, id) {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(id));
    if (!p || !P.canSeeProject(db, ctx.user, p.id)) throw new HttpError(404, 'Проект не найден', 'not_found');
    return p;
  }
  function str(v, max, field, required) {
    if (v == null || v === '') { if (required) throw new HttpError(400, `Заполните поле «${field}»`, 'validation'); return null; }
    v = String(v).trim();
    if (required && !v) throw new HttpError(400, `Заполните поле «${field}»`, 'validation');
    if (v.length > max) throw new HttpError(400, `Поле «${field}» длиннее ${max} символов`, 'validation');
    return v;
  }
  function userExists(id) { return id == null || !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(Number(id)); }
  function projectView(p) {
    const members = db.prepare('SELECT u.id, u.name, u.role, u.position_id FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY u.name').all(p.id)
      .map((u) => { const pos = P.positionOf(db, u); return { id: u.id, name: u.name, role: u.role, position: pos ? pos.name : null, stages: u.role === 'staff' && pos ? pos.stages : [] }; });
    const name = (id) => { const u = id && db.prepare('SELECT id, name FROM users WHERE id = ?').get(id); return u ? { id: u.id, name: u.name } : null; };
    return { id: p.id, name: p.name, address: p.address, area: p.area, stage: p.stage, stageName: P.STAGES[p.stage], stagePct: p.stage_pct, due: p.due, lead: name(p.lead_id), client: name(p.client_id), members, createdAt: p.created_at };
  }
  function fileView(f) {
    return { id: f.id, projectId: f.project_id, name: f.name, size: f.size, mime: f.mime, sha256: f.sha256, public: !!f.public, uploadedBy: f.uploaded_by, createdAt: f.created_at };
  }

  /* ---------- служебное ---------- */
  r.get('/api/health', () => ({ ok: true }));
  r.get('/api/meta', (ctx) => { need(ctx); return { perms: P.PERMS, kontur: P.KONTUR, stages: P.STAGES, roles: { admin: 'Администратор', director: 'Директор', staff: 'Сотрудник', client: 'Заказчик' } }; });

  /* ---------- вход ---------- */
  r.post('/api/auth/login', async (ctx) => {
    const b = await readJson(ctx.req);
    const login = String(b.login || '').trim().toLowerCase();
    const key = login + '|' + ctx.ip;
    if (limiter.blocked(key)) throw new HttpError(429, 'Слишком много попыток. Попробуйте через 15 минут', 'rate_limited');
    const u = login && db.prepare('SELECT * FROM users WHERE login = ?').get(login);
    const ok = u ? await A.verifyPassword(String(b.password || ''), u.pass_hash) : await A.dummyVerify(String(b.password || ''));
    if (!ok || !u.active) {
      limiter.fail(key);
      audit({ ip: ctx.ip, user: null }, 'Вход', `Неудачная попытка входа: ${login.slice(0, 60)}`);
      throw new HttpError(401, 'Неверный логин или пароль', 'bad_credentials');
    }
    limiter.reset(key);
    const token = A.createSession(db, u.id, { ip: ctx.ip, ua: ctx.req.headers['user-agent'] });
    ctx.setCookie = A.cookieHeader(token, config.cookieSecure);
    ctx.user = u;
    audit(ctx, 'Вход', 'Вошёл в систему');
    return { user: P.publicUser(db, u) };
  });
  r.post('/api/auth/logout', (ctx) => {
    if (ctx.user) audit(ctx, 'Вход', 'Вышел из системы');
    A.destroySession(db, ctx.token);
    ctx.setCookie = A.cookieHeader('', config.cookieSecure, 0);
    return { ok: true };
  });
  r.get('/api/me', (ctx) => ({ user: P.publicUser(db, need(ctx)) }));
  r.post('/api/me/password', async (ctx) => {
    const u = need(ctx); const b = await readJson(ctx.req);
    if (!(await A.verifyPassword(String(b.current || ''), u.pass_hash))) throw new HttpError(400, 'Текущий пароль неверный', 'bad_password');
    const err = A.checkPasswordPolicy(b.next); if (err) throw new HttpError(400, err, 'weak_password');
    const hash = await A.hashPassword(b.next);
    tx(db, () => {
      db.prepare('UPDATE users SET pass_hash = ?, must_change = 0 WHERE id = ?').run(hash, u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(u.id, require('node:crypto').createHash('sha256').update(String(ctx.token)).digest('hex'));
    });
    audit(ctx, 'Безопасность', 'Сменил пароль');
    return { ok: true };
  });

  /* ---------- должности ---------- */
  function validatePosition(b, partial) {
    const out = {};
    if (!partial || b.name !== undefined) out.name = str(b.name, 80, 'Название', true);
    if (!partial || b.kontur !== undefined) { if (!P.KONTUR.includes(b.kontur || 'view')) throw new HttpError(400, 'Неизвестный уровень доступа к Контуру', 'validation'); out.kontur = b.kontur || 'view'; }
    if (!partial || b.stages !== undefined) {
      const st = Array.isArray(b.stages) ? [...new Set(b.stages.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 5).sort() : [];
      out.stages = JSON.stringify(st);
    }
    if (!partial || b.perms !== undefined) {
      const pm = {}; (Array.isArray(b.perms) ? b.perms : Object.keys(b.perms || {}).filter((k) => b.perms[k])).forEach((k) => { if (P.PERMS[k]) pm[k] = true; });
      out.perms = JSON.stringify(pm);
    }
    return out;
  }
  r.get('/api/positions', (ctx) => { needStaffOrUp(ctx); return { positions: db.prepare('SELECT p.*, (SELECT COUNT(*) FROM users u WHERE u.position_id = p.id) AS people FROM positions p ORDER BY p.id').all().map((row) => Object.assign(P.parsePosition(row), { people: row.people })) }; });
  r.post('/api/positions', async (ctx) => {
    needPerm(ctx, 'team'); const v = validatePosition(await readJson(ctx.req), false);
    try { const info = db.prepare('INSERT INTO positions(name,kontur,stages,perms) VALUES(?,?,?,?)').run(v.name, v.kontur, v.stages, v.perms); audit(ctx, 'Команда', `Создана должность «${v.name}»`); return { position: P.parsePosition(db.prepare('SELECT * FROM positions WHERE id = ?').get(info.lastInsertRowid)) }; }
    catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Должность с таким названием уже есть', 'exists'); throw e; }
  });
  r.patch('/api/positions/:id', async (ctx) => {
    needPerm(ctx, 'team'); const id = Number(ctx.params.id);
    const cur = db.prepare('SELECT * FROM positions WHERE id = ?').get(id); if (!cur) throw new HttpError(404, 'Должность не найдена', 'not_found');
    const v = validatePosition(await readJson(ctx.req), true); const keys = Object.keys(v);
    if (keys.length) {
      try { db.prepare(`UPDATE positions SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map((k) => v[k]), id); }
      catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Должность с таким названием уже есть', 'exists'); throw e; }
      audit(ctx, 'Команда', `Изменена должность «${cur.name}»: ${keys.join(', ')}`);
    }
    return { position: P.parsePosition(db.prepare('SELECT * FROM positions WHERE id = ?').get(id)) };
  });
  r.delete('/api/positions/:id', (ctx) => {
    needPerm(ctx, 'team'); const id = Number(ctx.params.id);
    const cur = db.prepare('SELECT * FROM positions WHERE id = ?').get(id); if (!cur) throw new HttpError(404, 'Должность не найдена', 'not_found');
    const n = db.prepare('SELECT COUNT(*) AS n FROM users WHERE position_id = ?').get(id).n;
    if (n) throw new HttpError(409, `На должности ${n} чел. — сначала переназначьте их`, 'in_use');
    db.prepare('DELETE FROM positions WHERE id = ?').run(id); audit(ctx, 'Команда', `Удалена должность «${cur.name}»`);
    return { ok: true };
  });

  /* ---------- пользователи ---------- */
  const ROLES = ['admin', 'director', 'staff', 'client'];
  function activeAdmins(exceptId) { return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(exceptId || 0).n; }
  r.get('/api/users', (ctx) => { needPerm(ctx, 'team'); return { users: db.prepare('SELECT * FROM users ORDER BY name').all().map((u) => Object.assign(P.publicUser(db, u), { projects: db.prepare('SELECT project_id FROM project_members WHERE user_id = ?').all(u.id).map((x) => x.project_id) })) }; });
  r.post('/api/users', async (ctx) => {
    needPerm(ctx, 'team'); const b = await readJson(ctx.req);
    const login = str(b.login, 60, 'Логин', true).toLowerCase();
    if (!/^[a-z0-9._-]{3,60}$/.test(login)) throw new HttpError(400, 'Логин: латиница, цифры, точка, дефис, от 3 символов', 'validation');
    const name = str(b.name, 120, 'Имя', true);
    const role = ROLES.includes(b.role) ? b.role : 'staff';
    if (role === 'admin' && ctx.user.role !== 'admin') throw new HttpError(403, 'Администратора может создать только администратор', 'forbidden');
    const positionId = role === 'staff' && b.positionId ? Number(b.positionId) : null;
    if (positionId && !db.prepare('SELECT 1 FROM positions WHERE id = ?').get(positionId)) throw new HttpError(400, 'Должность не найдена', 'validation');
    let password = b.password, temp = false;
    if (password) { const err = A.checkPasswordPolicy(password); if (err) throw new HttpError(400, err, 'weak_password'); }
    else { password = A.tempPassword(); temp = true; }
    const hash = await A.hashPassword(password);
    let id;
    try { id = db.prepare('INSERT INTO users(login,name,pass_hash,role,position_id,phone,must_change) VALUES(?,?,?,?,?,?,?)').run(login, name, hash, role, positionId, str(b.phone, 40, 'Телефон'), 1).lastInsertRowid; }
    catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Такой логин уже есть', 'exists'); throw e; }
    audit(ctx, 'Команда', `Добавлен пользователь ${name} (${login}, ${role})`);
    return { user: P.publicUser(db, db.prepare('SELECT * FROM users WHERE id = ?').get(id)), tempPassword: temp ? password : undefined };
  });
  r.patch('/api/users/:id', async (ctx) => {
    needPerm(ctx, 'team'); const id = Number(ctx.params.id); const b = await readJson(ctx.req);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id); if (!u) throw new HttpError(404, 'Пользователь не найден', 'not_found');
    const set = {};
    if (b.name !== undefined) set.name = str(b.name, 120, 'Имя', true);
    if (b.phone !== undefined) set.phone = str(b.phone, 40, 'Телефон');
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) throw new HttpError(400, 'Неизвестный уровень входа', 'validation');
      if ((b.role === 'admin' || u.role === 'admin') && ctx.user.role !== 'admin') throw new HttpError(403, 'Менять администраторов может только администратор', 'forbidden');
      if (id === ctx.user.id && b.role !== u.role) throw new HttpError(400, 'Нельзя менять уровень входа самому себе', 'self');
      if (u.role === 'admin' && b.role !== 'admin' && !activeAdmins(id)) throw new HttpError(400, 'Нельзя убрать последнего администратора', 'last_admin');
      set.role = b.role; if (b.role !== 'staff') set.position_id = null;
    }
    if (b.positionId !== undefined) {
      const pid = b.positionId ? Number(b.positionId) : null;
      if (pid && !db.prepare('SELECT 1 FROM positions WHERE id = ?').get(pid)) throw new HttpError(400, 'Должность не найдена', 'validation');
      if ((set.role || u.role) === 'staff') set.position_id = pid;
    }
    if (b.active !== undefined) {
      if (id === ctx.user.id && !b.active) throw new HttpError(400, 'Нельзя отключить самого себя', 'self');
      if (u.role === 'admin' && !b.active && !activeAdmins(id)) throw new HttpError(400, 'Нельзя отключить последнего администратора', 'last_admin');
      set.active = b.active ? 1 : 0;
    }
    const keys = Object.keys(set);
    if (keys.length) tx(db, () => {
      db.prepare(`UPDATE users SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map((k) => set[k]), id);
      if (set.active === 0 || set.role) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    });
    if (keys.length) audit(ctx, 'Команда', `Изменён пользователь ${u.name}: ${keys.join(', ')}`);
    return { user: P.publicUser(db, db.prepare('SELECT * FROM users WHERE id = ?').get(id)) };
  });
  r.post('/api/users/:id/reset-password', async (ctx) => {
    needPerm(ctx, 'team'); const id = Number(ctx.params.id);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id); if (!u) throw new HttpError(404, 'Пользователь не найден', 'not_found');
    if (u.role === 'admin' && ctx.user.role !== 'admin') throw new HttpError(403, 'Сбросить пароль администратору может только администратор', 'forbidden');
    const pw = A.tempPassword(); const hash = await A.hashPassword(pw);
    tx(db, () => { db.prepare('UPDATE users SET pass_hash = ?, must_change = 1 WHERE id = ?').run(hash, id); db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id); });
    audit(ctx, 'Безопасность', `Сброшен пароль пользователя ${u.name}`);
    return { tempPassword: pw };
  });

  /* ---------- проекты ---------- */
  r.get('/api/projects', (ctx) => {
    const u = need(ctx); const ids = P.visibleProjectIds(db, u);
    const list = ids.length ? db.prepare(`SELECT * FROM projects WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC`).all(...ids) : [];
    return { projects: list.map(projectView) };
  });
  r.get('/api/projects/:id', (ctx) => { need(ctx); return { project: projectView(getProject(ctx, ctx.params.id)) }; });
  r.post('/api/projects', async (ctx) => {
    needManager(ctx); const b = await readJson(ctx.req);
    const name = str(b.name, 200, 'Название', true);
    if (!userExists(b.leadId) || !userExists(b.clientId)) throw new HttpError(400, 'Ответственный или заказчик не найден', 'validation');
    const id = tx(db, () => {
      const pid = db.prepare('INSERT INTO projects(name,address,area,due,lead_id,client_id) VALUES(?,?,?,?,?,?)')
        .run(name, str(b.address, 300, 'Адрес'), b.area ? Number(b.area) : null, str(b.due, 10, 'Срок'), b.leadId || null, b.clientId || null).lastInsertRowid;
      (Array.isArray(b.members) ? b.members : []).forEach((m) => { if (userExists(m)) db.prepare('INSERT OR IGNORE INTO project_members VALUES(?,?)').run(pid, Number(m)); });
      if (b.leadId) db.prepare('INSERT OR IGNORE INTO project_members VALUES(?,?)').run(pid, Number(b.leadId));
      return pid;
    });
    audit(ctx, 'Проекты', `Создан проект «${name}»`);
    return { project: projectView(db.prepare('SELECT * FROM projects WHERE id = ?').get(id)) };
  });
  r.patch('/api/projects/:id', async (ctx) => {
    const u = need(ctx); const p = getProject(ctx, ctx.params.id); const b = await readJson(ctx.req);
    const set = {}; const mgr = u.role === 'admin' || u.role === 'director';
    const general = ['name', 'address', 'area', 'due', 'leadId', 'clientId'].filter((k) => b[k] !== undefined);
    if (general.length && !mgr) throw new HttpError(403, 'Данные проекта меняет администратор или директор', 'forbidden');
    if (b.name !== undefined) set.name = str(b.name, 200, 'Название', true);
    if (b.address !== undefined) set.address = str(b.address, 300, 'Адрес');
    if (b.area !== undefined) set.area = b.area ? Number(b.area) : null;
    if (b.due !== undefined) set.due = str(b.due, 10, 'Срок');
    if (b.leadId !== undefined) { if (!userExists(b.leadId)) throw new HttpError(400, 'Ответственный не найден', 'validation'); set.lead_id = b.leadId || null; }
    if (b.clientId !== undefined) { if (!userExists(b.clientId)) throw new HttpError(400, 'Заказчик не найден', 'validation'); set.client_id = b.clientId || null; }
    if (b.stage !== undefined || b.stagePct !== undefined) {
      if (!P.can(db, u, 'stage')) throw new HttpError(403, 'Недостаточно прав: Ведёт стадии', 'forbidden');
      if (b.stage !== undefined) { const s = Number(b.stage); if (!Number.isInteger(s) || s < 0 || s > 5) throw new HttpError(400, 'Стадия — от 0 до 5', 'validation'); set.stage = s; }
      if (b.stagePct !== undefined) { const v = Math.round(Number(b.stagePct)); if (!(v >= 0 && v <= 100)) throw new HttpError(400, 'Готовность — от 0 до 100', 'validation'); set.stage_pct = v; }
    }
    const keys = Object.keys(set);
    if (keys.length) {
      db.prepare(`UPDATE projects SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map((k) => set[k]), p.id);
      const desc = set.stage !== undefined || set.stage_pct !== undefined ? `${P.STAGES[set.stage ?? p.stage]} ${set.stage_pct ?? p.stage_pct}%` : keys.join(', ');
      audit(ctx, 'Проекты', `«${p.name}»: ${desc}`);
    }
    return { project: projectView(db.prepare('SELECT * FROM projects WHERE id = ?').get(p.id)) };
  });
  r.put('/api/projects/:id/members', async (ctx) => {
    const u = need(ctx); if (!(u.role === 'admin' || u.role === 'director' || P.can(db, u, 'team'))) throw new HttpError(403, 'Недостаточно прав', 'forbidden');
    const p = getProject(ctx, ctx.params.id); const b = await readJson(ctx.req);
    const ids = (Array.isArray(b.userIds) ? b.userIds : []).map(Number).filter((id) => userExists(id));
    tx(db, () => { db.prepare('DELETE FROM project_members WHERE project_id = ?').run(p.id); ids.forEach((id) => db.prepare('INSERT OR IGNORE INTO project_members VALUES(?,?)').run(p.id, id)); });
    audit(ctx, 'Проекты', `«${p.name}»: состав команды (${ids.length} чел.)`);
    return { project: projectView(db.prepare('SELECT * FROM projects WHERE id = ?').get(p.id)) };
  });

  /* ---------- файлы ---------- */
  function fileFor(ctx, id) {
    const f = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
    if (!f || !P.canSeeProject(db, ctx.user, f.project_id)) throw new HttpError(404, 'Файл не найден', 'not_found');
    if (ctx.user.role === 'client' && !f.public) throw new HttpError(404, 'Файл не найден', 'not_found');
    return f;
  }
  r.get('/api/projects/:id/files', (ctx) => {
    const u = need(ctx); const p = getProject(ctx, ctx.params.id);
    if (u.role !== 'client' && !P.can(db, u, 'storage')) throw new HttpError(403, 'Недостаточно прав: Хранилище', 'forbidden');
    const rows = db.prepare(`SELECT * FROM files WHERE project_id = ? ${u.role === 'client' ? 'AND public = 1' : ''} ORDER BY created_at DESC, id DESC`).all(p.id);
    return { files: rows.map(fileView) };
  });
  r.post('/api/projects/:id/files', async (ctx) => {
    const u = needPerm(ctx, 'storage'); const p = getProject(ctx, ctx.params.id);
    let name = '';
    try { name = decodeURIComponent(String(ctx.req.headers['x-file-name'] || '')); } catch { name = ''; }
    name = path.basename(name.replace(/[\u0000-\u001f\\]/g, '')).trim().slice(0, 200);
    if (!name) throw new HttpError(400, 'Укажите имя файла в заголовке X-File-Name', 'validation');
    const mime = String(ctx.req.headers['content-type'] || 'application/octet-stream').slice(0, 120);
    const declared = Number(ctx.req.headers['content-length'] || 0);
    const max = config.maxUploadMb * 1048576;
    if (declared > max) throw new HttpError(413, `Файл больше ${config.maxUploadMb} МБ`, 'too_large');
    const saved = await storage.put(ctx.req, max);
    const pub = ctx.url.searchParams.get('public') === '1' && P.can(db, u, 'pub') ? 1 : 0;
    const id = db.prepare('INSERT INTO files(project_id,name,size,mime,sha256,storage_key,public,uploaded_by) VALUES(?,?,?,?,?,?,?,?)')
      .run(p.id, name, saved.size, mime, saved.sha256, saved.key, pub, u.id).lastInsertRowid;
    audit(ctx, 'Файлы', `«${p.name}»: загружен ${name} (${Math.round(saved.size / 1024)} КБ)`);
    return { file: fileView(db.prepare('SELECT * FROM files WHERE id = ?').get(id)) };
  });
  r.get('/api/files/:id/download', (ctx) => {
    need(ctx); const f = fileFor(ctx, ctx.params.id);
    if (ctx.user.role !== 'client' && !P.can(db, ctx.user, 'storage')) throw new HttpError(403, 'Недостаточно прав: Хранилище', 'forbidden');
    if (!storage.exists(f.storage_key)) throw new HttpError(410, 'Файл отсутствует в хранилище', 'gone');
    const ascii = f.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    ctx.res.writeHead(200, {
      'Content-Type': f.mime || 'application/octet-stream',
      'Content-Length': f.size,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    storage.stream(f.storage_key).pipe(ctx.res);
    audit(ctx, 'Файлы', `Скачан ${f.name}`);
    return ctx.HANDLED;
  });
  r.patch('/api/files/:id', async (ctx) => {
    const u = needPerm(ctx, 'pub'); const f = fileFor(ctx, ctx.params.id); const b = await readJson(ctx.req);
    if (b.public === undefined) throw new HttpError(400, 'Нечего менять', 'validation');
    db.prepare('UPDATE files SET public = ? WHERE id = ?').run(b.public ? 1 : 0, f.id);
    audit(ctx, 'Файлы', `${f.name}: ${b.public ? 'открыт заказчику' : 'скрыт от заказчика'}`);
    void u;
    return { file: fileView(db.prepare('SELECT * FROM files WHERE id = ?').get(f.id)) };
  });
  r.delete('/api/files/:id', (ctx) => {
    const u = needPerm(ctx, 'storage'); const f = fileFor(ctx, ctx.params.id);
    if (!(u.role === 'admin' || u.role === 'director' || f.uploaded_by === u.id)) throw new HttpError(403, 'Удалить файл может загрузивший его, администратор или директор', 'forbidden');
    db.prepare('DELETE FROM files WHERE id = ?').run(f.id); storage.remove(f.storage_key);
    audit(ctx, 'Файлы', `Удалён ${f.name}`);
    return { ok: true };
  });

  /* ---------- журнал и выгрузка ---------- */
  r.get('/api/audit', (ctx) => {
    needAdmin(ctx); const q = String(ctx.url.searchParams.get('q') || '').trim(); const limit = Math.min(500, Number(ctx.url.searchParams.get('limit')) || 200);
    const rows = q
      ? db.prepare("SELECT a.*, u.name AS who FROM audit a LEFT JOIN users u ON u.id = a.user_id WHERE a.text LIKE ? OR a.kind LIKE ? OR u.name LIKE ? ORDER BY a.id DESC LIMIT ?").all(`%${q}%`, `%${q}%`, `%${q}%`, limit)
      : db.prepare('SELECT a.*, u.name AS who FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?').all(limit);
    return { audit: rows.map((a) => ({ id: a.id, ts: a.ts, who: a.who || '—', kind: a.kind, text: a.text, ip: a.ip })) };
  });
  r.get('/api/admin/export', (ctx) => {
    needAdmin(ctx);
    const withHashes = ctx.url.searchParams.get('hashes') === '1';
    const users = db.prepare('SELECT * FROM users').all().map((u) => { const c = Object.assign({}, u); if (!withHashes) delete c.pass_hash; return c; });
    const dump = {
      app: 'Omni DSG', schema: Number(db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value), exported: new Date().toISOString(), passwordHashes: withHashes,
      positions: db.prepare('SELECT * FROM positions').all(), users,
      projects: db.prepare('SELECT * FROM projects').all(), projectMembers: db.prepare('SELECT * FROM project_members').all(),
      files: db.prepare('SELECT * FROM files').all(), audit: db.prepare('SELECT * FROM audit ORDER BY id').all()
    };
    audit(ctx, 'Данные', `Выгружена копия базы${withHashes ? ' с хешами паролей' : ''}`);
    ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="omni-backup-${dump.exported.slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
    ctx.res.end(JSON.stringify(dump, null, 1));
    return ctx.HANDLED;
  });

  /* ---------- статика (будущий интерфейс) ---------- */
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
  function serveStatic(req, res, pathname) {
    const root = path.resolve(config.publicDir);
    let rel; try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
    let file = path.resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    fs.createReadStream(file).pipe(res);
  }

  /* ---------- обработка запроса ---------- */
  const HANDLED = Symbol('handled');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
    const ctx = { req, res, url, params: {}, ip: clientIp(req, config.trustProxy), HANDLED };
    try {
      // Защита от подделки запросов: изменяющие запросы обязаны прислать свой заголовок (браузер не добавит его с чужого сайта).
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-omni-request'] !== '1') throw new HttpError(403, 'Нет заголовка X-Omni-Request', 'csrf');
      const m = r.match(req.method, url.pathname);
      if (!m) throw new HttpError(404, 'Нет такого адреса API', 'not_found');
      if (m.methodMismatch) throw new HttpError(405, 'Метод не поддерживается', 'method');
      ctx.params = m.params;
      ctx.token = parseCookies(req.headers.cookie)[A.COOKIE] || null;
      ctx.user = A.sessionUser(db, ctx.token);
      let result;
      for (const h of m.route.handlers) result = await h(ctx);
      if (result === HANDLED) return;
      send(res, 200, result, ctx.setCookie ? { 'Set-Cookie': ctx.setCookie } : null);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof HttpError) return send(res, e.status, { error: { code: e.code, message: e.message } }, ctx.setCookie ? { 'Set-Cookie': ctx.setCookie } : null);
      config.log.error('[omni] ошибка', e);
      send(res, 500, { error: { code: 'internal', message: 'Внутренняя ошибка сервера' } });
    }
  });

  // уборка просроченных сессий раз в час
  const sweep = setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600e3);
  sweep.unref();

  return {
    server, db, storage,
    close() { clearInterval(sweep); return new Promise((res) => server.close(() => { db.close(); res(); })); }
  };
}

/** Первый запуск: стандартные должности и администратор. */
async function seed(db, opts) {
  const log = opts.log || console;
  if (!db.prepare('SELECT COUNT(*) AS n FROM positions').get().n) {
    const ins = db.prepare('INSERT INTO positions(name,kontur,stages,perms) VALUES(?,?,?,?)');
    P.DEFAULT_POSITIONS.forEach((p) => ins.run(p.name, p.kontur, JSON.stringify(p.stages), JSON.stringify(Object.fromEntries(p.perms.map((k) => [k, true])))));
  }
  if (!db.prepare('SELECT COUNT(*) AS n FROM users').get().n) {
    const login = (opts.adminLogin || 'admin').toLowerCase();
    let pw = opts.adminPassword, generated = false;
    if (!pw) { pw = A.tempPassword(); generated = true; }
    db.prepare("INSERT INTO users(login,name,pass_hash,role,must_change) VALUES(?,?,?,'admin',1)").run(login, opts.adminName || 'Администратор', await A.hashPassword(pw));
    log.log(`[omni] создан администратор «${login}»` + (generated ? `, временный пароль: ${pw} — смените его после входа` : ''));
  }
}

module.exports = { createApp, seed };
