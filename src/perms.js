'use strict';
/**
 * Права. Четыре уровня входа: admin, director, staff, client.
 * У сотрудника (staff) права задаёт должность: набор доступов + стадии + доступ к Контуру.
 */
const PERMS = {
  crm: 'Заявки и клиенты',
  projAll: 'Все проекты',
  stage: 'Ведёт стадии',
  tasks: 'Ставит задачи',
  money: 'Бюджет и оплаты',
  storage: 'Хранилище',
  pub: 'Открывает файлы заказчику',
  gantt: 'График',
  bot: 'Бот',
  team: 'Команда'
};
const KONTUR = ['none', 'view', 'notes', 'edit'];
const STAGES = ['Обмер', 'Концепция', 'Рабочий проект', 'Комплектация', 'Стройка', 'Сдача'];

const DEFAULT_POSITIONS = [
  { name: 'Руководитель проекта', kontur: 'edit', stages: [0, 1, 2, 3, 4, 5], perms: ['crm', 'projAll', 'stage', 'tasks', 'money', 'storage', 'pub', 'gantt'] },
  { name: 'Архитектор', kontur: 'edit', stages: [0, 1, 2], perms: ['stage', 'tasks', 'storage', 'pub'] },
  { name: 'Дизайнер', kontur: 'edit', stages: [1, 2, 3], perms: ['stage', 'tasks', 'storage', 'pub'] },
  { name: 'Чертёжник', kontur: 'edit', stages: [2], perms: ['storage'] },
  { name: 'Прораб', kontur: 'notes', stages: [0, 4, 5], perms: ['stage', 'tasks', 'storage'] },
  { name: 'Комплектатор', kontur: 'view', stages: [3, 4], perms: ['storage', 'money'] }
];

function parsePosition(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, kontur: row.kontur, stages: JSON.parse(row.stages || '[]'), perms: JSON.parse(row.perms || '{}') };
}

/** Загружает должность пользователя (кэшируется на время запроса). */
function positionOf(db, user) {
  if (!user || !user.position_id) return null;
  if (user._pos === undefined) user._pos = parsePosition(db.prepare('SELECT * FROM positions WHERE id = ?').get(user.position_id));
  return user._pos;
}

function can(db, user, perm) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'client') return false;
  if (user.role === 'director') return perm !== 'bot' && perm !== 'team';
  const p = positionOf(db, user);
  return !!(p && p.perms[perm]);
}

function konturLevel(db, user) {
  if (user.role === 'admin' || user.role === 'director') return 'edit';
  if (user.role === 'client') return 'none';
  const p = positionOf(db, user);
  return p ? p.kontur : 'view';
}

/** Видит ли пользователь проект. */
function canSeeProject(db, user, projectId) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'director') return true;
  if (user.role === 'staff' && can(db, user, 'projAll')) return true;
  const row = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? UNION SELECT 1 FROM projects WHERE id = ? AND client_id = ?')
    .get(projectId, user.id, projectId, user.id);
  return !!row;
}

function visibleProjectIds(db, user) {
  if (user.role === 'admin' || user.role === 'director' || (user.role === 'staff' && can(db, user, 'projAll'))) {
    return db.prepare('SELECT id FROM projects').all().map((r) => r.id);
  }
  return db.prepare('SELECT project_id AS id FROM project_members WHERE user_id = ? UNION SELECT id FROM projects WHERE client_id = ?')
    .all(user.id, user.id).map((r) => r.id);
}

/** Публичный вид пользователя — без хеша пароля. */
function publicUser(db, u) {
  if (!u) return null;
  const p = positionOf(db, u);
  return {
    id: u.id, login: u.login, name: u.name, role: u.role, phone: u.phone || null, active: !!u.active, mustChangePassword: !!u.must_change,
    position: p ? { id: p.id, name: p.name } : null,
    stages: u.role === 'staff' && p ? p.stages : [],
    kontur: konturLevel(db, u),
    perms: Object.keys(PERMS).filter((k) => can(db, u, k))
  };
}

module.exports = { PERMS, KONTUR, STAGES, DEFAULT_POSITIONS, parsePosition, positionOf, can, konturLevel, canSeeProject, visibleProjectIds, publicUser };
