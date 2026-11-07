// 检查 index.html 中 focusRangeSeg 绑定是否存在
import { readFileSync } from 'node:fs';
const h = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const needle = "$('focusRangeSeg')";
console.log('文件含绑定:', h.includes(needle), '| 出现次数:', h.split(needle).length - 1);
console.log('文件含 renderStats:', h.includes('function renderStats'));
const i = h.indexOf('focusRangeSeg');
console.log('首次出现位置:', i);
if (i > 0) console.log('上下文:', JSON.stringify(h.slice(i - 120, i + 260)));
