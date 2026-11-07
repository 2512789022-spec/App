// 把 index.html 的 <style> 块整体替换为 theme-v12.css 的内容
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const css = readFileSync(join(HERE, 'theme-v13.css'), 'utf8');
const file = join(ROOT, 'index.html');
let h = readFileSync(file, 'utf8');

const start = h.indexOf('<style>');
const end = h.indexOf('</style>');
if (start < 0 || end < 0 || end < start) { console.error('未找到 <style> 块'); process.exit(1); }
h = h.slice(0, start) + '<style>\n' + css + h.slice(end);

writeFileSync(file, h);

// 校验：花括号配平、关键选择器齐全
const style = css;
const open = (style.match(/{/g) || []).length, close = (style.match(/}/g) || []).length;
const need = ['.day.is-sel', '.task.is-done .check', '.composer', '#btnAdd', '.mask.open .sheet',
  '.empty-icon', '.list-btn.danger', '#toast.show', '.pri-dot', '.tag-chip', '.carry-btn',
  '.done-toggle.open', '.progress-fill', '.seg button.on', '.btn-primary'];
const missing = need.filter((s) => !style.includes(s));
console.log('花括号配平:', open === close, `(${open}/${close})`);
console.log('关键选择器缺失:', missing.length ? missing.join(', ') : '无');
console.log('替换完成，新文件大小:', h.length, '字节');
