'use strict';
/* Демо-данные: 12 пользователей, 34 проекта с версиями, галереями и статистикой за 90 дней */
const { LICENSES, LOADERS, TYPES, GAME_VERSIONS, MEMBER_ROLES, slugify, cmpGV, hashStr, rng, dateKey } = require('../public/shared.js');
const { tx } = require('./db.js');
const { hashPassword, newId } = require('./auth.js');

const DAY = 864e5;
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const SEED_USERS = [
  ['nightfox', 'NightFox', 'Пишу оптимизационные моды и иногда шейдеры. Профилировщик — мой лучший друг.'],
  ['ironbeard', 'Ironbeard', 'Технические моды, автоматизация и всё, что крутится и жужжит.'],
  ['mira_dev', 'Мира', 'Интерфейсы, декор и уютные мелочи для выживания.'],
  ['pixelwren', 'PixelWren', 'Рисую текстуры 16×16 с 2013 года.'],
  ['kotofey', 'Котофей', 'Серверные плагины для небольших сообществ. Отвечаю в issues по вечерам.'],
  ['stonecutter', 'Stonecutter Studio', 'Команда из трёх человек: генерация мира и приключения.'],
  ['aurora_lab', 'Aurora Lab', 'Шейдеры и эксперименты со светом.'],
  ['vlad_codes', 'Влад', 'Датапаки и игровые механики без единого мода.'],
  ['sunny_blocks', 'SunnyBlocks', 'Собираю сборки для друзей, а потом выкладываю их сюда.'],
  ['deepslate', 'Deepslate', 'Мобы, биомы и подземелья.'],
];
// [тип, название, описание, категории, загрузчики, автор, клиент, сервер, лицензия, в подборке, возможности]
const SEED_PROJECTS = [
  ['mod', 'Lumen Engine', 'Новый движок рендера: заметно больше кадров в секунду без изменения картинки.', ['optimization'], ['fabric', 'neoforge', 'quilt'], 'nightfox', 'required', 'unsupported', 'LGPL-3.0', true,
    ['Пакетная отрисовка чанков и отсечение невидимой геометрии', 'Работает вместе с шейдерами через Iris', 'Не меняет внешний вид игры', 'Отдельное меню с настройками качества']],
  ['mod', 'Pathfinder Map', 'Миникарта и карта мира с метками, путевыми точками и пещерным режимом.', ['utility', 'adventure'], ['fabric', 'forge', 'neoforge'], 'mira_dev', 'required', 'optional', 'MIT', true,
    ['Миникарта с вращением и масштабом', 'Путевые точки с цветами и группами', 'Пещерный режим и отдельная карта Незера', 'Общие метки на сервере, если мод установлен и там']],
  ['mod', 'Ironworks', 'Технологии на меди: дробилки, плавильни, конвейеры и электросети.', ['technology', 'storage'], ['forge', 'neoforge'], 'ironbeard', 'required', 'required', 'GPL-3.0', true,
    ['Больше 40 машин с понятными интерфейсами', 'Электросеть на медных проводах с потерями на расстоянии', 'Конвейеры, фильтры и сортировщики', 'Книга-справочник с рецептами в игре']],
  ['mod', 'Hearth & Home', 'Сотни предметов мебели и декора в ванильном стиле.', ['decoration'], ['fabric', 'forge', 'neoforge'], 'mira_dev', 'required', 'required', 'MIT', false,
    ['Столы, стулья, шкафы и полки из всех пород дерева', 'Работающая кухня: плита, раковина, холодильник', 'Лампы с регулировкой яркости', 'Рецепты в верстаке и в камнерезе']],
  ['mod', 'Pocket Pantry', 'Расширенная кухня: 60 блюд, грядки, специи и бонусы за разнообразное питание.', ['food', 'game-mechanics'], ['fabric', 'quilt'], 'sunny_blocks', 'required', 'required', 'MIT', false,
    ['60 новых блюд и 12 культур', 'Специи усиливают эффекты еды', 'Бонус к здоровью за разнообразный рацион', 'Совместимость с модами на фермерство']],
  ['mod', 'Deep Veins', 'Рудные жилы, пещерные кристаллы и новые жеоды ниже нулевой высоты.', ['worldgen'], ['fabric', 'forge', 'neoforge'], 'stonecutter', 'required', 'required', 'Apache-2.0', false,
    ['Длинные рудные жилы вместо одиночных блоков', 'Кристаллические пещеры с подсветкой', 'Настраиваемая частота генерации', 'Подходит для существующих миров: меняются только новые чанки']],
  ['mod', 'Skyward Isles', 'Парящие острова с собственными биомами, подземельями и погодой.', ['worldgen', 'adventure'], ['fabric', 'neoforge'], 'stonecutter', 'required', 'required', 'ARR', true,
    ['Новое измерение из парящих островов', '8 биомов и 3 вида подземелий', 'Ветер, который сносит стрелы и элитры', 'Босс — Хранитель облаков']],
  ['mod', 'Arcane Glyphs', 'Магия через руны: собирайте заклинания из символов и усилителей.', ['magic', 'equipment'], ['forge', 'neoforge'], 'deepslate', 'required', 'required', 'LGPL-3.0', false,
    ['32 руны, которые сочетаются друг с другом', 'Посохи и мантии с ячейками под усилители', 'Мана восстанавливается у источников в мире', 'Подробный гримуар в игре']],
  ['mod', 'Frostbound Fauna', 'Мобы холодных биомов: песцы, снежные совы, мамонты и ледяные големы.', ['mobs'], ['fabric', 'forge'], 'deepslate', 'required', 'required', 'MIT', false,
    ['9 новых мобов с анимациями', 'Мамонтов можно приручить и навьючить', 'Снежные совы доставляют предметы', 'Ледяной голем охраняет деревни в тайге']],
  ['mod', 'Quick Stack', 'Сортировка инвентаря и раскладка по ближайшим сундукам одной клавишей.', ['utility', 'storage'], ['fabric', 'forge', 'neoforge', 'quilt'], 'nightfox', 'required', 'optional', 'MIT', false,
    ['Сортировка по типу, имени или количеству', 'Раскладка по сундукам в радиусе 8 блоков', 'Блокировка слотов от сортировки', 'Работает на любом сервере, если включён клиентский режим']],
  ['mod', 'Copper Rails', 'Скоростные медные рельсы, стрелки, станции и вагоны для жидкостей.', ['transportation', 'technology'], ['fabric', 'neoforge'], 'ironbeard', 'required', 'required', 'MIT', false,
    ['Рельсы с разгоном до 3× от ванильных', 'Стрелки и станции с расписанием', 'Вагоны-цистерны и вагоны для животных', 'Окисление снижает скорость, воск защищает']],
  ['mod', 'Kernel Lib', 'Общая библиотека для модов NightFox: настройки, сетевые пакеты и утилиты рендера.', ['library'], ['fabric', 'forge', 'neoforge', 'quilt'], 'nightfox', 'required', 'required', 'MIT', false,
    ['Единый экран настроек для всех модов автора', 'Простая отправка сетевых пакетов', 'Ничего не делает сама по себе']],
  ['mod', 'Echo Chat', 'Улучшенный чат: история, упоминания, вкладки каналов и копирование сообщений.', ['social', 'utility'], ['fabric', 'quilt'], 'vlad_codes', 'required', 'unsupported', 'MIT', false,
    ['Чат хранит до 2000 сообщений', 'Подсветка и звук при упоминании ника', 'Вкладки для личных сообщений и каналов', 'Копирование сообщения по щелчку правой кнопкой']],
  ['mod', 'Bastion Raids', 'Пиглины устраивают рейды на ваши базы: волны, боссы и награды.', ['adventure', 'mobs'], ['forge', 'neoforge'], 'deepslate', 'required', 'required', 'ARR', false,
    ['Рейды начинаются после первого похода в бастион', '5 волн с нарастающей сложностью', 'Босс — Брут-полководец', 'Награды: золотые доспехи с уникальными чарами']],
  ['modpack', 'Copper Age', 'Техно-выживание вокруг меди: от первой печи до автоматических фабрик. 180 модов и квесты.', ['technology', 'quests', 'multiplayer'], ['neoforge'], 'sunny_blocks', 'required', 'optional', 'MIT', true,
    ['Около 400 квестов с наградами', 'Сбалансированные рецепты между модами', 'Готовые настройки для сервера', 'Нужно 6 ГБ оперативной памяти']],
  ['modpack', 'Starfall Survival', 'Приключенческая сборка со звёздными подземельями, магией и боссами. 220 модов.', ['adventure', 'magic', 'combat'], ['forge'], 'sunny_blocks', 'required', 'optional', 'ARR', false,
    ['20 боссов и система классов', 'Магия, ковка оружия и питомцы', 'Своя сюжетная линия на 30 часов', 'Нужно 8 ГБ оперативной памяти']],
  ['modpack', 'Lite & Fast', 'Ванильный геймплей, только быстрее: оптимизация и полезные мелочи.', ['lightweight', 'optimization'], ['fabric'], 'nightfox', 'required', 'optional', 'MIT', false,
    ['Только клиентские оптимизации и удобства', 'Работает на 2 ГБ оперативной памяти', 'Подключается к любым ванильным серверам']],
  ['modpack', 'Frontier Hardcore', 'Жёсткое выживание: жажда, температура, переломы и одна жизнь.', ['challenging', 'adventure'], ['fabric'], 'sunny_blocks', 'required', 'optional', 'MIT', false,
    ['Жажда и температура тела', 'Переломы и лечение шинами', 'Одна жизнь и таблица рекордов', 'Отключённые точки возрождения']],
  ['resourcepack', 'Soft Pastel 16x', 'Мягкие пастельные текстуры, по которым всё ещё узнаются ванильные блоки.', ['vanilla-like', '16x', 'cartoon'], ['minecraft'], 'pixelwren', 'required', 'unsupported', 'CC-BY-4.0', true,
    ['Перерисованы все блоки и предметы', 'Пастельные мобы и интерфейс', 'Совместим с OptiFine CTM для стекла']],
  ['resourcepack', 'Crisp Classic', 'Ванильные текстуры с аккуратными контурами и чистой палитрой.', ['vanilla-like', '16x'], ['minecraft'], 'pixelwren', 'required', 'unsupported', 'CC-BY-4.0', false,
    ['Те же текстуры, но без шума', 'Улучшенная читаемость руд', 'Поддержка всех версий с 1.16']],
  ['resourcepack', 'Stonehold 32x', 'Средневековый ресурспак: камень, дерево и кованое железо в 32 пикселя.', ['themed', '32x', 'realistic'], ['minecraft'], 'mira_dev', 'required', 'unsupported', 'ARR', false,
    ['Средневековый стиль для всех блоков', 'Свои модели для дверей и фонарей', 'Тематический интерфейс из пергамента']],
  ['resourcepack', 'Clean GUI', 'Тёмный минималистичный интерфейс для инвентаря, меню и сундуков.', ['gui', 'simplistic'], ['minecraft'], 'mira_dev', 'required', 'unsupported', 'MIT', false,
    ['Тёмные меню и инвентарь', 'Контрастные слоты и подсказки', 'Совместим с большинством модов']],
  ['shader', 'Dawnlight', 'Тёплый рассеянный свет, мягкие тени и объёмные облака. Работает даже на ноутбуках.', ['semi-realistic', 'atmosphere', 'low'], ['iris', 'optifine'], 'aurora_lab', 'required', 'unsupported', 'MIT', true,
    ['Мягкие тени с плавными краями', 'Объёмные облака и туман над водой', 'Четыре пресета производительности', '60 кадров на встроенной графике в пресете «Низкий»']],
  ['shader', 'Velvet Fog', 'Атмосферные шейдеры с плотным туманом, лучами света и осенней палитрой.', ['fantasy', 'atmosphere', 'medium'], ['iris'], 'aurora_lab', 'required', 'unsupported', 'MPL-2.0', false,
    ['Объёмный туман в лесах и болотах', 'Лучи света сквозь листву', 'Тёплая осенняя цветокоррекция']],
  ['shader', 'Glasswater', 'Реалистичная вода с отражениями и каустикой.', ['realistic', 'reflections', 'high'], ['iris', 'optifine'], 'nightfox', 'required', 'unsupported', 'LGPL-3.0', false,
    ['Отражения в экранном пространстве', 'Каустика на дне водоёмов', 'Волны зависят от погоды']],
  ['shader', 'Pathlight RT', 'Трассировка путей для мощных видеокарт: глобальное освещение и честные отражения.', ['path-tracing', 'realistic', 'high'], ['iris'], 'aurora_lab', 'required', 'unsupported', 'ARR', false,
    ['Глобальное освещение без запекания', 'Свет от светящихся блоков в реальном времени', 'Нужна видеокарта уровня RTX 3070 и выше']],
  ['shader', 'Toon Shade', 'Мультяшный цел-шейдинг с контурами и плоским освещением.', ['cartoon', 'potato'], ['iris', 'optifine', 'canvas'], 'pixelwren', 'required', 'unsupported', 'MIT', false,
    ['Контуры вокруг блоков и мобов', 'Плоские тени в три тона', 'Почти не влияет на FPS']],
  ['plugin', 'LandClaim', 'Приват территорий золотой лопатой: флаги, доверенные игроки и аренда участков.', ['management', 'economy'], ['paper', 'spigot', 'purpur', 'folia'], 'kotofey', 'unsupported', 'required', 'MIT', true,
    ['Приват выделением золотой лопатой', 'Флаги: PvP, огонь, взрывы, вход', 'Аренда и продажа участков', 'Поддержка Folia и регионального тикания']],
  ['plugin', 'TradeHall', 'Аукцион и рынок игроков с удобным меню, комиссиями и историей сделок.', ['economy'], ['paper', 'spigot', 'purpur'], 'kotofey', 'unsupported', 'required', 'MIT', false,
    ['Аукцион и мгновенные продажи', 'Настраиваемые комиссии', 'История сделок и возврат просроченных лотов']],
  ['plugin', 'SimpleHomes', 'Команды /home, /warp и /spawn с лимитами по группам и задержкой телепорта.', ['utility', 'management'], ['paper', 'spigot', 'bukkit', 'purpur'], 'kotofey', 'unsupported', 'required', 'Apache-2.0', false,
    ['Лимиты точек дома по группам прав', 'Задержка и отмена телепорта при движении', 'Хранение в SQLite или MySQL']],
  ['plugin', 'ProxyGuard', 'Защита сети на Velocity: антибот, белые списки и ограничение подключений.', ['management', 'utility'], ['velocity'], 'vlad_codes', 'unsupported', 'required', 'GPL-3.0', false,
    ['Капча при подозрительном входе', 'Лимит подключений с одного адреса', 'Белые списки по серверам сети']],
  ['datapack', 'Graves', 'После смерти появляется надгробие с вашими вещами. Алмазы больше не пропадают.', ['game-mechanics', 'utility'], ['datapack'], 'vlad_codes', 'optional', 'required', 'CC0-1.0', true,
    ['Надгробие хранит предметы и опыт', 'Координаты смерти в чате', 'Работает без модов, даже на Realms']],
  ['datapack', 'Wandering Merchant+', 'Странствующий торговец с редкими товарами и картами сокровищ.', ['economy', 'adventure'], ['datapack'], 'vlad_codes', 'optional', 'required', 'MIT', false,
    ['Товары меняются каждую игровую неделю', 'Карты к затонувшим кораблям и подземельям', 'Торговец приходит чаще к опытным игрокам']],
  ['datapack', 'Seasons', 'Четыре сезона: листва меняет цвет, зимой идёт снег, осенью растёт урожай.', ['worldgen', 'game-mechanics'], ['datapack'], 'vlad_codes', 'optional', 'required', 'MIT', false,
    ['Сезон длится 7 игровых дней', 'Зимой замерзают реки', 'Урожайность зависит от сезона']],
];
const CHANGELOG_POOL = [
  'Исправлен вылет при входе в мир на некоторых видеокартах', 'Обновлены переводы, спасибо сообществу', 'Чанки загружаются быстрее',
  'Исправлена утечка памяти при смене измерений', 'Новые параметры в меню настроек', 'Исправлено мерцание текстур вдали',
  'Совместимость с последними версиями популярных модов', 'Переработан экран настроек', 'Добавлено пять новых предметов',
  'Мелкие исправления и чистка кода', 'Исправлена рассинхронизация с сервером', 'Уменьшен размер файла',
];
const GALLERY_TITLES = ['Закат над равниной', 'Пещера на глубине −40', 'База в горах', 'Деревня у реки', 'Ночной лес', 'Вид с высоты', 'Берег океана', 'Утро в тайге'];
const INSTALL_TEXT = {
  mod: (l) => `1. Установите загрузчик ${l} для нужной версии Minecraft.\n2. Скачайте файл на вкладке «Версии».\n3. Положите его в папку \`mods\` в каталоге игры.`,
  modpack: () => '1. Скачайте архив сборки.\n2. Импортируйте его в лаунчер, который поддерживает сборки (Prism Launcher, ATLauncher и другие).\n3. Выделите сборке столько памяти, сколько указано в описании.',
  resourcepack: () => '1. Скачайте архив и не распаковывайте его.\n2. Положите архив в папку `resourcepacks`.\n3. Включите ресурспак в меню «Настройки → Пакеты ресурсов».',
  shader: () => '1. Установите Iris или OptiFine.\n2. Положите архив в папку `shaderpacks`.\n3. Выберите шейдер в меню «Настройки графики → Шейдеры».',
  plugin: (l) => `1. Остановите сервер на ${l}.\n2. Положите файл в папку \`plugins\`.\n3. Запустите сервер: файл настроек появится в \`plugins/\`.`,
  datapack: () => '1. Скачайте архив.\n2. Положите его в папку `datapacks` внутри папки мира.\n3. Выполните `/reload` или перезайдите в мир.',
};
function seedDescription(p, features, r) {
  const loaderName = LOADERS[p.loaders[0]]?.label || '';
  return [
    `## Возможности`, ...features.map((f) => `- ${f}`), '',
    `## Установка`, INSTALL_TEXT[p.type](loaderName), '',
    `## Совместимость`,
    `Проверено на Minecraft ${p.gameVersions.slice(-1)[0]}–${p.gameVersions[0]}. Сообщайте об ошибках через трекер задач: прикладывайте лог и список установленных модов.`, '',
    r() < 0.6 ? `> **Совет.** Перед обновлением делайте резервную копию мира. Это занимает минуту и спасает часы работы.` : `> **Вопросы и предложения** обсуждаем в сообществе проекта, ссылка в боковой панели.`,
    '', '## Частые вопросы',
    `**Можно ли использовать в своей сборке?** ${p.license === 'ARR' ? 'Только с письменного разрешения автора.' : `Да, на условиях лицензии ${LICENSES[p.license]}.`}`, '',
    `**Будет ли порт на другие версии?** Следите за вкладкой «Журнал изменений».`,
  ].join('\n');
}


function seedDemo(db, { adminPassword = 'admin1234', demoPassword = 'demo1234' } = {}) {
  const r = rng(20261006); const t0 = Date.now();
  return tx(db, () => {
    const q = {
      user: db.prepare('INSERT INTO users (id, username, display_name, email, bio, role, avatar, pass_hash, created) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)'),
      project: db.prepare(`INSERT INTO projects (id, slug, type, title, summary, description, icon, categories, client_side, server_side, license, links, owner_id, status, visibility, featured, created, updated, downloads, followers)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'published', 'published', ?, ?, ?, ?, ?)`),
      member: db.prepare('INSERT INTO members (project_id, user_id, role, ord) VALUES (?, ?, ?, ?)'),
      version: db.prepare('INSERT INTO versions (id, project_id, number, name, channel, loaders, game_versions, changelog, published, author_id, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      file: db.prepare('INSERT INTO files (id, version_id, name, size, is_primary, upload_id, ord) VALUES (?, ?, ?, ?, 1, NULL, 0)'),
      gallery: db.prepare('INSERT INTO gallery (id, project_id, gen, upload_id, title, description, featured, ord) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)'),
      stat: db.prepare('INSERT INTO stats (project_id, day, n) VALUES (?, ?, ?)'),
      dep: db.prepare('INSERT OR IGNORE INTO deps (version_id, project_id, type) VALUES (?, ?, ?)'),
    };
    const users = {};
    const mkUser = (username, displayName, bio, role, pass, ageDays) => {
      const id = newId('u_');
      // У авторов-персонажей нет пароля: войти под ними нельзя
      q.user.run(id, username, displayName, `${username}@example.com`, bio, role, pass ? hashPassword(pass) : 'disabled', t0 - ageDays * DAY);
      users[username] = id; return id;
    };
    for (const [n, d, b] of SEED_USERS) mkUser(n, d, b, 'user', null, 300 + Math.floor(r() * 1200));
    const adminId = mkUser('admin', 'Модератор Craftory', 'Слежу за порядком в каталоге.', 'admin', adminPassword, 1500);
    const demoId = mkUser('demo', 'Демо-игрок', 'Играю в выживание с друзьями и собираю сборки.', 'user', demoPassword, 120);
    const authors = Object.keys(users).filter((n) => n !== 'admin' && n !== 'demo');

    const bySlug = {};
    for (const [type, title, summary, cats, loaders, ownerName, client, server, license, featured, features] of SEED_PROJECTS) {
      const ownerId = users[ownerName];
      const ageDays = 40 + Math.floor(r() * 1300); const created = t0 - ageDays * DAY;
      const id = newId('p_'); const slug = slugify(title);
      const links = {};
      if (r() < 0.8) links.source = `https://git.example.com/${ownerName}/${slug}`;
      if (r() < 0.7) links.issues = `https://git.example.com/${ownerName}/${slug}/issues`;
      if (r() < 0.4) links.wiki = `https://wiki.example.com/${slug}`;
      if (r() < 0.5) links.discord = `https://chat.example.com/${slug}`;
      if (r() < 0.25) links.donate = `https://donate.example.com/${ownerName}`;
      const members = [[ownerId, 'Владелец']];
      if (r() < 0.3) members.push([users[pick(r, authors.filter((a) => a !== ownerName))], pick(r, MEMBER_ROLES.slice(1))]);

      const n = 3 + Math.floor(r() * 6);
      let major = r() < 0.4 ? 0 : 1 + Math.floor(r() * 3), minor = Math.floor(r() * 4) + (major === 0 ? 1 : 0), patch = 0;
      const span = Math.min(GAME_VERSIONS.length - 1, 4 + Math.floor(r() * 8));
      const totalDl = Math.floor(Math.exp(7.5 + r() * 7.5) * (featured ? 3 : 1));
      const weights = Array.from({ length: n }, (_, i) => 0.4 + r() + i * 0.3); const wsum = weights.reduce((a, b) => a + b, 0);
      const versions = [];
      for (let i = 0; i < n; i++) {
        if (i > 0) { if (r() < 0.25) { minor++; patch = 0; } else patch++; }
        const number = `${major}.${minor}.${patch}`;
        const center = Math.round((1 - i / Math.max(1, n - 1)) * span); const width = 1 + Math.floor(r() * 3);
        const gvs = GAME_VERSIONS.slice(Math.max(0, center - width + 1), center + 1);
        const vLoaders = loaders.filter((l, li) => li === 0 || r() < 0.75);
        const channel = i === n - 1 && r() < 0.25 ? 'beta' : r() < 0.08 ? 'alpha' : 'release';
        const published = created + Math.round(((i + 0.2) / n) * ageDays * DAY * 0.97);
        const changes = Array.from({ length: 2 + Math.floor(r() * 3) }, () => pick(r, CHANGELOG_POOL)).filter((v, k, a) => a.indexOf(v) === k);
        if (i > 0 && gvs[0] && r() < 0.5) changes.unshift(`Поддержка Minecraft ${gvs[0]}`);
        const loaderTag = type === 'mod' || type === 'plugin' ? `+${vLoaders[0]}` : '';
        const size = type === 'modpack' ? 2e5 + r() * 3e6 : type === 'resourcepack' ? 5e5 + r() * 2e7 : type === 'shader' ? 1e5 + r() * 8e5 : type === 'datapack' ? 2e4 + r() * 2e5 : 1e5 + r() * 6e6;
        versions.push({ id: newId('v_'), number, channel, loaders: vLoaders, gvs, published, changes, downloads: Math.round((totalDl * weights[i]) / wsum), file: `${slug}-${number}${loaderTag}.${TYPES[type].ext}`, size: Math.round(size) });
      }
      const downloads = versions.reduce((a, v) => a + v.downloads, 0);
      const followers = Math.round(downloads / (25 + r() * 120));
      const projLoaders = [...new Set(versions.flatMap((v) => v.loaders))];
      const gameVersions = [...new Set(versions.flatMap((v) => v.gvs))].sort(cmpGV);
      const description = seedDescription({ type, title, license, loaders: projLoaders, gameVersions }, features, r);
      const updated = Math.max(...versions.map((v) => v.published));
      q.project.run(id, slug, type, title, summary, description, JSON.stringify(cats), client, server, license, JSON.stringify(links), ownerId, featured ? 1 : 0, created, updated, downloads, followers);
      members.forEach(([uid, role], i) => q.member.run(id, uid, role, i));
      for (const v of versions) {
        q.version.run(v.id, id, v.number, `${title} ${v.number}`, v.channel, JSON.stringify(v.loaders), JSON.stringify(v.gvs), `### Изменения\n${v.changes.map((c) => `- ${c}`).join('\n')}`, v.published, ownerId, v.downloads);
        q.file.run(newId('f_'), v.id, v.file, v.size);
      }
      const gCount = { shader: 4, resourcepack: 3, modpack: 3, mod: Math.floor(r() * 4), plugin: r() < 0.5 ? 1 : 0, datapack: 1 }[type];
      for (let g = 0; g < gCount; g++) q.gallery.run(newId('g_'), id, hashStr(slug + g), pick(r, GALLERY_TITLES), g === 0 ? `Скриншот с ${title}.` : '', g === 0 ? 1 : 0, g);
      const avg = (totalDl / Math.max(ageDays, 90)) * (1.2 + r());
      for (let d = 0; d < 90; d++) {
        const t = t0 - d * DAY; if (t < created) break;
        q.stat.run(id, dateKey(t), Math.max(0, Math.round(avg * (0.65 + r() * 0.7) * (1 + 0.2 * Math.sin((d / 7) * Math.PI * 2)) * (1 + (90 - d) / 300))));
      }
      bySlug[slug] = { id, ownerId, type, versions };
    }
    // Моды NightFox зависят от Kernel Lib
    const kernel = bySlug['kernel-lib'];
    for (const p of Object.values(bySlug)) if (p.ownerId === kernel.ownerId && p.type === 'mod' && p !== kernel) p.versions.forEach((v) => q.dep.run(v.id, kernel.id, 'required'));
    // Подписки, коллекции, уведомления и жалобы
    const follow = db.prepare('INSERT INTO follows (user_id, project_id, created) VALUES (?, ?, ?)');
    ['lumen-engine', 'pathfinder-map', 'dawnlight', 'graves', 'copper-age'].forEach((s) => follow.run(demoId, bySlug[s].id, t0 - 20 * DAY));
    const col = db.prepare('INSERT INTO collections (id, owner_id, name, description, public, created) VALUES (?, ?, ?, ?, ?, ?)');
    const item = db.prepare('INSERT INTO collection_items (collection_id, project_id, added) VALUES (?, ?, ?)');
    const c1 = newId('c_'); col.run(c1, demoId, 'Выживание с друзьями', 'То, что ставим на наш сервер и себе в клиент.', 1, t0 - 30 * DAY);
    ['lumen-engine', 'pathfinder-map', 'quick-stack', 'graves', 'landclaim'].forEach((s, i) => item.run(c1, bySlug[s].id, t0 - 30 * DAY + i));
    const c2 = newId('c_'); col.run(c2, demoId, 'Красивая картинка', 'Шейдеры и ресурспаки, которые хочу попробовать.', 0, t0 - 9 * DAY);
    ['dawnlight', 'velvet-fog', 'soft-pastel-16x'].forEach((s, i) => item.run(c2, bySlug[s].id, t0 - 9 * DAY + i));
    const notif = db.prepare('INSERT INTO notifications (id, user_id, type, text, link, read, created) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const lumenLast = bySlug['lumen-engine'].versions[bySlug['lumen-engine'].versions.length - 1];
    notif.run(newId('n_'), demoId, 'version', `Вышла версия ${lumenLast.number} проекта Lumen Engine`, `/project/lumen-engine/version/${lumenLast.id}`, 0, t0 - 2 * 3600e3);
    notif.run(newId('n_'), demoId, 'info', 'Добро пожаловать в Craftory! Подписывайтесь на проекты, чтобы узнавать о новых версиях.', '/mods', 1, t0 - 100 * DAY);
    const rep = db.prepare("INSERT INTO reports (id, reporter_id, project_id, reason, body, status, created) VALUES (?, ?, ?, ?, ?, 'open', ?)");
    rep.run(newId('r_'), demoId, bySlug['bastion-raids'].id, 'broken', 'Версия для 1.20.1 вылетает при генерации бастиона, лог приложил в трекер.', t0 - 3 * DAY);
    rep.run(newId('r_'), users.mira_dev, bySlug.proxyguard.id, 'other', 'В описании нет ссылки на исходный код, хотя указана GPL-3.0.', t0 - 26 * 3600e3);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', ?)").run(String(t0));
    return { adminId, demoId };
  });
}

/* Без демо-данных: только учётная запись администратора */
function ensureAdmin(db, username, password) {
  if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) return false;
  db.prepare("INSERT INTO users (id, username, display_name, email, bio, role, avatar, pass_hash, created) VALUES (?, ?, ?, ?, '', 'admin', NULL, ?, ?)")
    .run(newId('u_'), username, username, `${username}@localhost`, hashPassword(password), Date.now());
  return true;
}

module.exports = { seedDemo, ensureAdmin };
