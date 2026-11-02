'use strict';
/**
 * Демо-наполнение для знакомства с системой: люди, объекты, задачи, заявки, бот.
 * Запускается только явно (DEMO=1 или npm run demo) и только на пустой базе — без проектов.
 * Пароль у всех демо-пользователей одинаковый: demo2026.
 */
const A = require('./auth');
const { tx } = require('./db');

const PASSWORD = 'demo2026';

async function seedDemo(db, log) {
  log = log || console;
  if (db.prepare('SELECT COUNT(*) AS n FROM projects').get().n) { log.log('[omni] демо пропущено: в базе уже есть проекты'); return false; }
  const hash = await A.hashPassword(PASSWORD);
  const pos = {}; db.prepare('SELECT id, name FROM positions').all().forEach((p) => { pos[p.name] = p.id; });
  const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  tx(db, () => {
    const U = {};
    const people = [
      ['director', 'Алия Сарсенова', 'director', null],
      ['timur', 'Тимур Ахметов', 'staff', 'Архитектор'],
      ['dana', 'Дана Ким', 'staff', 'Дизайнер'],
      ['erlan', 'Ерлан Жумабеков', 'staff', 'Прораб'],
      ['sergey', 'Сергей Ли', 'staff', 'Комплектатор'],
      ['aigerim', 'Айгерим Нурланова', 'client', null]
    ];
    const insU = db.prepare('INSERT OR IGNORE INTO users(login,name,pass_hash,role,position_id,must_change) VALUES(?,?,?,?,?,0)');
    people.forEach(([login, name, role, p]) => { insU.run(login, name, hash, role, p ? pos[p] || null : null); U[login] = db.prepare('SELECT id FROM users WHERE login = ?').get(login).id; });

    const insP = db.prepare('INSERT INTO projects(name,address,area,stage,stage_pct,lead_id,client_id,due,budget,paid,kontur_file) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const insM = db.prepare('INSERT OR IGNORE INTO project_members VALUES(?,?)');
    const P = {};
    [
      ['p1', 'Квартира в ЖК «Esentai City»', 'Алматы, пр. Аль-Фараби', 112, 4, 55, 'timur', 'aigerim', day(110), 28500000, 17200000, 'esentai-112.kontur', ['timur', 'dana', 'erlan', 'sergey']],
      ['p2', 'Дом в Таусамалы', 'Алматинская обл., Таусамалы', 240, 2, 40, 'timur', null, day(300), 61000000, 12000000, 'tausamaly-240.kontur', ['timur', 'erlan', 'sergey']],
      ['p3', 'Квартира в ЖК «Hayat»', 'Алматы, ул. Жандосова', 78, 1, 70, 'dana', null, day(195), 14200000, 2500000, 'hayat-78.kontur', ['dana', 'erlan']],
      ['p4', 'Офис IT-компании', 'Алматы, БЦ «Nurly Tau»', 160, 5, 60, 'dana', null, day(18), 22000000, 21000000, 'office-160.kontur', ['dana']]
    ].forEach(([k, name, addr, area, st, sp, lead, cl, due, budget, paid, kf, team]) => {
      P[k] = insP.run(name, addr, area, st, sp, U[lead], cl ? U[cl] : null, due, budget, paid, kf).lastInsertRowid;
      team.forEach((m) => insM.run(P[k], U[m]));
    });

    const insT = db.prepare('INSERT INTO tasks(project_id,text,assignee_id,due,done,created_by) VALUES(?,?,?,?,?,?)');
    [['p1', 'Сдать ведомость отделки по санузлам', 'dana', 1, 0], ['p1', 'Проверить штробы под выключатели в спальне', 'erlan', 0, 0], ['p2', 'Согласовать разрез по лестнице с конструктором', 'timur', 4, 0],
      ['p3', 'Обмерный план — внести колонны', 'dana', -2, 0], ['p1', 'Заказ инсталляций GROHE (2 шт.)', 'erlan', 3, 1], ['p4', 'Акт сдачи и фотоотчёт', 'dana', 14, 0]]
      .forEach(([p, text, who, d, done]) => insT.run(P[p], text, U[who], day(d), done, U.director));

    const insL = db.prepare('INSERT INTO leads(name,obj,area,src,status,next,note) VALUES(?,?,?,?,?,?,?)');
    [['Мадина Оспанова', 'Квартира 95 м², ЖК «Alma City»', 95, 'Instagram', 'cold', 2, 'Спрашивала цену за м²'], ['Руслан Ибраев', 'Дом 300 м², Каменское плато', 300, 'Рекомендация', 'warm', 1, 'Хочет встречу на объекте'],
      ['Жанна Ли', 'Квартира 64 м², новостройка', 64, 'Сайт', 'warm', 5, ''], ['Ербол Касымов', 'Ресторан 220 м²', 220, 'Телеграм-бот', 'hot', 0, 'Ждёт КП до пятницы'], ['Ольга Петрова', 'Квартира 130 м², «Esentai City»', 130, 'Рекомендация', 'deal', 9, 'Договор на подписи']]
      .forEach(([n, o, a, s, st, d, note]) => insL.run(n, o, a, s, st, day(d), note));

    const insF = db.prepare('INSERT INTO feed(project_id,date,text,public) VALUES(?,?,?,?)');
    [[-1, 'Смонтированы инсталляции в обоих санузлах', 1], [-3, 'Закончена штукатурка стен в спальнях', 1], [-4, 'Бригада сантехников: просрочка 2 дня по разводке', 0], [-8, 'Электрика: проложены трассы, щит собран', 1]]
      .forEach(([d, t, pub]) => insF.run(P.p1, day(d), t, pub));

    const insB = db.prepare('INSERT INTO bot_log(date,lvl,project_id,text) VALUES(?,?,?,?)');
    insB.run(day(0), 'warn', P.p1, 'Ерлан: «стяжка в санузле не готова», а на фото позавчера она залита. Расхождение, уточнить?');
    insB.run(day(0), 'acc', null, 'Ербол Касымов (ресторан 220 м²) стал горячим — передан менеджеру');
    insB.run(day(-1), 'bad', P.p3, 'Дана Ким 2 дня не открывает задачу «Обмерный план — внести колонны». Напомнил дважды');
    insB.run(day(-1), 'info', P.p2, 'Дорисовал 3 размера на листе «План полов» и отправил подрядчику в WhatsApp. Пометка в журнале Контура');
    insB.run(day(-2), 'q', P.p1, 'Заказчица спросила, можно ли перенести розетку у кровати. Не знаю, отвечать ли самому — научите?');
    const insTr = db.prepare('INSERT INTO bot_train(sit,ans) VALUES(?,?)');
    insTr.run('Заказчик просит точную смету до обмера', 'Даю вилку по похожим объектам и предлагаю обмер — точная смета после рабочего проекта');
    insTr.run('Подрядчик просит размер, которого нет на листе', 'Беру из модели Контура, дорисовываю размер, помечаю «добавлено ботом», отправляю PDF');
    const insUp = db.prepare('INSERT INTO bot_updates(date,project_id,user_id,stage,pct,src,text) VALUES(?,?,?,?,?,?,?)');
    [[0, 'p1', 'erlan', 4, 55, 'Телеграм', 'Покраска в гостиной, спальня завтра'], [0, 'p2', 'timur', 2, 40, 'WhatsApp', 'АР готов наполовину, жду конструктора по лестнице'],
      [-1, 'p3', 'dana', 1, 70, 'Телеграм', 'Планировка согласована, подбираю материалы'], [-1, 'p4', 'dana', 5, 60, 'Телеграм', 'Финальная уборка, акт в пятницу'],
      [-2, 'p1', 'sergey', 4, 50, 'Телеграм', 'Шторы и карнизы заказаны, поставка через 10 дней'], [-3, 'p2', 'erlan', 2, 35, 'WhatsApp', 'Узел ввода согласовали с УК']]
      .forEach(([d, p, who, st, pct, src, text]) => insUp.run(day(d), P[p], U[who], st, pct, src, text));
  });
  log.log(`[omni] демо-данные загружены. Логины: director, timur, dana, erlan, sergey, aigerim — пароль ${PASSWORD}`);
  return true;
}

module.exports = { seedDemo, PASSWORD };
