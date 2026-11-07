/**
 * clear-seed.mjs — 去掉内置演示任务：
 * 1. SEED 常量清空（新装用户首次打开为空白列表）；
 * 2. 记录 v1.0 内置演示任务的 id 为 LEGACY_SEED_IDS，升级用户打开时自动清除
 *    （只删这 17 条 id，用户自己添加的任务不受影响）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, 'index.html');
let h = readFileSync(FILE, 'utf8');

// 1) 提取当前 SEED 里的任务 id
const m = h.match(/const SEED = \/\*__SEED_TASKS__\*\/(\[[\s\S]*?\]);/);
if (!m) { console.error('未找到 SEED 常量'); process.exit(1); }
const oldTasks = JSON.parse(m[1]);
const ids = oldTasks.map((t) => t.id);
console.log('旧演示任务 id 数:', ids.length);

// 2) 替换：SEED 清空 + LEGACY_SEED_IDS + 迁移函数
const replacement =
  'const SEED = /*__SEED_TASKS__*/[];\n\n' +
  '/* v1.0 内置的演示任务（提取自 daydesk 数据）。升级用户首次打开时自动清除 */\n' +
  'const LEGACY_SEED_IDS = new Set(' + JSON.stringify(ids) + ');\n' +
  'function migrateOldSeed(){\n' +
  '  if (!LEGACY_SEED_IDS.size || !state.tasks.length) return;\n' +
  '  const before = state.tasks.length;\n' +
  '  state.tasks = state.tasks.filter(t => !LEGACY_SEED_IDS.has(t.id));\n' +
  '  if (state.tasks.length !== before) save();\n' +
  '}';
if (!h.includes('LEGACY_SEED_IDS')) {
  h = h.replace(m[0], replacement);
}

// 3) load() 里挂上迁移
const anchor = "      state.settings = Object.assign({ theme:'system' }, s.settings || {});\n      return;";
if (!h.includes('migrateOldSeed();\n      return;')) {
  h = h.replace(anchor, "      state.settings = Object.assign({ theme:'system' }, s.settings || {});\n      migrateOldSeed();\n      return;");
}

writeFileSync(FILE, h);
console.log('SEED 已清空；迁移逻辑已注入 load()');
console.log('验证: SEED空=' + /const SEED = \/\*__SEED_TASKS__\*\*\[\];/.test(h) +
  ', LEGACY_IDS=' + h.includes('LEGACY_SEED_IDS') +
  ', load挂接=' + h.includes('migrateOldSeed();\n      return;'));
