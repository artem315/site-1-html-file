/* Общие справочники и утилиты Craftory. Работает и в браузере (глобальные имена),
   и на сервере (module.exports). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
'use strict';
const TYPES = {
  mod: { label: 'Моды', one: 'Мод', acc: 'мод', path: 'mods', ext: 'jar', icon: 'box', folder: 'mods' },
  modpack: { label: 'Сборки', one: 'Сборка', acc: 'сборку', path: 'modpacks', ext: 'zip', icon: 'package', folder: null },
  resourcepack: { label: 'Ресурспаки', one: 'Ресурспак', acc: 'ресурспак', path: 'resourcepacks', ext: 'zip', icon: 'palette', folder: 'resourcepacks' },
  shader: { label: 'Шейдеры', one: 'Шейдер', acc: 'шейдер', path: 'shaders', ext: 'zip', icon: 'sparkles', folder: 'shaderpacks' },
  plugin: { label: 'Плагины', one: 'Плагин', acc: 'плагин', path: 'plugins', ext: 'jar', icon: 'server', folder: 'plugins' },
  datapack: { label: 'Датапаки', one: 'Датапак', acc: 'датапак', path: 'datapacks', ext: 'zip', icon: 'braces', folder: 'datapacks' },
};
const TYPE_BY_PATH = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v.path, k]));
const LOADERS = {
  fabric: { label: 'Fabric', color: '#d5b48f' }, forge: { label: 'Forge', color: '#8f98e8' },
  neoforge: { label: 'NeoForge', color: '#ef925c' }, quilt: { label: 'Quilt', color: '#b98ae8' },
  paper: { label: 'Paper', color: '#e5a14d' }, spigot: { label: 'Spigot', color: '#e2b964' },
  bukkit: { label: 'Bukkit', color: '#e79a63' }, purpur: { label: 'Purpur', color: '#ad8ff0' },
  folia: { label: 'Folia', color: '#8ccf6c' }, velocity: { label: 'Velocity', color: '#5fbfdc' },
  iris: { label: 'Iris', color: '#7f74e0' }, optifine: { label: 'OptiFine', color: '#b78fdc' },
  canvas: { label: 'Canvas', color: '#e39a55' }, vanilla: { label: 'Ванильные', color: '#9aa1ac' },
  minecraft: { label: 'Minecraft', color: '#7fb05c' }, datapack: { label: 'Датапак', color: '#9aa1ac' },
};
const LOADERS_BY_TYPE = {
  mod: ['fabric', 'forge', 'neoforge', 'quilt'], modpack: ['fabric', 'forge', 'neoforge', 'quilt'],
  plugin: ['paper', 'spigot', 'bukkit', 'purpur', 'folia', 'velocity'], shader: ['iris', 'optifine', 'canvas', 'vanilla'],
  resourcepack: ['minecraft'], datapack: ['datapack'],
};
const CAT_COMMON = {
  adventure: 'Приключения', decoration: 'Декор', economy: 'Экономика', equipment: 'Снаряжение', food: 'Еда',
  'game-mechanics': 'Механики', library: 'Библиотека', magic: 'Магия', management: 'Управление', minigame: 'Мини-игры',
  mobs: 'Мобы', optimization: 'Оптимизация', social: 'Общение', storage: 'Хранение', technology: 'Технологии',
  transportation: 'Транспорт', utility: 'Утилиты', worldgen: 'Генерация мира',
};
const CATEGORIES = {
  mod: CAT_COMMON, plugin: CAT_COMMON, datapack: CAT_COMMON,
  modpack: { adventure: 'Приключения', challenging: 'Хардкор', combat: 'Сражения', 'kitchen-sink': 'Всё и сразу', lightweight: 'Лёгкие', magic: 'Магия', multiplayer: 'Мультиплеер', optimization: 'Оптимизация', quests: 'Квесты', technology: 'Технологии' },
  resourcepack: { 'vanilla-like': 'Как в ванилле', realistic: 'Реализм', simplistic: 'Минимализм', themed: 'Тематические', cartoon: 'Мультяшные', gui: 'Интерфейс', fonts: 'Шрифты', audio: 'Звуки', models: 'Модели', '16x': '16x', '32x': '32x', '64x': '64x и выше' },
  shader: { cartoon: 'Мультяшные', fantasy: 'Фэнтези', realistic: 'Реализм', 'semi-realistic': 'Полуреализм', 'vanilla-like': 'Как в ванилле', atmosphere: 'Атмосфера', reflections: 'Отражения', shadows: 'Тени', 'path-tracing': 'Трассировка путей', potato: 'Очень слабые ПК', low: 'Низкие требования', medium: 'Средние требования', high: 'Высокие требования' },
};
const GAME_VERSIONS = ['1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.12.2'];
const LICENSES = {
  MIT: 'MIT', 'Apache-2.0': 'Apache 2.0', 'GPL-3.0': 'GPL 3.0', 'LGPL-3.0': 'LGPL 3.0', 'MPL-2.0': 'MPL 2.0',
  'CC-BY-4.0': 'CC BY 4.0', 'CC0-1.0': 'CC0 (общественное достояние)', ARR: 'Все права защищены',
};
const SIDES = { required: 'Обязательно', optional: 'Необязательно', unsupported: 'Не поддерживается' };
const CHANNELS = { release: 'Релиз', beta: 'Бета', alpha: 'Альфа' };
const STATUSES = { published: 'Опубликован', unlisted: 'По ссылке', draft: 'Черновик', withheld: 'Скрыт модерацией' };
const REPORT_REASONS = { spam: 'Спам', malware: 'Вредоносный код', copyright: 'Нарушение авторских прав', inappropriate: 'Неприемлемый контент', broken: 'Не работает / битые файлы', other: 'Другое' };
const MEMBER_ROLES = ['Владелец', 'Разработчик', 'Художник', 'Тестировщик', 'Переводчик'];
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = (s) => String(s).toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const cmpGV = (a, b) => { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (pb[i] || 0) - (pa[i] || 0); if (d) return d; } return 0; };
function hashStr(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* Статистика ведётся по дням в UTC, чтобы сервер и браузер считали одинаково */
function dateKey(t) { return new Date(t).toISOString().slice(0, 10); }
function plural(n, one, few, many) {
  n = Math.abs(n); const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const LIMITS = { imageBytes: 10 * 1048576, fileBytes: 100 * 1048576, descriptionChars: 100000, changelogChars: 20000 };
return {
  TYPES, TYPE_BY_PATH, LOADERS, LOADERS_BY_TYPE, CATEGORIES, GAME_VERSIONS, LICENSES, SIDES, CHANNELS, STATUSES,
  REPORT_REASONS, MEMBER_ROLES, LIMITS, slugify, cmpGV, hashStr, rng, dateKey, plural,
};
}));
