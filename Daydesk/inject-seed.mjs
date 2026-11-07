/**
 * inject-seed.mjs — 将 seed-data.json（由 extract-seed.mjs 生成）注入 index.html
 * 的种子常量，使单文件 App 自带初始数据。仅修改本目录的 index.html。
 *
 * 运行：node inject-seed.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKER = '/*__SEED_TASKS__*/';

const seed = JSON.parse(readFileSync(join(HERE, 'seed-data.json'), 'utf8'));
const file = join(HERE, 'index.html');
let html = readFileSync(file, 'utf8');

const re = new RegExp(MARKER.replace(/[*/]/g, '\\$&') + '\\[[\\s\\S]*?\\]');
if (!re.test(html)) throw new Error('index.html 中未找到种子占位符 ' + MARKER + '[...]');

html = html.replace(re, MARKER + JSON.stringify(seed.tasks));
writeFileSync(file, html);
console.log('注入完成：' + seed.tasks.length + ' 条任务 → index.html');
