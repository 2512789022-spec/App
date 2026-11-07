// 检查 v1.3 规则是否正确写入 index.html
import { readFileSync } from 'node:fs';
const h = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
console.log('style块数量:', (h.match(/<style>/g) || []).length);
console.log('stats composer 规则:', h.includes('body[data-page="stats"] .composer'));
console.log('stats main 规则:', h.includes('body[data-page="stats"] main'));
const i = h.indexOf('body[data-page="stats"] .composer');
console.log('上下文:', JSON.stringify(h.slice(Math.max(0, i - 60), i + 140)));
