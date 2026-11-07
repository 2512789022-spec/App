// 验证 v1.2 APK：签名、内嵌页面版本、元数据
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = execSync(`"${resolve('bt/aapt.exe')}" dump badging build/signed.apk`, { encoding: 'utf8' });
console.log(out.split('\n').slice(0, 3).join('\n'));
execSync('tar -xf build/signed.apk -C build assets/index.html');
const h = readFileSync('build/assets/index.html', 'utf8');
console.log('内嵌页面含新主题:', h.includes('accent-grad'), '| SEED为空:', h.includes('const SEED = /*__SEED_TASKS__*/[];'));
console.log('五档外观:', h.includes('data-theme-opt="paper"') && h.includes('data-theme-opt="black"'));
console.log('八种强调色:', h.includes('data-accent="pink"') && h.includes('data-accent="lime"'));
